import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // First, do lazy expiry: release any expired PENDING reservations
    // This ensures stock counts are accurate even if the cron hasn't run yet
    const now = new Date();

    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    });

    if (expiredReservations.length > 0) {
      // Release expired reservations in a transaction
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
    }

    // Now fetch products with their inventory and warehouse info
    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Transform to include available stock
    const result = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      sku: product.sku,
      imageUrl: product.imageUrl,
      inventory: product.inventory.map((inv) => ({
        id: inv.id,
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        warehouseLocation: inv.warehouse.location,
        total: inv.total,
        reserved: inv.reserved,
        available: inv.total - inv.reserved,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
