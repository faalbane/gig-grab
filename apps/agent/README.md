# Gig-grab voice agent

Pipecat pipeline that handles inbound and outbound phone calls for candidate interviews, employer intake, and AI screening.

**Forked from `cozmo-voice-agent`** as a starting point. Files in `src/agent.py`, `src/main.py`, `src/resilience/`, `src/prompts/`, `src/metrics/`, `src/state/` are copied as-is and will be adapted to Gig-grab over Phase 1.

## Adaptations needed (Phase 1)

- [ ] Swap STT: Deepgram Nova-2 → **Nova-3 `multi`** (multilingual code-switching)
- [ ] Swap TTS: Deepgram Aura → **Cartesia Sonic-3** (multilingual)
- [ ] New system prompts:
  - [ ] `prompts/candidate_interview.py` — 8 categories
  - [ ] `prompts/employer_intake.py` — 9 categories
  - [ ] `prompts/ai_screening.py` — 10-min structured screening per job
- [ ] Replace SQLite (`src/db/`) with **Firestore** for candidate/job/match data
- [ ] Drop ShopEase-specific code (knowledge base, order CRUD)
- [ ] Wire structured-output extraction for profile cards / job posts

## Run locally

```bash
pip install -e ".[dev]"
python src/main.py                                   # WebSocket on :8765
python src/main.py --mode server                     # FastAPI on :8080
python src/main.py --mode daily --room-url ...       # WebRTC + PSTN via Twilio
```

See parent `SPEC.md` §3 for the full architecture.
