// Seeds the cosmetics catalog (6 categories, products with pictures) from src/data/cosmetics-catalog.json.
// Idempotent — upserts by SKU and leaves other products alone. Run with: pnpm seed:cosmetics
// (The "Load Cosmetics catalog" button on the System page also retires the existing catalog.)
const { PrismaClient } = require("@prisma/client");
const catalog = require("../src/data/cosmetics-catalog.json");
const prisma = new PrismaClient();

// Same path as catalogImage() in src/lib/product-image.js
const imageFor = (sku) => `/images/products/${sku.toLowerCase()}.svg`;

async function main() {
  const categoryIds = {};
  for (const c of catalog.categories) {
    const category = await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
    categoryIds[c.name] = category.id;
  }

  // New stock is split across active branches (main first) — the POS only lists products
  // that have stock at the cashier's own branch.
  const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { isMain: "desc" } });
  if (!branches.length) throw new Error("No active branch found. Run `pnpm seed` first.");
  const split = (total) => {
    const base = Math.floor(total / branches.length);
    return branches.map((_, i) => base + (i < total - base * branches.length ? 1 : 0));
  };

  let created = 0;
  let updated = 0;
  for (const item of catalog.products) {
    const { sku, stock, costPrice } = item;
    const existing = await prisma.product.findUnique({ where: { sku } });
    const details = {
      name: item.name,
      costPrice,
      sellingPrice: item.sellingPrice,
      reorderLevel: item.reorderLevel,
      genericName: item.genericName,
      brandName: item.brandName,
      packSize: item.packSize,
      manufacturer: item.manufacturer,
      categoryId: categoryIds[item.category],
    };

    if (existing) {
      // Refresh details and prices; keep stock and any photo already set.
      await prisma.product.update({
        where: { sku },
        data: { ...details, ...(!existing.imageUrl && { imageUrl: imageFor(sku) }) },
      });
      updated++;
      continue;
    }

    const product = await prisma.product.create({
      data: {
        ...details,
        sku,
        imageUrl: imageFor(sku),
        quantityInStock: stock,
        totalCost: costPrice * stock,
        isActive: true,
      },
    });
    const shares = split(stock);
    for (let i = 0; i < branches.length; i++) {
      await prisma.productBranchStock.create({
        data: { productId: product.id, branchId: branches[i].id, quantityInStock: shares[i], initialAllocation: shares[i] },
      });
    }
    created++;
  }

  console.log(`Cosmetics catalog: ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
