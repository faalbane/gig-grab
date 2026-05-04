# Twilio support — lifting the verified-callers restriction

> **Status (2026-05-04):** Account is `Type: Full`, balance £33.26 GBP, but
> outbound calls fail with error 21216 unless the destination is on the
> Outgoing Caller IDs allowlist. Need Twilio support to lift the
> verified-callers requirement before we can call real candidates.

## Where to file

Direct support case URL (skips the chatbot):
- 👉 **https://help.twilio.com/s/contactsupport**

Or via console: top-right `?` icon → **Contact Support** → **Open a Case**.

**Make sure** the top-left account picker shows **"Overton"**
(SID `ACda818e202ba9491a54b493f8d5bc77c8`) before opening the case.

## Form fields

| Field | What to put |
|---|---|
| **Subject** | `Lift verified caller ID restriction on Full account` |
| **Type of issue** | Account & Billing (or Trust if shown) |
| **Business impact** | `2 - P2 High` (we can't onboard pilot candidates without this; defaults to P3 General which is slower) |
| **CCs** | Add Hafiz / Ali if you want them on the thread |
| **Description** | Paste the body below |

## Description body — paste verbatim

```
Hi Twilio Support,

Account SID: ACda818e202ba9491a54b493f8d5bc77c8 (friendly name: Overton).

Confirmed via the API:
  - account.type   = "Full"
  - account.status = "active"
  - balance        = 33.26 GBP (funded)

Despite this, every outbound voice call to a number not on the
Outgoing Caller IDs list is rejected with error 21216 ("Account not
allowed to call <number>"). The Outgoing Caller IDs list is acting
as an outbound-destination allowlist as if the account were still on
trial. The chatbot tells me upgraded accounts can call any number,
which matches Twilio's documentation, but it isn't matching this
account's actual behaviour.

Could you please remove the verified-callers requirement so we can
place outbound calls to consenting users worldwide?

Use case: voice-AI hiring platform (https://gig-grab.web.app).
Candidates submit their phone number through a consent-gated form,
then our Twilio voice agent calls them back to conduct a short
interview. Calls are placed only after the candidate ticks an
explicit consent checkbox; they can hang up at any time. Estimated
outbound volume: <500 calls/day initially, scaling as we onboard
pilot employers.

Happy to provide for compliance review:
  - Trust Hub Customer Profile (will complete now if not already)
  - Sample consent flow / privacy policy

Thanks,
[Your name]
```

## Run Trust Hub Customer Profile in parallel

Twilio support will almost certainly ask for this. Start it now so the
ticket can close in one round-trip.

👉 https://console.twilio.com/us1/account/trust-hub/customer-profiles

Click **"Create Customer Profile"** → choose **Business** → fill in:

- Legal business name — `Gig-grab Ltd` if registered, your full name + sole trader otherwise
- Business address
- Authorised representative (you)
- Government ID upload

Automated review usually clears within 24 hours.

## Expected timeline

| Step | Typical duration |
|---|---|
| Ticket acknowledged | < 1 hour |
| First human reply (Free Developer Support) | 24–72 hours weekdays |
| Trust Hub review | ~24 hours |
| Restriction lifted (after agent sees Trust Hub status) | Same day as reply |

If pilot launch is within a week, **upgrade to Twilio Production Support
for one month (~$150)** for <12h response + phone. Cancel after.

## While you wait — temporary unblock for testing

Use the dev helper to add team-member numbers to the Outgoing Caller IDs
allowlist. They'll receive a verification call, key in a code, and the
number works for outbound calls.

```bash
cd ~/Documents/gig-grab
set -a && source .env && set +a
pnpm --filter @gig-grab/functions verify-caller "+1XXXXXXXXXX" "Hafiz mobile"
```

Output prints the 6-digit validation code. Recipient answers the call
and types it on their dial pad.

> **Don't use this for real candidates** — it adds an extra "verify your
> number" call before the actual intake call, which destroys the
> "speak it, get hired" UX. The right answer for production is the
> support ticket above.

## Reference: relevant API checks

```bash
# Account type / status
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" \
  | python3 -m json.tool | grep -E '"(type|status|friendly_name)"'

# Account balance
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Balance.json"

# US dialing permissions
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://voice.twilio.com/v1/DialingPermissions/Countries/US"

# List of verified outgoing caller IDs
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/OutgoingCallerIds.json"

# Reproduce error 21216 against an unverified destination
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
  --data-urlencode "To=+1XXXXXXXXXX" \
  --data-urlencode "From=+15515534910" \
  --data-urlencode "Twiml=<Response><Say>Test</Say></Response>"
```

## Things they may also ask about — and the good answers

| Question | Answer |
|---|---|
| What's your use case? | Voice-AI hiring platform; candidates consent before being called. |
| Where do candidates come from? | Web form on gig-grab.web.app + Hafiz outbound; pilot vertical = US hospitality/healthcare. |
| Do you have a privacy policy? | Will publish at /legal/privacy before pilot launch. |
| What's your call volume forecast? | <500/day initially, ramping to ~5K/day during pilot. |
| Are you registered with carrier trust frameworks? | Will complete Trust Hub Customer Profile + Voice Integrity (SHAKEN/STIR) before scaling. |
| What's your average call duration? | ~2 minutes for intake, ~10 minutes for AI screening calls. |
| What's your max concurrency? | <100 simultaneous calls in pilot. |

## What to do once they reply

1. Confirm the verified-callers restriction is lifted on the account.
2. Re-test by calling any non-allowlisted number through `/api/intake/start`.
3. Update memory: mark `feedback_thoroughness.md` or
   `reference_twilio_resources.md` to record that the restriction is gone
   so future sessions don't re-investigate.
4. Then schedule **Voice Integrity** registration (SHAKEN/STIR) so US
   carriers don't tag our calls "Spam Likely" — critical for shift
   workers who won't answer suspicious-looking numbers.
