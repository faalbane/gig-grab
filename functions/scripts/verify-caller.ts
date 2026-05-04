/**
 * Add a phone number to the Twilio Outgoing Caller IDs allowlist.
 *
 * USAGE
 *   pnpm --filter @gig-grab/functions verify-caller +12487472606 "Frank mobile"
 *
 * HOW IT WORKS
 *   1. POSTs to Twilio. Twilio returns a 6-digit validation code.
 *   2. Twilio places a call to the number — the recipient hears
 *      "Please enter the validation code", types the digits we print,
 *      and the number is allowlisted.
 *
 * WHEN TO USE
 *   Dev/team testing only — to unblock outbound calls while the
 *   account-level verified-callers restriction is still in effect.
 *   Don't use this for production candidates; the right answer there
 *   is to get the restriction lifted via Trust Hub + Twilio support.
 */

import twilio from "twilio";

async function main() {
  const phone = process.argv[2];
  const friendlyName = process.argv[3] ?? phone;
  if (!phone) {
    console.error("usage: verify-caller <e164-phone> [friendly-name]");
    process.exit(1);
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.error(
      "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN. Easy way:",
      "\n  set -a && source .env && set +a",
    );
    process.exit(1);
  }

  const client = twilio(sid, token);
  const result = await client.validationRequests.create({
    phoneNumber: phone,
    friendlyName,
  });

  console.log("\n========================================================");
  console.log(" VERIFICATION CALL TO:", phone);
  console.log(" VALIDATION CODE:    ", result.validationCode);
  console.log("========================================================");
  console.log(
    "\nTwilio is calling the number now. Answer the call and type",
    "the validation code on the dial pad. Once accepted, the number",
    "joins Outgoing Caller IDs and outbound calls to it stop being",
    "blocked by error 21216.\n",
  );
}

main().catch((err) => {
  console.error("verify-caller failed:", err.message ?? err);
  process.exit(1);
});
