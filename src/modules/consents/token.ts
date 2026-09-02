import { CONSENT_KINDS, type ConsentKind } from "./schemas";

const DEV_FALLBACK_SECRET = "arkdoctor-dev-consent-secret-not-for-production";

function getSecret(): string {
  const secret = process.env.CONSENT_LINK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CONSENT_LINK_SECRET não configurado");
  }
  return DEV_FALLBACK_SECRET;
}

export interface ConsentClaims {
  accountId: string;
  contactId: string;
  kind: ConsentKind;
}

interface TokenPayload {
  a: string;
  c: string;
  k: string;
  e: number; // expiry, epoch seconds
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function b64url(input: Uint8Array | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function signConsentToken(
  claims: ConsentClaims,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const payload: TokenPayload = {
    a: claims.accountId,
    c: claims.contactId,
    k: claims.kind,
    e: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(await hmac(body, getSecret()));
  return `${body}.${sig}`;
}

export async function verifyConsentToken(
  token: string,
  now: number = Date.now(),
): Promise<ConsentClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64url(await hmac(body, getSecret()));
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.e !== "number" || payload.e * 1000 < now) return null;
  if (!CONSENT_KINDS.includes(payload.k as ConsentKind)) return null;
  if (typeof payload.a !== "string" || typeof payload.c !== "string") return null;

  return { accountId: payload.a, contactId: payload.c, kind: payload.k as ConsentKind };
}
