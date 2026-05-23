import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Verify the cron secret to prevent unauthorized access
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // On Vercel Pro, CRON_SECRET is injected automatically.
    // On free tier, you must set it manually in env vars.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();

    // Find all expired PENDING reservations
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    });

    if (expiredReservations.length === 0) {
      return NextResponse.json({
        message: "No expired reservations to process",
        processed: 0,
      });
    }

    // Release all expired reservations in a transaction
    await prisma.$transaction(async (tx) => {
      for (const reservation of expiredReservations) {
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED" },
        });

        await tx.inventory.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: {
            reserved: { decrement: reservation.quantity },
          },
        });
      }
    });

    return NextResponse.json({
      message: `Released ${expiredReservations.length} expired reservation(s)`,
      processed: expiredReservations.length,
      releasedIds: expiredReservations.map((r) => r.id),
    });
  } catch (error) {
    console.error("Error in expiry cron:", error);
    return NextResponse.json(
      { error: "Failed to process expired reservations" },
      { status: 500 }
    );
  }
}
