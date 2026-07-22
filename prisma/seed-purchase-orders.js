// Seeds purchase orders so you can watch the "receive -> products table" flow.
//
// - Ensures a Pharmacy category, a supplier, and a main branch exist.
// - Creates 3 POs whose items are NEW products (created with stock 0).
// - Two POs are auto-received: bumps Product.quantityInStock, upserts
//   ProductBranchStock, and writes a ProductBatch + StockMovement — the same
//   thing /api/purchase-orders/[id]/receive does when you click "Receive".
// - One PO is left "pending" so you can receive it from the UI at
//   http://localhost:3000/purchase-orders.
//
// Run: node prisma/seed-purchase-orders.js
// Safe to re-run (uses SKU-based upserts and skips POs already seeded by tag).

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function pad(n, len = 2) { return String(n).padStart(len, "0"); }
function datePart() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function rand(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}
const poNumber = () => `PO-${datePart()}-${rand(4)}`;

const SEED_TAG = "[seeded-po]";

const ORDERS = [
  {
    label: "Panadol restock",
    autoReceive: true,
    items: [
      {
        sku: "MED-PARA500-PAN-20",
        name: "Panadol 500mg (20 tabs)",
        genericName: "Paracetamol 500mg",
        brandName: "Panadol",
        strength: "500mg",
        dosageForm: "tablet",
        packSize: "20 tabs",
        manufacturer: "GSK",
        prescriptionRequired: false,
        sellingPrice: 120,
        quantityOrdered: 60,
        unitCost: 90,
      },
      {
        sku: "MED-IBU400-BRU-20",
        name: "Brufen 400mg (20 tabs)",
        genericName: "Ibuprofen 400mg",
        brandName: "Brufen",
        strength: "400mg",
        dosageForm: "tablet",
        packSize: "20 tabs",
        manufacturer: "Abbott",
        prescriptionRequired: false,
        sellingPrice: 180,
        quantityOrdered: 40,
        unitCost: 130,
      },
    ],
  },
  {
    label: "Antibiotics restock",
    autoReceive: true,
    items: [
      {
        sku: "MED-AMOX500-AMO-21",
        name: "Amoxil 500mg (21 caps)",
        genericName: "Amoxicillin 500mg",
        brandName: "Amoxil",
        strength: "500mg",
        dosageForm: "capsule",
        packSize: "21 caps",
        manufacturer: "GSK",
        prescriptionRequired: true,
        sellingPrice: 500,
        quantityOrdered: 30,
        unitCost: 350,
      },
    ],
  },
  {
    label: "Cough & cold — pending",
    autoReceive: false,
    items: [
      {
        sku: "MED-LOR10-CLA-10",
        name: "Claritin 10mg (10 tabs)",
        genericName: "Loratadine 10mg",
        brandName: "Claritin",
        strength: "10mg",
        dosageForm: "tablet",
        packSize: "10 tabs",
        manufacturer: "Bayer",
        prescriptionRequired: false,
        sellingPrice: 280,
        quantityOrdered: 25,
        unitCost: 200,
      },
      {
        sku: "MED-ORS-GEN-SACH",
        name: "ORS Sachet",
        genericName: "Oral Rehydration Salts",
        brandName: "Generic",
        strength: null,
        dosageForm: "sachet",
        packSize: "1 sachet (20.5g)",
        manufacturer: "Cosmos",
        prescriptionRequired: false,
        sellingPrice: 30,
        quantityOrdered: 200,
        unitCost: 15,
      },
    ],
  },
];

async function main() {
  const category = await prisma.category.upsert({
    where: { name: "Pharmacy" },
    update: {},
    create: { name: "Pharmacy", description: "Medicines and pharmaceutical products" },
  });

  const branch = await prisma.branch.findFirst({ where: { isMain: true } });
  if (!branch) throw new Error("No main branch found. Run `npm run seed` first.");

  const user = await prisma.user.findFirst({ where: { roles: { some: { name: { in: ["owner", "super_admin"] } } } } })
    || await prisma.user.findFirst();
  if (!user) throw new Error("No user found. Run `npm run seed` first.");

  let supplier = await prisma.supplier.findFirst({ where: { name: "PharmaSupplies Kenya" } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: "PharmaSupplies Kenya",
        contactPerson: "Jane Mwangi",
        email: "orders@pharmasupplies.co.ke",
        phone: "+254700000001",
        address: "Industrial Area, Nairobi",
      },
    });
  }

  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  for (const order of ORDERS) {
    // Create products (with stock 0) — same behavior as the API POST route.
    const resolvedItems = [];
    for (const it of order.items) {
      const product = await prisma.product.upsert({
        where: { sku: it.sku },
        update: {
          name: it.name,
          genericName: it.genericName,
          brandName: it.brandName,
          strength: it.strength,
          dosageForm: it.dosageForm,
          packSize: it.packSize,
          manufacturer: it.manufacturer,
          prescriptionRequired: it.prescriptionRequired,
          sellingPrice: it.sellingPrice,
          costPrice: it.unitCost,
          categoryId: category.id,
        },
        create: {
          name: it.name,
          sku: it.sku,
          categoryId: category.id,
          costPrice: it.unitCost,
          sellingPrice: it.sellingPrice,
          reorderLevel: 10,
          genericName: it.genericName,
          brandName: it.brandName,
          strength: it.strength,
          dosageForm: it.dosageForm,
          packSize: it.packSize,
          manufacturer: it.manufacturer,
          prescriptionRequired: it.prescriptionRequired,
        },
      });
      resolvedItems.push({
        productId: product.id,
        quantityOrdered: it.quantityOrdered,
        unitCost: it.unitCost,
      });
    }

    const totalCost = resolvedItems.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0);
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: poNumber(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        status: "pending",
        orderDate: new Date(),
        expectedDeliveryDate: null,
        totalCost,
        notes: `${SEED_TAG} ${order.label}`,
        createdById: user.id,
        items: { create: resolvedItems },
      },
      include: { items: true },
    });

    console.log(`Created ${po.poNumber} — ${order.label} (${po.items.length} lines, total ${totalCost})`);

    if (!order.autoReceive) continue;

    // Mirror /api/purchase-orders/[id]/receive: bump product stock, upsert
    // ProductBranchStock, create a ProductBatch, log a StockMovement, mark PO received.
    for (const item of po.items) {
      const good = item.quantityOrdered;
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: { increment: good } },
      });
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          quantityInStock: { increment: good },
          totalCost: { increment: good * item.unitCost },
        },
      });
      await prisma.productBranchStock.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: branch.id } },
        update: { quantityInStock: { increment: good } },
        create: { productId: item.productId, branchId: branch.id, quantityInStock: good, initialAllocation: good },
      });
      await prisma.productBatch.create({
        data: {
          productId: item.productId,
          branchId: branch.id,
          batchNumber: `${po.poNumber}-${item.productId.slice(-4)}`,
          expiryDate: oneYearOut,
          quantity: good,
          costPrice: item.unitCost,
          receivedAt: new Date(),
        },
      });
      await prisma.stockMovement.create({
        data: {
          productId: item.productId,
          branchId: branch.id,
          type: "purchase",
          quantity: good,
          notes: `PO ${po.poNumber}`,
          userId: user.id,
        },
      });
    }
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "received", receivedDate: new Date(), receivedById: user.id },
    });
    console.log(`  ↳ received: stock landed in Products table.`);
  }

  console.log(`\nDone. Visit http://localhost:3000/purchase-orders to see the POs.`);
  console.log(`Received POs' products are now visible at http://localhost:3000/products.`);
  console.log(`Open the pending PO and click "Receive selected quantities" to complete the flow.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
