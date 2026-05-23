import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        // Append connect_timeout so Neon free-tier cold starts don't immediately fail.
        // Neon takes ~4-6s to wake from auto-suspend on the free plan.
        url: `${process.env.DATABASE_URL}&connect_timeout=15`,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Wraps a Prisma call with a single retry on connection-related errors (P1001, P1002).
 * Neon's free tier auto-suspends the compute after ~5 minutes of inactivity.
 * The first request after sleep raises P1001. We wait 3s then retry — by that
 * time the compute has woken up and the second attempt succeeds.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "P1001" || code === "P1002") {
      // Wait 3 seconds for Neon to wake up, then retry once
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await fn();
    }
    throw error;
  }
}
