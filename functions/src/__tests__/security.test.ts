// Run with: pnpm --filter @gig-grab/functions test
//
// Uses Node's built-in test runner so we don't need Vitest as a dep.
// node --import tsx --test functions/src/__tests__/*.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
process.env.PUBLIC_API_URL = "https://api.example.test";

let security: typeof import("../security");

before(async () => {
  security = await import("../security");
});

describe("isAllowedLanguage", () => {
  it("accepts known codes", () => {
    for (const c of ["en", "es", "fr", "hi", "ja", "uk", "tl"]) {
      assert.equal(security.isAllowedLanguage(c), true, `expected ${c} allowed`);
    }
  });
  it("rejects unknown codes", () => {
    for (const c of ["", "javascript", "🚀", "EN", "english", "xx"]) {
      assert.equal(security.isAllowedLanguage(c), false, `expected ${c} rejected`);
    }
  });
});

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips a valid token", () => {
    const sid = "11111111-1111-1111-1111-111111111111";
    const tok = security.signSessionToken(sid);
    assert.equal(security.verifySessionToken(sid, tok), true);
  });

  it("rejects a token bound to a different sessionId", () => {
    const tok = security.signSessionToken("aaaa1111-1111-1111-1111-111111111111");
    assert.equal(
      security.verifySessionToken("bbbb2222-2222-2222-2222-222222222222", tok),
      false,
    );
  });

  it("rejects malformed tokens", () => {
    const sid = "33333333-3333-3333-3333-333333333333";
    for (const bad of ["", "abc", "abc.def.ghi", "9999999999.deadbeef", "1.2"]) {
      assert.equal(security.verifySessionToken(sid, bad), false, `bad token: ${bad}`);
    }
  });

  it("rejects expired tokens", () => {
    const sid = "44444444-4444-4444-4444-444444444444";
    // Token TTL of -10s — already expired the moment it's minted.
    const tok = security.signSessionToken(sid, -10);
    assert.equal(security.verifySessionToken(sid, tok), false);
  });

  it("constant-time comparison resists prefix tampering", () => {
    const sid = "55555555-5555-5555-5555-555555555555";
    const tok = security.signSessionToken(sid);
    const [exp, mac] = tok.split(".");
    const tampered = `${exp}.${"a".repeat(mac.length)}`;
    assert.equal(security.verifySessionToken(sid, tampered), false);
  });
});

describe("checkIpRateLimit", () => {
  it("allows up to 5 requests per IP per minute, then blocks", () => {
    const ip = "192.0.2.123";
    let allowed = 0;
    for (let i = 0; i < 7; i++) {
      if (security.checkIpRateLimit(ip)) allowed++;
    }
    assert.equal(allowed, 5);
  });

  it("isolates buckets per IP", () => {
    assert.equal(security.checkIpRateLimit("192.0.2.200"), true);
    assert.equal(security.checkIpRateLimit("192.0.2.201"), true);
  });
});

describe("ipFromRequest", () => {
  it("prefers the leftmost x-forwarded-for entry", () => {
    const req: any = {
      header(name: string) {
        return name.toLowerCase() === "x-forwarded-for"
          ? "1.2.3.4, 10.0.0.1"
          : undefined;
      },
      ip: "10.0.0.99",
    };
    assert.equal(security.ipFromRequest(req), "1.2.3.4");
  });

  it("falls back to req.ip if no x-forwarded-for", () => {
    const req: any = {
      header(_n: string) {
        return undefined;
      },
      ip: "10.0.0.99",
    };
    assert.equal(security.ipFromRequest(req), "10.0.0.99");
  });
});
