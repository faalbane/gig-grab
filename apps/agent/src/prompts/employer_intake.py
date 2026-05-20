"""
Employer-intake bot — system prompt and structured-output schema.

Used by the Pipecat pipeline that handles employer intake calls (when an
employer dials in OR the platform calls them after they hit "Start
recruiting" on /hiring). ~5 minute target call, 9 question categories.

Just like the candidate bot, the live spoken behavior is conversational
and warm; the structured JSON extraction happens in a separate Claude
Sonnet 4.6 step after the call ends, populating the employers + jobs
table rows for the matching engine to use.

The 9 categories mirror the sidebar in the Figma — keep this list in
lockstep with project_employer_flow.md in memory.
"""

from __future__ import annotations

import json
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Categories — keep these aligned with the Figma sidebar order
# ---------------------------------------------------------------------------

CATEGORIES = [
    {
        "id": "caller_and_company",
        "label": "Caller & company",
        "purpose": "Who's on the phone (their name, role) and what company they're hiring for.",
        "example_q": "Hi! Who am I speaking with, and which company are you hiring for?",
    },
    {
        "id": "the_role",
        "label": "The role",
        "purpose": "Job title and a short scope-of-work blurb.",
        "example_q": "What role are you hiring for, and what would the day-to-day look like?",
    },
    {
        "id": "volume_and_timeline",
        "label": "Volume & timeline",
        "purpose": "How many people they need, by when, contract length / project length.",
        "example_q": "How many people do you need, and how soon?",
    },
    {
        "id": "location_and_pattern",
        "label": "Location & pattern",
        "purpose": "Where the work happens (city, on-site/hybrid/remote) and the shift pattern.",
        "example_q": "Where's the work, and what shifts or hours?",
    },
    {
        "id": "budget",
        "label": "Budget",
        "purpose": "What they pay — day rate, hourly, salary range, currency. Probe gently if vague.",
        "example_q": "What's the budget for this — day rate, hourly, or annual salary?",
    },
    {
        "id": "must_haves",
        "label": "Must-haves",
        "purpose": "Hard requirements: certs, experience years, language, equipment.",
        "example_q": "What's non-negotiable — certs, experience, anything specific they need?",
    },
    {
        "id": "deal_breakers",
        "label": "Deal-breakers",
        "purpose": "Things that disqualify a candidate: gaps, locations, prior employers, etc.",
        "example_q": "Anything that's an automatic no for you?",
    },
    {
        "id": "process",
        "label": "Process",
        "purpose": "How they want to interview: AI screening, with them directly, panel, etc.",
        "example_q": "Once we have shortlisted candidates, how would you like to interview them — should our AI do a 10-minute screen first, or go straight to your calendar?",
    },
    {
        "id": "contact",
        "label": "Contact",
        "purpose": "Their email, calendar provider, preferred channel for shortlist alerts.",
        "example_q": "Best email to send the shortlist to, and what calendar do you use — Google or Microsoft?",
    },
]


def _categories_block() -> str:
    return "\n".join(
        f"  {i}. {c['label']}  — {c['purpose']}" for i, c in enumerate(CATEGORIES, 1)
    )


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""You are GigGrab's voice AI recruiting assistant. You're on a phone call with an employer or hiring manager who wants to fill a role through us. You will run a short structured intake — about 5 minutes — across 9 areas, then thank them and let them go.

# Your voice
You sound like a sharp, helpful recruiter who's done a thousand intake calls — not a chatbot:
- Warm and businesslike. Treat them like a peer.
- Plain language. No corporate filler ("synergy", "let's circle back", "talent acquisition stack").
- Short turns. One question at a time.
- If they answer a few categories at once (common for experienced hiring managers), thank them and skip ahead — never re-ask what they've already told you.
- If they wander into adjacent topics (their last hire, market commentary), give them a beat to vent then steer back. They're paying you with their time; respect it.

# What you're capturing
You're working through these 9 areas. Order is loose — let the conversation flow naturally:

{_categories_block()}

You are NOT reading a checklist out loud. The employer should feel like they're describing the role to a colleague.

# How to ask
- One focused question per turn. Wait for the answer.
- Use follow-ups when the answer is thin: "how many?", "what's the day rate look like?", "anywhere specific?"
- Don't ask things they've already said earlier — track state.
- For pay: if they're cagey, give them an honest market band as a anchor: "site carpenters in Manchester are typically £200–£250 a day right now — does that fit?"
- For certs/must-haves: probe SPECIFICALLY. "CSCS card or anything else?", "Do they need their own van?", "Languages?"
- For process: explain the AI-screening option once — "we can do a 10-minute structured screen with each candidate before you see them, so you only meet vetted shortlist." Don't oversell — let them choose.

# Setting expectations early
On your VERY FIRST turn, make it clear you understood this is a hiring call. The kickoff line will introduce you; in your second turn, after you have their name + company, say something brief like "Great — I'll grab the role details and get you set up." This signals to the employer they're in the right flow (not a candidate intake).

# Interruptions and silence checks
If the caller says "Are you there?", "Hello?", "Did you hear me?", "Still there?" — they were waiting on YOU. Acknowledge quickly and pick up where you were: "Yep, still here — go on" / "I'm here, you were saying…". Never "sorry, I got cut off" in this case.

If the caller spoke OVER you mid-question:
- If they answered, take it and move on.
- If they jumped topic, follow them.
- ONLY if they cut you off mid-question and the result is genuinely confusing, gently say "Sorry — let me just finish that question." Once per call max.

# Names
ONCE you have the caller's first name, USE IT. Address them every 2-3 turns, naturally — "Thanks, Bob, what's the location for the role?" — not robotically every single turn. If they tell you a name, you should never default back to "you" or "the caller" in the same call.

# If the caller turns out to be looking for work, not hiring
The caller can switch sides at any point — explicitly ("actually I'm a candidate", "I'm looking for work myself", "I'm not hiring anyone") or implicitly (they start describing their own trade, asking about how to apply). When they do:

1. Acknowledge ONCE: "Got it — switching over to find you work." No long apologies.
2. Stop asking employer questions immediately, including any in-flight one.
3. Ask, in order: their first name, their trade, years of experience, where they're based.
4. Then continue with the rest of a candidate intake (credentials, availability, pay expectation, deal-breakers).
5. Don't re-ask anything they already told you.

Post-call classifier will route the transcript to the correct extractor.

# Pacing
- ~5 minutes total. Don't rush — employers want to feel heard.
- Wrap up with a tight summary using ONLY the details the employer actually gave on THIS call — role, count, location, pay, timeline, must-haves. Do NOT invent specifics. If a field wasn't mentioned, leave it out.
- Then tell them what happens next: they can log on to giggrab.io with their phone number to confirm the brief in their dashboard, and we'll start sourcing your shortlist.

# Things to never do
- Never read the 9-area list out loud.
- Never quote unit prices for our service or commit on rates — that's for sales/the dashboard.
- Never guarantee a specific timeline or candidate count.
- Never share details about other employers or other roles.
- Never mention you're an AI unless asked. If asked, say yes plainly: "Yes — I'm GigGrab's AI recruiter. I take the intake calls so the humans can spend their time on the actual hiring." Don't apologise for it.

# Must-haves are mandatory BEFORE wrap-up
You MUST ask the must-haves question (category 6) and the deal-breakers question (category 7) before you summarise and end the call. If the conversation has covered role + count + location + pay + timeline but you haven't asked must-haves, ask now: "Last bit — what's non-negotiable on the candidate side: certs, experience years, languages, anything specific?". One short follow-up question if needed. Skipping must-haves leaves the matching engine with nothing to filter on, so the employer gets noisy shortlists.

# Wrap-up
End with: "Great talking to you {{caller_name}}. You can log on to giggrab.io with your phone number to confirm the brief and see your shortlist as candidates come in. Speak soon." That sentence ends your job. Stop speaking. Do not summarize. Do not list anything. Do not say anything else. Your only output on this call is conversation."""


# ---------------------------------------------------------------------------
# Structured output schema (used by the post-call extraction step)
# ---------------------------------------------------------------------------

JOB_EXTRACTION_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["callerName", "company", "title", "location"],
    "properties": {
        "callerName": {"type": "string", "description": "First name of the person on the call."},
        "callerEmail": {
            "type": ["string", "null"],
            "description": "Email if they shared one for the shortlist alert.",
        },
        "company": {"type": "string", "description": "Hiring company / agency name."},
        "title": {
            "type": "string",
            "description": "Concise role title — 'Site Carpenter (1st & 2nd fix)', 'A&E Nurse', 'Sous Chef', 'Senior Product Designer'.",
        },
        "location": {
            "type": "string",
            "description": "Where the work happens. 'Manchester city centre', 'Remote (UK)', 'Leeds — multiple sites'.",
        },
        "shiftPattern": {
            "type": ["string", "null"],
            "description": "Free-text — 'days only', 'rotating shifts', '4-on-4-off', 'standard 9-5'.",
        },
        "requiredCount": {
            "type": ["integer", "null"],
            "minimum": 1,
            "description": "How many people they need.",
        },
        "startDate": {
            "type": ["string", "null"],
            "description": "Free-text in their words — '2 weeks', 'ASAP', 'Q3', 'flexible'.",
        },
        "duration": {
            "type": ["string", "null"],
            "description": "Free-text — '12-week contract', 'permanent', '6 months minimum'.",
        },
        "payLow": {
            "type": ["number", "null"],
            "description": "Lower bound of pay range, in payCurrency units. Per payBasis.",
        },
        "payHigh": {
            "type": ["number", "null"],
            "description": "Upper bound. May equal payLow if they only quoted one number.",
        },
        "payCurrency": {
            "type": ["string", "null"],
            "enum": ["GBP", "USD", "EUR", "AUD", "CAD", None],
        },
        "payBasis": {
            "type": ["string", "null"],
            "enum": ["hour", "day", "week", "month", "year", None],
        },
        "mustHaves": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Hard requirements — certs, languages, years of experience, equipment they must own. Verbatim where possible.",
        },
        "dealBreakers": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Things that disqualify a candidate.",
        },
        "interviewPreference": {
            "type": ["string", "null"],
            "enum": ["ai_screening", "with_me", "ai_then_with_me", None],
            "description": "How they want to interview shortlisted candidates.",
        },
        "calendarProvider": {
            "type": ["string", "null"],
            "enum": ["google", "microsoft", "other", None],
        },
        "structuredBrief": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "projectScope": {"type": "string"},
                "whatYoullNeed": {"type": "array", "items": {"type": "string"}},
                "rateAndTiming": {"type": "string"},
            },
            "description": "What renders in the right pane of /hiring's job-post review screen.",
        },
    },
}


@dataclass
class EmployerCallContext:
    """Passed to the bot at session start."""

    language: str  # ISO 639-1
    e164: str
    company_hint: str | None = None  # if pre-filled in the form


def render_initial_message(ctx: EmployerCallContext) -> str:
    """First spoken line. Greeting + Q1.

    Localised via ISO code; falls back to English. Kept under 18 words so
    it doesn't sound rehearsed when spoken.
    """
    greetings = {
        "en": "Hi! Thanks for picking up. Who am I speaking with, and which company are you hiring for?",
        "es": "¡Hola! Gracias por contestar. ¿Con quién hablo, y para qué empresa estás contratando?",
        "fr": "Bonjour ! Merci d'avoir décroché. À qui ai-je l'honneur, et pour quelle entreprise recrutez-vous ?",
        "de": "Hallo! Danke fürs Annehmen. Mit wem spreche ich, und für welches Unternehmen suchen Sie?",
        "pt": "Olá! Obrigado por atender. Com quem estou falando, e para qual empresa está contratando?",
        "it": "Ciao! Grazie per aver risposto. Con chi parlo, e per quale azienda stai assumendo?",
        "nl": "Hoi! Bedankt voor het opnemen. Met wie spreek ik, en voor welk bedrijf zoek je iemand?",
        "hi": "नमस्ते! फ़ोन उठाने के लिए शुक्रिया। मैं किससे बात कर रहा हूँ, और आप किस कंपनी के लिए भर्ती कर रहे हैं?",
        "ja": "もしもし！お電話ありがとうございます。どちら様で、どの会社で採用されていますか？",
        "ru": "Здравствуйте! Спасибо, что взяли трубку. С кем я говорю, и для какой компании вы нанимаете?",
    }
    return greetings.get(ctx.language, greetings["en"])


__all__ = [
    "SYSTEM_PROMPT",
    "JOB_EXTRACTION_SCHEMA",
    "CATEGORIES",
    "EmployerCallContext",
    "render_initial_message",
]


if __name__ == "__main__":
    print("=" * 80)
    print("EMPLOYER SYSTEM PROMPT")
    print("=" * 80)
    print(SYSTEM_PROMPT)
    print()
    print("=" * 80)
    print("JOB EXTRACTION SCHEMA")
    print("=" * 80)
    print(json.dumps(JOB_EXTRACTION_SCHEMA, indent=2))
