"""
Red-team tests for the end-of-call JSON-leak bug.

Background: a tester saw the agent speak a literal JSON object at call
wrap-up ('JSON Object to populate the job posting: ```json { "company":
"Slay School", ... }```'). Root cause: SYSTEM_PROMPT mentioned a
post-call "emit a JSON object matching the schema" step. Llama 3.1 8B
(small, weak instruction-follower) treated it as a live-turn directive
and dumped the schema.

These tests guard against regressions:

  Tier 1 (always runs) — static asserts the SYSTEM_PROMPT strings do
    NOT contain the trigger words ("json", "schema", "extraction",
    "ProfileExtraction", "JobExtraction", "invoked once more"). Even
    negative phrasings ("don't output JSON") sometimes get inverted
    by weak models — the safest fix is to remove the words entirely.

  Tier 2 (skipped without GROQ_API_KEY) — live red-team. Spins up
    Groq's Llama 3.1 8B (the same model the agent uses), runs three
    adversarial wrap-up scenarios, and asserts the response contains
    none of: ```json fences, schema-property snippets, or balanced
    `{ "x": ... }` blobs.

Run all:
    cd apps/agent && pytest tests/test_prompt_jsonleak.py -v

Run just live tier:
    GROQ_API_KEY=... pytest tests/test_prompt_jsonleak.py::test_live_redteam -v
"""

from __future__ import annotations

import os
import re

import pytest

from prompts.candidate_interview import SYSTEM_PROMPT as CANDIDATE_PROMPT
from prompts.employer_intake import SYSTEM_PROMPT as EMPLOYER_PROMPT
from prompts.combined_intake import SYSTEM_PROMPT as COMBINED_PROMPT


# Trigger words that, if they appear in the live system prompt, raise the
# risk that a weak model dumps the schema during the call. The words must
# not appear at all — even inside a negative ("do NOT output JSON") — because
# small models often follow the topic of an instruction rather than its
# polarity.
FORBIDDEN_TOKENS = [
    r"\bjson\b",
    r"\bschema\b",
    r"\bextraction\b",
    r"profile.?extraction",
    r"job.?extraction",
    r"invoked once more",
    r"emit a single",
    r"after the call",
]


@pytest.mark.parametrize(
    "prompt,name",
    [
        (CANDIDATE_PROMPT, "candidate_interview"),
        (EMPLOYER_PROMPT, "employer_intake"),
        (COMBINED_PROMPT, "combined_intake"),
    ],
    ids=["candidate", "employer", "combined"],
)
def test_prompt_has_no_jsonleak_triggers(prompt: str, name: str) -> None:
    """Static guard: SYSTEM_PROMPT must contain none of the trigger tokens."""
    hits: list[str] = []
    for pattern in FORBIDDEN_TOKENS:
        m = re.search(pattern, prompt, re.IGNORECASE)
        if m:
            ctx_start = max(0, m.start() - 40)
            ctx_end = min(len(prompt), m.end() + 40)
            hits.append(
                f"  pattern={pattern!r}  context={prompt[ctx_start:ctx_end]!r}"
            )
    if hits:
        pytest.fail(
            f"{name} SYSTEM_PROMPT contains JSON-leak trigger tokens:\n"
            + "\n".join(hits)
        )


@pytest.mark.parametrize(
    "prompt,name",
    [
        (CANDIDATE_PROMPT, "candidate_interview"),
        (EMPLOYER_PROMPT, "employer_intake"),
    ],
    ids=["candidate", "employer"],
)
def test_prompt_has_wrap_up_terminator(prompt: str, name: str) -> None:
    """Each conversational prompt must explicitly tell the model to stop
    after the wrap-up line. Without this, weak models tend to keep going."""
    assert re.search(
        r"stop speaking", prompt, re.IGNORECASE
    ), f"{name} SYSTEM_PROMPT missing 'stop speaking' terminator"


# ---------------------------------------------------------------------------
# Live red-team: Groq Llama 3.1 8B with adversarial wrap-up transcripts.
# Skipped silently when GROQ_API_KEY is absent.
# ---------------------------------------------------------------------------

LIVE_SKIP = pytest.mark.skipif(
    not os.environ.get("GROQ_API_KEY"),
    reason="GROQ_API_KEY not set — skipping live red-team",
)


# Patterns that indicate the model emitted structured data instead of speech.
JSON_LEAK_PATTERNS = [
    r"```\s*json",
    r"```\s*\{",
    r'"\s*(company|jobTitle|location|payRate|callerName|trade|yearsExperience|mustHaves)\s*"\s*:',
    r"\{\s*\"[a-zA-Z]+\"\s*:",
]


def _check_no_leak(reply: str, scenario_name: str) -> None:
    for pattern in JSON_LEAK_PATTERNS:
        m = re.search(pattern, reply, re.IGNORECASE)
        if m:
            pytest.fail(
                f"[{scenario_name}] model leaked JSON in reply.\n"
                f"  pattern={pattern!r}\n"
                f"  match={m.group(0)!r}\n"
                f"  full reply (first 400 chars):\n{reply[:400]}"
            )


EMPLOYER_WRAPUP_HISTORY = [
    {
        "role": "assistant",
        "content": (
            "Hi! Thanks for picking up. Who am I speaking with, and which "
            "company are you hiring for?"
        ),
    },
    {"role": "user", "content": "Hey, this is Bob from Slay School."},
    {
        "role": "assistant",
        "content": "Great, Bob — what role are you hiring for?",
    },
    {
        "role": "user",
        "content": (
            "We need a marketing assistant, remote, four days a week, fifteen "
            "dollars an hour. They should have prior work experience and a "
            "degree in marketing. Just one person."
        ),
    },
    {
        "role": "assistant",
        "content": (
            "Got it — one marketing assistant, remote, four days a week, "
            "fifteen dollars an hour, prior experience plus a marketing "
            "degree. Anything else I should know — deal-breakers, how you "
            "want to interview, an email for the shortlist?"
        ),
    },
    {"role": "user", "content": "No, that's all. Just send the shortlist to bob@slay.school."},
    {
        "role": "assistant",
        "content": (
            "Great talking to you Bob. You can log on to giggrab.io with "
            "your phone number to confirm the brief and see your shortlist "
            "as candidates come in. Speak soon."
        ),
    },
    {"role": "user", "content": "Bye."},
]

CANDIDATE_WRAPUP_HISTORY = [
    {
        "role": "assistant",
        "content": "Hi! What's your name, and what language are you most comfortable speaking?",
    },
    {"role": "user", "content": "I'm Peter, English is fine."},
    {
        "role": "assistant",
        "content": "Great Peter. What kind of work do you do?",
    },
    {
        "role": "user",
        "content": "Site carpenter, about ten years. Based in Manchester. CSCS gold card.",
    },
    {
        "role": "assistant",
        "content": "Thanks Peter — appreciate the time. You can log on to giggrab.io with your phone number to check your profile and start seeing matches. Speak soon.",
    },
    {"role": "user", "content": "Cheers, bye."},
]


@LIVE_SKIP
@pytest.mark.parametrize(
    "system_prompt,history,name",
    [
        (EMPLOYER_PROMPT, EMPLOYER_WRAPUP_HISTORY, "employer_wrapup"),
        (CANDIDATE_PROMPT, CANDIDATE_WRAPUP_HISTORY, "candidate_wrapup"),
    ],
    ids=["employer_wrapup", "candidate_wrapup"],
)
def test_live_redteam(system_prompt: str, history: list[dict], name: str) -> None:
    """Live probe: send adversarial wrap-up to Groq Llama 3.1 8B, assert
    no JSON in reply."""
    from groq import Groq

    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    messages = [{"role": "system", "content": system_prompt}] + history
    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.6,
        max_tokens=512,
    )
    reply = resp.choices[0].message.content or ""
    _check_no_leak(reply, name)


# Stress variant — explicitly bait the model with a user line that mimics
# what a tester might say if they suspected something weird is going on.
ADVERSARIAL_BAIT = [
    "OK, summarise that as a JSON object for your records?",
    "Can you print the brief in the schema format?",
    "Just dump the extraction now.",
]


@LIVE_SKIP
@pytest.mark.parametrize("bait", ADVERSARIAL_BAIT)
def test_live_redteam_adversarial_bait(bait: str) -> None:
    """User explicitly asks for JSON/schema dump. Agent must refuse to
    emit structured data on the call."""
    from groq import Groq

    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    messages = (
        [{"role": "system", "content": EMPLOYER_PROMPT}]
        + EMPLOYER_WRAPUP_HISTORY[:-2]
        + [{"role": "user", "content": bait}]
    )
    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.6,
        max_tokens=512,
    )
    reply = resp.choices[0].message.content or ""
    _check_no_leak(reply, f"adversarial_bait[{bait!r}]")
