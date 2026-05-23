import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "Mumbai Central Warehouse",
        location: "Mumbai, Maharashtra",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Bangalore Tech Hub",
        location: "Bangalore, Karnataka",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Delhi Distribution Center",
        location: "New Delhi, Delhi",
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses`);

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wellness Kit Alpha",
        description:
          "A comprehensive wellness kit with essential health supplements and monitoring tools for daily well-being.",
        price: 999,
        sku: "WK-001",
        imageUrl: "https://placehold.co/400x300/4F46E5/FFFFFF?text=Wellness+Kit",
      },
    }),
    prisma.product.create({
      data: {
        name: "Health Pack Beta",
        description:
          "Premium health pack featuring curated vitamins, minerals, and probiotics for optimal health.",
        price: 1499,
        sku: "HP-002",
        imageUrl: "https://placehold.co/400x300/059669/FFFFFF?text=Health+Pack",
      },
    }),
    prisma.product.create({
      data: {
        name: "Care Bundle Gamma",
        description:
          "Essential care bundle with personal hygiene products and skincare essentials.",
        price: 749,
        sku: "CB-003",
        imageUrl: "https://placehold.co/400x300/DC2626/FFFFFF?text=Care+Bundle",
      },
    }),
    prisma.product.create({
      data: {
        name: "Premium Set Delta",
        description:
          "Our top-tier premium set with advanced health monitoring devices and supplements.",
        price: 2199,
        sku: "PS-004",
        imageUrl: "https://placehold.co/400x300/7C3AED/FFFFFF?text=Premium+Set",
      },
    }),
    prisma.product.create({
      data: {
        name: "Essential Box Epsilon",
        description:
          "Budget-friendly essentials box with must-have health and wellness products.",
        price: 599,
        sku: "EB-005",
        imageUrl: "https://placehold.co/400x300/EA580C/FFFFFF?text=Essential+Box",
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create inventory for each product-warehouse pair with varied stock levels
  const stockLevels = [
    // [productIndex, warehouseIndex, total]
    [0, 0, 50], [0, 1, 35], [0, 2, 20],
    [1, 0, 30], [1, 1, 45], [1, 2, 25],
    [2, 0, 60], [2, 1, 40], [2, 2, 55],
    [3, 0, 15], [3, 1, 10], [3, 2, 8],
    [4, 0, 100], [4, 1, 80], [4, 2, 90],
  ];

  const inventoryRecords = await Promise.all(
    stockLevels.map(([pIdx, wIdx, total]) =>
      prisma.inventory.create({
        data: {
          productId: products[pIdx].id,
          warehouseId: warehouses[wIdx].id,
          total: total,
          reserved: 0,
        },
      })
    )
  );

  console.log(`✅ Created ${inventoryRecords.length} inventory records`);
  console.log("\n🎉 Seeding complete! Database is ready.");

  // Print summary
  console.log("\n📊 Summary:");
  for (const product of products) {
    console.log(`  ${product.name} (${product.sku}) — ₹${product.price}`);
    const stocks = stockLevels
      .filter(([pIdx]) => products[pIdx].id === product.id)
      .map(([, wIdx, total]) => `    ${warehouses[wIdx].name}: ${total} units`);
    stocks.forEach((s) => console.log(s));
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
