import { describe, it, expect, vi, afterEach } from "vitest";
import { signConsentToken, verifyConsentToken, type ConsentClaims } from "./token";

const claims: ConsentClaims = {
  accountId: "acc-1",
  contactId: "contact-1",
  kind: "tcle",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consent token", () => {
  it("round-trips valid claims", async () => {
    const token = await signConsentToken(claims, 3600);
    expect(await verifyConsentToken(token)).toEqual(claims);
  });

  it("rejects an expired token", async () => {
    const past = Date.now() - 10_000;
    const token = await signConsentToken(claims, 1, past);
    expect(await verifyConsentToken(token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signConsentToken(claims, 3600);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ a: "acc-2", c: "contact-1", k: "tcle", e: 9999999999 }),
    ).toString("base64url");
    expect(await verifyConsentToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifyConsentToken(`${body}.AAAA`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    vi.stubEnv("CONSENT_LINK_SECRET", "secret-a");
    const token = await signConsentToken(claims, 3600);
    vi.stubEnv("CONSENT_LINK_SECRET", "secret-b");
    expect(await verifyConsentToken(token)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyConsentToken("not-a-token")).toBeNull();
    expect(await verifyConsentToken("")).toBeNull();
  });
});
