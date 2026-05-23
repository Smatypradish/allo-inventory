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
    const inventoryUpdates = new Map<string, { productId: string; warehouseId: string; quantity: number }>();
    for (const r of expiredReservations) {
      const key = `${r.productId}_${r.warehouseId}`;
      const existing = inventoryUpdates.get(key);
      if (existing) {
        existing.quantity += r.quantity;
      } else {
        inventoryUpdates.set(key, {
          productId: r.productId,
          warehouseId: r.warehouseId,
          quantity: r.quantity,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Bulk update all expired reservations to RELEASED
      await tx.reservation.updateMany({
        where: { id: { in: expiredReservations.map((r) => r.id) } },
        data: { status: "RELEASED" },
      });

      // Update the inventory for each unique product-warehouse pair
      for (const update of inventoryUpdates.values()) {
        await tx.inventory.updateMany({
          where: {
            productId: update.productId,
            warehouseId: update.warehouseId,
          },
          data: {
            reserved: { decrement: update.quantity },
          },
        });
      }
    }, {
      maxWait: 15000,
      timeout: 20000,
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
