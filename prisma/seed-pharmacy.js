// Seeds a Pharmacy category and 10 medicines (with brand variants + batches).
// Same generic (e.g. Paracetamol 500mg) can appear under multiple brandNames;
// the POS groups them via `genericName` when the cashier searches.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MEDICINES = [
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
    costPrice: 90,
    sellingPrice: 120,
    quantity: 50,
  },
  {
    sku: "MED-PARA500-HED-20",
    name: "Hedex 500mg (20 tabs)",
    genericName: "Paracetamol 500mg",
    brandName: "Hedex",
    strength: "500mg",
    dosageForm: "tablet",
    packSize: "20 tabs",
    manufacturer: "GSK",
    prescriptionRequired: false,
    costPrice: 85,
    sellingPrice: 110,
    quantity: 50,
  },
  {
    sku: "MED-PARA500-GEN-100",
    name: "Paracetamol 500mg Generic (100 tabs)",
    genericName: "Paracetamol 500mg",
    brandName: "Generic",
    strength: "500mg",
    dosageForm: "tablet",
    packSize: "100 tabs",
    manufacturer: "Cosmos",
    prescriptionRequired: false,
    costPrice: 150,
    sellingPrice: 220,
    quantity: 40,
  },
  {
    sku: "MED-PARA120-CAL-100ML",
    name: "Calpol 120mg/5ml Syrup (100ml)",
    genericName: "Paracetamol 120mg/5ml",
    brandName: "Calpol",
    strength: "120mg/5ml",
    dosageForm: "syrup",
    packSize: "100ml",
    manufacturer: "GSK",
    prescriptionRequired: false,
    costPrice: 180,
    sellingPrice: 250,
    quantity: 30,
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
    costPrice: 130,
    sellingPrice: 180,
    quantity: 40,
  },
  {
    sku: "MED-IBU400-GEN-100",
    name: "Ibuprofen 400mg Generic (100 tabs)",
    genericName: "Ibuprofen 400mg",
    brandName: "Generic",
    strength: "400mg",
    dosageForm: "tablet",
    packSize: "100 tabs",
    manufacturer: "Cosmos",
    prescriptionRequired: false,
    costPrice: 200,
    sellingPrice: 300,
    quantity: 30,
  },
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
    costPrice: 350,
    sellingPrice: 500,
    quantity: 25,
  },
  {
    sku: "MED-AMOX500-GEN-100",
    name: "Amoxicillin 500mg Generic (100 caps)",
    genericName: "Amoxicillin 500mg",
    brandName: "Generic",
    strength: "500mg",
    dosageForm: "capsule",
    packSize: "100 caps",
    manufacturer: "Cosmos",
    prescriptionRequired: true,
    costPrice: 600,
    sellingPrice: 900,
    quantity: 20,
  },
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
    costPrice: 200,
    sellingPrice: 280,
    quantity: 30,
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
    costPrice: 15,
    sellingPrice: 30,
    quantity: 200,
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

  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  for (const m of MEDICINES) {
    const { quantity, ...productData } = m;
    const product = await prisma.product.upsert({
      where: { sku: m.sku },
      update: {
        name: m.name,
        genericName: m.genericName,
        brandName: m.brandName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        packSize: m.packSize,
        manufacturer: m.manufacturer,
        prescriptionRequired: m.prescriptionRequired,
        costPrice: m.costPrice,
        sellingPrice: m.sellingPrice,
        categoryId: category.id,
      },
      create: {
        ...productData,
        categoryId: category.id,
        quantityInStock: quantity,
        totalCost: (m.costPrice || 0) * quantity,
        reorderLevel: 10,
      },
    });

    await prisma.productBranchStock.upsert({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      update: { quantityInStock: quantity, initialAllocation: quantity },
      create: {
        productId: product.id,
        branchId: branch.id,
        quantityInStock: quantity,
        initialAllocation: quantity,
      },
    });

    const existingBatch = await prisma.productBatch.findFirst({
      where: { productId: product.id, branchId: branch.id, batchNumber: `${m.sku}-B1` },
    });
    if (!existingBatch) {
      await prisma.productBatch.create({
        data: {
          productId: product.id,
          branchId: branch.id,
          batchNumber: `${m.sku}-B1`,
          expiryDate: oneYearOut,
          quantity,
          costPrice: m.costPrice,
          receivedAt: new Date(),
        },
      });
    }

    console.log(`Seeded: ${m.name}`);
  }

  console.log(`\nPharmacy seed complete: ${MEDICINES.length} medicines under "Pharmacy" category.`);
}

main().finally(() => prisma.$disconnect());
