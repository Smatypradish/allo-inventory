import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const reservation = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Check if reservation has expired but status hasn't been updated yet (lazy check)
    if (
      reservation.status === "PENDING" &&
      new Date(reservation.expiresAt) < new Date()
    ) {
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

      return NextResponse.json({
        ...reservation,
        status: "RELEASED",
      });
    }

    // Enrich with product and warehouse details
    const [product, warehouse] = await Promise.all([
      prisma.product.findUnique({ where: { id: reservation.productId } }),
      prisma.warehouse.findUnique({ where: { id: reservation.warehouseId } }),
    ]);

    return NextResponse.json({
      ...reservation,
      product,
      warehouse,
    });
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservation" },
      { status: 500 }
    );
  }
}
