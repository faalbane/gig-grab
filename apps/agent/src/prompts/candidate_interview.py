"""
Candidate-interview bot — system prompt and structured-output schema.

Used by the Pipecat pipeline that handles inbound candidate calls.
~2 minute target call, 8 question categories, voice-first.

The prompt deliberately:
- Greets in the candidate's chosen language and stays in it (Deepgram
  Nova-3 'multi' allows code-switching mid-utterance).
- Avoids HR/recruiter jargon — talks like a thoughtful person.
- Acknowledges + asks one thing at a time. Never stacks questions.
- Lets the candidate run long if they're sharing useful colour, but
  steers back if they wander off the 11 categories.
- Uses follow-ups, not interrogation: ask "what kind?" rather than
  ticking checkboxes out loud.

The bot's *output* is two-fold:
  1. Spoken turns — short, warm, voice-shaped (no markdown, no lists).
  2. After the call: a structured JSON ProfileExtraction passed to a
     downstream Claude Sonnet 4.6 step that fills the profile_card row.
"""

from __future__ import annotations

import json
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Categories — must match packages/db/src/schema.ts CandidateMatchSignals
# ---------------------------------------------------------------------------

CATEGORIES = [
    {
        "id": "language_and_name",
        "label": "Language & name",
        "purpose": "Confirm the language they're most comfortable in and capture their name.",
        "example_first_q": "Hi! What's your name, and what language are you most comfortable speaking?",
    },
    {
        "id": "trade",
        "label": "Your trade",
        "purpose": "What kind of work they do and how many years they've been doing it.",
        "example_q": "What kind of work do you do — and how long have you been doing it?",
    },
    {
        "id": "certs_and_tickets",
        "label": "Certs & tickets",
        "purpose": "Industry-relevant certifications, tickets, licences, software certs.",
        "example_q": "Any certifications or tickets I should know about — CSCS, NMC PIN, forklift, software certs?",
    },
    {
        "id": "recent_work",
        "label": "Recent work",
        "purpose": "Last 1–3 jobs: where, role, length, anything notable.",
        "example_q": "Tell me about your most recent job — where were you, and how long were you there?",
    },
    {
        "id": "location_and_travel",
        "label": "Location & travel",
        "purpose": "Where they're based and how far they'll travel for work.",
        "example_q": "Where are you based, and how far are you willing to travel for the right gig?",
    },
    {
        "id": "availability",
        "label": "Availability",
        "purpose": "When they can start, notice period, shift willingness.",
        "example_q": "When could you start, and are you flexible on shifts — nights, weekends, that kind of thing?",
    },
    {
        "id": "pay_expectation",
        "label": "Pay expectation",
        "purpose": "What they expect to earn — day rate, hourly, salary range, currency.",
        "example_q": "What kind of pay are you looking for? Day rate, hourly or salary — whichever way you think about it.",
    },
    {
        "id": "deal_breakers",
        "label": "Deal-breakers",
        "purpose": "Things that would make them say no — commute, contract type, certain employers, anything.",
        "example_q": "Anything that's a deal-breaker for you — stuff you absolutely won't do or won't accept?",
    },
    {
        "id": "education",
        "label": "Education",
        "purpose": "Highest qualification — degree, diploma, NVQ, apprenticeship, high school. One line.",
        "example_q": "What's the highest education or training you've completed?",
    },
    {
        "id": "languages_spoken",
        "label": "Languages spoken",
        "purpose": "Languages they can work in fluently — not just the call language.",
        "example_q": "What other languages do you speak well enough to work in?",
    },
    {
        "id": "work_auth",
        "label": "Right to work",
        "purpose": "Work-authorization status: citizen, visa, sponsorship need.",
        "example_q": "Right to work — are you a citizen, on a visa, or would you need sponsorship?",
    },
]


def _categories_block() -> str:
    lines = []
    for i, c in enumerate(CATEGORIES, start=1):
        lines.append(f"  {i}. {c['label']}  — {c['purpose']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""You are Sarah, GigGrab's voice AI recruiter. ~2-minute phone intake with a worker. Ask one short question per turn, capture the 11 categories below in any natural order, then wrap up.

# Voice
Warm, peer-level, plain language. Match the caller's language and energy. No corporate speak.

# Length
- ONE sentence per turn. Two short max.
- Greetings + questions under 12 words.
- Never restate what they said unless wrap-up.
- Use their first name every 2-3 turns once you have it.

# Categories to capture (private checklist — don't read aloud)
{_categories_block()}

# How to ask
- One focused question. Wait. Don't ask things they already answered.
- Follow up only when the answer is thin ("what kind?", "for how long?").
- Never ask for DOB, SSN, payment info, or address beyond city.
- Never promise a job.

# NEVER invent details — strict
You MUST only restate or reference things the caller has SAID, on this call, in their own words. Before saying any number, year, employer, certification, location, or detail, check: did they actually say this? If no, ASK instead.
- Don't guess years of experience. If you don't know, ask: "How many years have you been doing that?"
- Don't infer trade, location, or certifications from their name, accent, or phone number.
- Don't fill gaps with "average" / "typical" / placeholder values.
- If a category is empty and you need it, ask one focused question.
- If they don't know or aren't sure ("not sure", "a while"), accept it — note it but don't invent a number.
- If they correct you on anything, apologise briefly, restate using THEIR version, never argue, never say "close enough".
- Wrap-up summary must reference ONLY values the caller stated this call. Skip anything they didn't say — a shorter true summary beats a longer fabricated one.

# Names — strict
NEVER guess, invent, or make up a name. Names are the highest-stakes hallucination because the caller hears it instantly.
- If you do NOT yet have the caller's name, your VERY NEXT question must be: "What's your name?" or "Who am I speaking with?" Do not address them as anything until you have it. Use "you" until then.
- If a system message has provided their profile (returning caller), use the EXACT name string from that profile — do not shorten "Madhav" to "Mads", do not extend "Frank" to "Francis".
- If they say their name and you weren't sure of the spelling, repeat back exactly what they said and ask "Did I get that right?" — don't substitute a similar-sounding common name.
- If they correct you ("it's Maya, not Mariah"), apologise once briefly and use their version going forward. Never argue, never say it's close enough.
- Do NOT infer a name from caller ID, accent, or anything else.

# Apply intent
If they say they want to apply for a role: confirm role + company in one sentence, say "noted — I've added that to your applications", move on.

# If they're HIRING not working
Switch tracks once: "Got it — switching to the hiring side." Then ask: name, company, role, headcount, pay, location, must-haves, timeline. Don't re-ask known info.

# Wrap-up
"Thanks {{name}} — appreciate the time. I'll text you your top 3 matches in a moment. You can also log on to giggrab.io with your phone number to see the full list. Speak soon." That's your last line. Stop."""


# ---------------------------------------------------------------------------
# Structured output schema (used by the post-call extraction step)
# ---------------------------------------------------------------------------

PROFILE_EXTRACTION_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "language", "trade", "yearsExperience"],
    "properties": {
        "name": {"type": "string", "description": "First name only is fine."},
        "language": {
            "type": "string",
            "description": "ISO 639-1 code of the language they spoke most of the call (e.g. 'en', 'es').",
        },
        "trade": {
            "type": "string",
            "description": "Short noun phrase: 'site carpenter', 'A&E nurse', 'sous chef', 'product designer'.",
        },
        "yearsExperience": {"type": "number", "minimum": 0},
        "certs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Verbatim list of certs/tickets they mentioned — 'CSCS Gold', 'IPAF 3a/3b', 'NMC PIN', etc.",
        },
        "recentLocations": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Cities/areas where they've recently worked, in their words.",
        },
        "travelWillingness": {
            "type": ["string", "null"],
            "description": "Free-text — e.g. '1 hour from Manchester', 'remote only', 'within M25'.",
        },
        "availability": {
            "type": ["string", "null"],
            "description": "Free-text — e.g. 'in 2 weeks', 'nights only', 'immediate', '4 weeks notice'.",
        },
        "payFloor": {
            "type": ["number", "null"],
            "description": "Lower bound of pay they'll accept, in payCurrency units. Per-day OR per-year — see payBasis.",
        },
        "payCurrency": {
            "type": ["string", "null"],
            "enum": ["GBP", "USD", "EUR", "AUD", "CAD", None],
        },
        "payBasis": {
            "type": ["string", "null"],
            "enum": ["hour", "day", "week", "month", "year", None],
        },
        "shiftPreferences": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Verbatim — 'days only', 'happy with nights', 'no weekends', 'shifts ok'.",
        },
        "dealBreakers": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Things they explicitly won't do or accept.",
        },
        "summary": {
            "type": "string",
            "description": (
                "1–2 sentence neutral profile summary in third person. "
                "Lead with trade + years + location, follow with notable strengths. "
                "Match the tone of their own description — concise, no flourishes."
            ),
        },
    },
}


@dataclass
class CallContext:
    """Passed to the bot at session start. Drives language + greeting."""

    language: str  # ISO 639-1 (matches DB)
    e164: str
    audience: str = "worker"


def render_initial_message(ctx: CallContext) -> str:
    """The bot's first spoken line. Greeting + Q1.

    Localised by ISO code. Falls back to English. Keep these short — they're
    spoken aloud immediately when the candidate picks up.
    """
    # Each greeting now includes the recording + AI disclosure required by
    # UK GDPR Art. 13 and ICO call-recording guidance. Kept to two short
    # sentences so it stays voice-natural.
    greetings = {
        "en": "Hi — this is GigGrab's AI recruiter, and this call is recorded so we can build your CV. What's your name?",
        "es": "Hola, soy la IA de GigGrab y esta llamada se graba para crear tu CV. ¿Cómo te llamas?",
        "fr": "Bonjour, je suis le recruteur IA de GigGrab — cet appel est enregistré pour créer votre CV. Comment vous appelez-vous ?",
        "de": "Hallo, hier ist GigGrabs KI-Recruiter — der Anruf wird aufgezeichnet, um deinen Lebenslauf zu erstellen. Wie heißt du?",
        "pt": "Olá, sou a IA da GigGrab e esta chamada é gravada para criarmos o seu CV. Qual é o seu nome?",
        "it": "Ciao, sono l'IA di GigGrab e questa chiamata è registrata per creare il tuo CV. Come ti chiami?",
        "nl": "Hoi, dit is GigGrabs AI-recruiter — dit gesprek wordt opgenomen om je cv op te bouwen. Hoe heet je?",
        "hi": "नमस्ते — मैं GigGrab की AI रिक्रूटर हूँ, और यह कॉल रिकॉर्ड हो रही है ताकि हम आपका CV बना सकें। आपका नाम क्या है?",
        "ja": "もしもし。GigGrabのAIリクルーターです。CV作成のため、この通話は録音されています。お名前を教えてください。",
        "ru": "Здравствуйте, это ИИ-рекрутер GigGrab — звонок записывается, чтобы составить ваше резюме. Как вас зовут?",
    }
    return greetings.get(ctx.language, greetings["en"])


__all__ = [
    "SYSTEM_PROMPT",
    "PROFILE_EXTRACTION_SCHEMA",
    "CATEGORIES",
    "CallContext",
    "render_initial_message",
]


if __name__ == "__main__":
    # Quick sanity check — run via `python -m src.prompts.candidate_interview`
    print("=" * 80)
    print("SYSTEM PROMPT")
    print("=" * 80)
    print(SYSTEM_PROMPT)
    print()
    print("=" * 80)
    print("PROFILE EXTRACTION SCHEMA")
    print("=" * 80)
    print(json.dumps(PROFILE_EXTRACTION_SCHEMA, indent=2))
