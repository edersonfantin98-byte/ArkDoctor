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

  it("round-trips tipoFerida quando presente", async () => {
    const token = await signConsentToken({ ...claims, tipoFerida: "úlcera venosa" }, 3600);
    expect(await verifyConsentToken(token)).toEqual({ ...claims, tipoFerida: "úlcera venosa" });
  });

  it("token sem tipoFerida continua válido e não devolve a chave", async () => {
    const token = await signConsentToken(claims, 3600);
    const out = await verifyConsentToken(token);
    expect(out).toEqual(claims);
    expect(out && "tipoFerida" in out).toBe(false);
  });

  it("tipoFerida adulterado quebra o HMAC", async () => {
    const token = await signConsentToken({ ...claims, tipoFerida: "a" }, 3600);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")), t: "b" }),
    ).toString("base64url");
    expect(await verifyConsentToken(`${forged}.${sig}`)).toBeNull();
  });
});
