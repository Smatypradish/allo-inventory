import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Already confirmed — releasing a confirmed reservation is a no-op, not an error.
    // The units have been permanently sold and cannot be released back.
    if (reservation.status === "CONFIRMED") {
      return NextResponse.json({
        message: "Reservation is already confirmed. Release is a no-op.",
        reservation,
      });
    }

    // Already released — idempotent no-op
    if (reservation.status === "RELEASED") {
      return NextResponse.json({
        message: "Reservation is already released",
        reservation,
      });
    }

    // --- Release: units go back to available stock ---
    // reserved -= quantity (units are no longer held)
    // total stays the same (units are still physically in the warehouse)
    const releasedReservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.reservation.update({
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

      return updated;
    });

    return NextResponse.json({
      message: "Reservation released — units are available again",
      reservation: releasedReservation,
    });
  } catch (error) {
    console.error("Error releasing reservation:", error);
    return NextResponse.json(
      { error: "Failed to release reservation" },
      { status: 500 }
    );
  }
}
