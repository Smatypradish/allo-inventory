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
      // Group inventory decrements by product-warehouse combination
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

      // Release expired reservations and update inventory in a transaction
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
