import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createReservationSchema } from "@/lib/validators";
import { getReservationTTLMinutes } from "@/lib/utils";
import {
  getIdempotentResponse,
  cacheIdempotentResponse,
} from "@/lib/idempotency";

export async function POST(request: NextRequest) {
  try {
    // --- Idempotency check (bonus) ---
    const idempotencyKey = request.headers.get("idempotency-key");
    const cachedResponse = await getIdempotentResponse(idempotencyKey);
    if (cachedResponse) return cachedResponse;

    // --- Validate request body ---
    const body = await request.json();
    const validation = createReservationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = validation.data;
    const ttlMinutes = getReservationTTLMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    // --- Concurrency-safe reservation using SELECT ... FOR UPDATE ---
    // This is the core of the exercise. We use a raw SQL transaction
    // with row-level locking to prevent race conditions.
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Lock the inventory row for this product-warehouse pair.
      // SELECT ... FOR UPDATE acquires an exclusive row lock that blocks
      // other transactions trying to read or modify the same row until
      // this transaction completes.
      const inventoryRows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          total: number;
          reserved: number;
        }>
      >(
        `SELECT id, total, reserved FROM "Inventory" 
         WHERE "productId" = $1 AND "warehouseId" = $2 
         FOR UPDATE`,
        productId,
        warehouseId
      );

      if (inventoryRows.length === 0) {
        return {
          success: false,
          status: 404,
          error: "No inventory found for this product and warehouse",
        };
      }

      const inventory = inventoryRows[0];
      const available = inventory.total - inventory.reserved;

      // Step 2: Check stock availability
      if (available < quantity) {
        return {
          success: false,
          status: 409,
          error: `Insufficient stock. Only ${available} unit(s) available, but ${quantity} requested.`,
          available,
        };
      }

      // Step 3: Increment the reserved counter
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { reserved: { increment: quantity } },
      });

      // Step 4: Create the reservation record
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
        },
      });

      return { success: true, reservation };
    }, {
      maxWait: 15000,
      timeout: 20000,
    });

    // --- Build response ---
    if (!result.success) {
      const responseBody = { error: result.error, available: (result as { available?: number }).available };
      await cacheIdempotentResponse(idempotencyKey, result.status!, responseBody);
      return NextResponse.json(responseBody, { status: result.status });
    }

    const responseBody = {
      message: "Reservation created successfully",
      reservation: result.reservation,
      expiresIn: `${ttlMinutes} minutes`,
    };

    await cacheIdempotentResponse(idempotencyKey, 201, responseBody);
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}
