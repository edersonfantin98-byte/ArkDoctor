import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Per-IP rate limit for the public booking form, backed by the BOOKING_RATE_LIMIT
 * Workers binding (see wrangler.toml). Fails open when the binding is unavailable
 * (e.g. `next dev`) so infra hiccups never lock out legitimate users.
 */
export async function withinBookingRateLimit(): Promise<boolean> {
  let limiter: RateLimiter | undefined;
  try {
    limiter = (getCloudflareContext().env as Record<string, unknown>)
      .BOOKING_RATE_LIMIT as RateLimiter | undefined;
  } catch {
    return true;
  }
  if (!limiter) return true;

  const ip = (await headers()).get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: ip });
  return success;
}
