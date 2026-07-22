import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

const CATEGORY = { name: "Pharmacy", description: "Medicines and health products" };

// [name, sku, cost, price, totalStockUnits, reorderLevel]
const ITEMS = [
  ["Panadol Extra 500mg (24 tabs)", "MED-PAN-24", 120, 200, 60, 15],
  ["Ibuprofen 200mg (30 tabs)", "MED-IBU-30", 150, 250, 50, 15],
  ["Amoxicillin 500mg (21 caps)", "MED-AMX-21", 180, 320, 40, 10],
  ["Ciprofloxacin 500mg (10 tabs)", "MED-CIP-10", 220, 380, 30, 8],
  ["Metformin 500mg (60 tabs)", "MED-MET-60", 300, 500, 40, 10],
  ["Losartan 50mg (30 tabs)", "MED-LOS-30", 280, 480, 35, 10],
  ["Cetirizine 10mg (10 tabs)", "MED-CET-10", 60, 120, 80, 20],
  ["Loratadine 10mg (10 tabs)", "MED-LOR-10", 80, 150, 60, 15],
  ["ORS Sachets (5 pack)", "MED-ORS-5", 90, 160, 100, 25],
  ["Zinc Sulphate 20mg (10 tabs)", "MED-ZN-10", 100, 180, 50, 15],
  ["Multivitamin Syrup 200ml", "MED-MVS-200", 320, 550, 25, 8],
  ["Vitamin C 1000mg (30 tabs)", "MED-VC-30", 200, 350, 45, 12],
  ["Cough Syrup 100ml", "MED-COU-100", 180, 320, 40, 10],
  ["Antacid Suspension 200ml", "MED-ANT-200", 240, 400, 35, 10],
  ["Antiseptic Solution 500ml", "MED-ANS-500", 260, 450, 30, 8],
  ["Cotton Wool 100g", "MED-CTN-100", 120, 220, 50, 12],
  ["Bandage Roll 5cm", "MED-BND-5", 90, 170, 80, 20],
  ["Digital Thermometer", "MED-THM-01", 450, 800, 20, 5],
  ["Blood Pressure Monitor", "MED-BPM-01", 3500, 5500, 8, 2],
  ["Face Masks (50 pack)", "MED-MSK-50", 350, 600, 40, 10],
];

function distribute(total, buckets) {
  const base = Math.floor(total / buckets);
  const rem = total - base * buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < rem ? 1 : 0));
}

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { isMain: "desc" } });
  if (!branches.length) return Response.json({ message: "No active branches to distribute stock to." }, { status: 422 });

  // Retire the current catalog: delete products with no sale history, deactivate the rest.
  const existing = await prisma.product.findMany({
    where: { isActive: true },
    include: { _count: { select: { saleItems: true } } },
  });
  const deletableIds = existing.filter((p) => p._count.saleItems === 0).map((p) => p.id);
  const deactivateIds = existing.filter((p) => p._count.saleItems > 0).map((p) => p.id);

  if (deletableIds.length) {
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.productBatch.deleteMany({ where: { productId: { in: deletableIds } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: deletableIds } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: { in: deletableIds } } });
  }
  if (deactivateIds.length) {
    await prisma.product.updateMany({ where: { id: { in: deactivateIds } }, data: { isActive: false } });
    await prisma.productBranchStock.deleteMany({ where: { productId: { in: deactivateIds } } });
  }

  const category = await prisma.category.upsert({
    where: { name: CATEGORY.name },
    update: {},
    create: CATEGORY,
  });

  let created = 0;
  let reactivated = 0;
  for (const [name, sku, costPrice, sellingPrice, totalStock, reorderLevel] of ITEMS) {
    const before = await prisma.product.findUnique({ where: { sku } });
    const perBranch = distribute(totalStock, branches.length);

    const product = await prisma.product.upsert({
      where: { sku },
      update: {
        name, costPrice, sellingPrice, reorderLevel,
        categoryId: category.id, isActive: true,
        quantityInStock: totalStock,
        totalCost: (costPrice || 0) * totalStock,
      },
      create: {
        name, sku, costPrice, sellingPrice, reorderLevel,
        categoryId: category.id, isActive: true,
        quantityInStock: totalStock,
        totalCost: (costPrice || 0) * totalStock,
      },
    });
    if (before) reactivated++; else created++;

    for (let i = 0; i < branches.length; i++) {
      const qty = perBranch[i];
      await prisma.productBranchStock.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branches[i].id } },
        update: { quantityInStock: qty, initialAllocation: qty },
        create: {
          productId: product.id,
          branchId: branches[i].id,
          quantityInStock: qty,
          initialAllocation: qty,
        },
      });
    }
  }

  return Response.json({
    message:
      `Loaded Pharmacy catalog: ${created} new, ${reactivated} refreshed. ` +
      `Deactivated ${deactivateIds.length} old product(s) (sale history preserved), deleted ${deletableIds.length}. ` +
      `Stock distributed across ${branches.length} branch(es).`,
    data: {
      created,
      reactivated,
      deactivated: deactivateIds.length,
      deleted: deletableIds.length,
      branches: branches.length,
    },
  });
}
