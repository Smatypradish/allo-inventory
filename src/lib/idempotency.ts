import { redis } from "./redis";
import { NextResponse } from "next/server";

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * Check if an idempotent response exists for the given key.
 * Returns the cached NextResponse if found, null otherwise.
 */
export async function getIdempotentResponse(
  key: string | null
): Promise<NextResponse | null> {
  if (!key) return null;

  try {
    const cached = await redis.get<CachedResponse>(`idempotency:${key}`);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  } catch {
    // Redis unavailable — proceed without idempotency
    console.warn("Redis unavailable for idempotency check");
  }

  return null;
}

/**
 * Cache a response for the given idempotency key.
 */
export async function cacheIdempotentResponse(
  key: string | null,
  status: number,
  body: unknown
): Promise<void> {
  if (!key) return;

  try {
    await redis.set(
      `idempotency:${key}`,
      { status, body } as CachedResponse,
      { ex: IDEMPOTENCY_TTL_SECONDS }
    );
  } catch {
    console.warn("Redis unavailable for idempotency cache");
  }
}
