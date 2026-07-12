// Seed smartphone catalog: iPhone 15–17 series, Samsung Galaxy S24–S26 series.
// Idempotent — upserts by SKU. Run with: node prisma/seed-phones.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// [name, sku, costPrice, sellingPrice, stock] — prices in KSh
const PHONES = [
  // Apple
  ["iPhone 15 128GB", "IP15-128", 80000, 95000, 10],
  ["iPhone 15 Plus 128GB", "IP15P-128", 89000, 105000, 8],
  ["iPhone 15 Pro 256GB", "IP15PR-256", 115000, 135000, 6],
  ["iPhone 15 Pro Max 256GB", "IP15PM-256", 132000, 155000, 6],
  ["iPhone 16e 128GB", "IP16E-128", 72000, 85000, 12],
  ["iPhone 16 128GB", "IP16-128", 98000, 115000, 10],
  ["iPhone 16 Plus 128GB", "IP16P-128", 106000, 125000, 8],
  ["iPhone 16 Pro 256GB", "IP16PR-256", 128000, 150000, 6],
  ["iPhone 16 Pro Max 256GB", "IP16PM-256", 145000, 170000, 6],
  ["iPhone 17 256GB", "IP17-256", 119000, 140000, 10],
  ["iPhone 17 Air 256GB", "IP17A-256", 132000, 155000, 8],
  ["iPhone 17 Pro 256GB", "IP17PR-256", 149000, 175000, 6],
  ["iPhone 17 Pro Max 256GB", "IP17PM-256", 166000, 195000, 6],
  // Samsung
  ["Samsung Galaxy S24 256GB", "SS-S24-256", 72000, 85000, 10],
  ["Samsung Galaxy S24+ 256GB", "SS-S24P-256", 85000, 100000, 8],
  ["Samsung Galaxy S24 Ultra 256GB", "SS-S24U-256", 110000, 130000, 6],
  ["Samsung Galaxy S24 FE 128GB", "SS-S24FE-128", 59000, 70000, 12],
  ["Samsung Galaxy S25 256GB", "SS-S25-256", 85000, 100000, 10],
  ["Samsung Galaxy S25+ 256GB", "SS-S25P-256", 98000, 115000, 8],
  ["Samsung Galaxy S25 Edge 256GB", "SS-S25E-256", 102000, 120000, 6],
  ["Samsung Galaxy S25 Ultra 256GB", "SS-S25U-256", 123000, 145000, 6],
  ["Samsung Galaxy S26 256GB", "SS-S26-256", 102000, 120000, 10],
  ["Samsung Galaxy S26+ 256GB", "SS-S26P-256", 115000, 135000, 8],
  ["Samsung Galaxy S26 Ultra 256GB", "SS-S26U-256", 136000, 160000, 6],
];

async function main() {
  const category = await prisma.category.upsert({
    where: { name: "Smartphones" },
    update: {},
    create: { name: "Smartphones", description: "Mobile phones" },
  });

  const mainBranch = await prisma.branch.findFirst({ where: { isMain: true } });

  let created = 0;
  let updated = 0;
  for (const [name, sku, costPrice, sellingPrice, stock] of PHONES) {
    const existing = await prisma.product.findUnique({ where: { sku } });
    const product = await prisma.product.upsert({
      where: { sku },
      update: { name, costPrice, sellingPrice, categoryId: category.id },
      create: {
        name,
        sku,
        costPrice,
        sellingPrice,
        quantityInStock: stock,
        totalCost: costPrice * stock,
        reorderLevel: 5,
        categoryId: category.id,
        isActive: true,
      },
    });
    existing ? updated++ : created++;

    // Allocate stock at the main branch for new products (POS deducts branch stock)
    if (mainBranch && !existing) {
      await prisma.productBranchStock.upsert({
        where: { productId_branchId: { productId: product.id, branchId: mainBranch.id } },
        update: {},
        create: {
          productId: product.id,
          branchId: mainBranch.id,
          quantityInStock: stock,
          initialAllocation: stock,
        },
      });
    }
  }

  console.log(`Done. ${created} created, ${updated} updated (prices refreshed).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
