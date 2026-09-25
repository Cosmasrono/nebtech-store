import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { mainBranchId } from "@/lib/inventory";
import { MAX_IMPORT_ROWS, normalizeRow } from "@/lib/product-import";

// Import can take a while for big files on a remote database.
export const maxDuration = 300;

// MongoDB ObjectId made here so related rows can be written in bulk without reading ids back.
const objectId = () => Math.floor(Date.now() / 1000).toString(16).padStart(8, "0") + randomBytes(8).toString("hex");
const newSku = () => `SKU-${randomBytes(4).toString("hex").toUpperCase()}`;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * POST { rows, branchId?, existing: "update" | "skip", dryRun?: boolean }
 * rows: objects from mapColumns() in lib/product-import.js.
 * Nothing is saved if any row has a problem; the response lists them by row number.
 */
export async function POST(req) {
  const { user, error } = await requireAuth("manage_products");
  if (error) return error;

  const b = await req.json().catch(() => ({}));
  const input = Array.isArray(b.rows) ? b.rows : [];
  if (!input.length) return Response.json({ message: "The file has no product rows." }, { status: 422 });
  if (input.length > MAX_IMPORT_ROWS) {
    return Response.json({ message: `Import up to ${MAX_IMPORT_ROWS} products at a time. Split the file and try again.` }, { status: 422 });
  }
  const existingMode = b.existing === "skip" ? "skip" : "update";

  // Branch that receives the stock
  const branchId = b.branchId || user.branchId || (await mainBranchId());
  if (!branchId) return Response.json({ message: "Create a branch before importing stock." }, { status: 422 });
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
  if (!branch) return Response.json({ message: "That branch doesn't exist." }, { status: 422 });

  // 1. Validate every row
  const problems = [];
  const rows = input.map((raw, i) => {
    const { value, errors } = normalizeRow(raw || {});
    errors.forEach((e) => problems.push({ row: i + 2, name: value.name, error: e })); // +2: header is row 1
    return value;
  });
  const seen = new Map();
  rows.forEach((r, i) => {
    if (!r.sku) return;
    if (seen.has(r.sku)) problems.push({ row: i + 2, name: r.name, error: `SKU ${r.sku} is repeated (also on row ${seen.get(r.sku)})` });
    else seen.set(r.sku, i + 2);
  });

  // 2. Which SKUs already exist?
  const skus = rows.map((r) => r.sku).filter(Boolean);
  const existing = [];
  for (const part of chunk(skus, 500)) {
    existing.push(...(await prisma.product.findMany({ where: { sku: { in: part } }, select: { id: true, sku: true, costPrice: true } })));
  }
  const existingBySku = new Map(existing.map((p) => [p.sku, p]));
  const toCreate = rows.filter((r) => !r.sku || !existingBySku.has(r.sku));
  const toUpdate = rows.filter((r) => r.sku && existingBySku.has(r.sku));

  const categoryNames = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const knownCategories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryByName = new Map(knownCategories.map((c) => [c.name.toLowerCase(), c]));
  const newCategories = categoryNames.filter((n) => !categoryByName.has(n.toLowerCase()));

  const preview = {
    total: rows.length,
    create: toCreate.length,
    update: existingMode === "update" ? toUpdate.length : 0,
    skip: existingMode === "skip" ? toUpdate.length : 0,
    newCategories,
    branch: branch.name,
    units: rows.reduce((s, r) => s + (existingMode === "skip" && r.sku && existingBySku.has(r.sku) ? 0 : r.quantity), 0),
  };

  if (problems.length) {
    return Response.json({ message: `Fix ${problems.length} problem${problems.length > 1 ? "s" : ""} in the file, then upload it again.`, problems, preview }, { status: 422 });
  }
  if (b.dryRun) return Response.json({ data: preview });

  // 3. Categories
  for (const name of newCategories) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categoryByName.set(name.toLowerCase(), c);
  }
  const categoryId = (name) => categoryByName.get(name.toLowerCase()).id;

  // 4. New products (bulk writes)
  const now = new Date();
  const usedSkus = new Set(existingBySku.keys());
  const productDocs = [], stockDocs = [], batchDocs = [], movementDocs = [];
  for (const r of toCreate) {
    let sku = r.sku;
    while (!sku || usedSkus.has(sku)) sku = newSku();
    usedSkus.add(sku);
    const id = objectId();
    productDocs.push({
      id, name: r.name, sku, barcode: r.barcode, description: r.description,
      genericName: r.genericName, brandName: r.brandName, strength: r.strength, dosageForm: r.dosageForm,
      packSize: r.packSize, manufacturer: r.manufacturer, prescriptionRequired: r.prescriptionRequired,
      costPrice: r.costPrice, sellingPrice: r.sellingPrice, quantityInStock: r.quantity,
      totalCost: (r.costPrice || 0) * r.quantity, reorderLevel: Math.round(r.reorderLevel),
      categoryId: categoryId(r.category), isActive: true,
    });
    stockDocs.push({ productId: id, branchId, quantityInStock: r.quantity, initialAllocation: r.quantity });
    if (r.quantity > 0) {
      batchDocs.push({
        productId: id, branchId, batchNumber: r.batchNumber, quantity: r.quantity, costPrice: r.costPrice,
        expiryDate: r.expiryDate ? new Date(r.expiryDate) : null, receivedAt: now,
      });
      movementDocs.push({ productId: id, branchId, type: "purchase", quantity: r.quantity, notes: "Opening stock (import)", userId: user.id });
    }
  }
  for (const part of chunk(productDocs, 500)) await prisma.product.createMany({ data: part });
  for (const part of chunk(stockDocs, 500)) await prisma.productBranchStock.createMany({ data: part });
  for (const part of chunk(batchDocs, 500)) await prisma.productBatch.createMany({ data: part });
  for (const part of chunk(movementDocs, 500)) await prisma.stockMovement.createMany({ data: part });

  // 5. Existing products: update details/prices and add the stock
  let updated = 0;
  if (existingMode === "update") {
    for (const part of chunk(toUpdate, 20)) {
      await Promise.all(part.map(async (r) => {
        const p = existingBySku.get(r.sku);
        await prisma.product.update({
          where: { id: p.id },
          data: {
            name: r.name, sellingPrice: r.sellingPrice, categoryId: categoryId(r.category),
            reorderLevel: Math.round(r.reorderLevel), isActive: true,
            ...(r.costPrice !== null && { costPrice: r.costPrice }),
            ...(r.barcode && { barcode: r.barcode }),
            ...(r.description && { description: r.description }),
            ...(r.genericName && { genericName: r.genericName }),
            ...(r.brandName && { brandName: r.brandName }),
            ...(r.strength && { strength: r.strength }),
            ...(r.dosageForm && { dosageForm: r.dosageForm }),
            ...(r.packSize && { packSize: r.packSize }),
            ...(r.manufacturer && { manufacturer: r.manufacturer }),
            prescriptionRequired: r.prescriptionRequired,
            ...(r.quantity > 0 && {
              quantityInStock: { increment: r.quantity },
              totalCost: { increment: (r.costPrice ?? p.costPrice ?? 0) * r.quantity },
            }),
          },
        });
        if (r.quantity > 0) {
          await prisma.productBranchStock.upsert({
            where: { productId_branchId: { productId: p.id, branchId } },
            update: { quantityInStock: { increment: r.quantity } },
            create: { productId: p.id, branchId, quantityInStock: r.quantity },
          });
          await prisma.productBatch.create({
            data: {
              productId: p.id, branchId, batchNumber: r.batchNumber, quantity: r.quantity,
              costPrice: r.costPrice ?? p.costPrice, expiryDate: r.expiryDate ? new Date(r.expiryDate) : null, receivedAt: now,
            },
          });
          await prisma.stockMovement.create({
            data: { productId: p.id, branchId, type: "purchase", quantity: r.quantity, notes: "Stock added (import)", userId: user.id },
          });
        }
        updated++;
      }));
    }
  }

  const result = { ...preview, created: productDocs.length, updated, skipped: existingMode === "skip" ? toUpdate.length : 0 };
  await audit({ userId: user.id, event: "products_imported", type: "Product", newValues: result, req });
  return Response.json({ data: result });
}
