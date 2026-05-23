import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getIdempotentResponse,
  cacheIdempotentResponse,
} from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // --- Idempotency check (bonus) ---
    const idempotencyKey = request.headers.get("idempotency-key");
    const cachedResponse = await getIdempotentResponse(idempotencyKey);
    if (cachedResponse) return cachedResponse;

    // Fetch the reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Already confirmed — idempotent no-op
    if (reservation.status === "CONFIRMED") {
      const responseBody = {
        message: "Reservation is already confirmed",
        reservation,
      };
      return NextResponse.json(responseBody);
    }

    // Already released — cannot confirm
    if (reservation.status === "RELEASED") {
      const responseBody = {
        error: "Reservation has been released and cannot be confirmed",
      };
      return NextResponse.json(responseBody, { status: 410 });
    }

    // Check if expired
    if (new Date(reservation.expiresAt) < new Date()) {
      // Lazily release the expired reservation
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED" },
        });

        await tx.inventory.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: { reserved: { decrement: reservation.quantity } },
        });
      });

      const responseBody = {
        error: "Reservation has expired. The held units have been released.",
      };
      await cacheIdempotentResponse(idempotencyKey, 410, responseBody);
      return NextResponse.json(responseBody, { status: 410 });
    }

    // --- Confirm: units are permanently sold ---
    // total -= quantity (units leave the warehouse)
    // reserved -= quantity (no longer reserved, they're sold)
    const confirmedReservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "CONFIRMED" },
      });

      await tx.inventory.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: {
          total: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      });

      return updated;
    });

    const responseBody = {
      message: "Reservation confirmed — purchase complete!",
      reservation: confirmedReservation,
    };

    await cacheIdempotentResponse(idempotencyKey, 200, responseBody);
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Error confirming reservation:", error);
    return NextResponse.json(
      { error: "Failed to confirm reservation" },
      { status: 500 }
    );
  }
}
