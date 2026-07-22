import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET(req, { params }) {
  const { error } = await requireAuth("view_inventory");
  if (error) return error;
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, branchStocks: { include: { branch: true } }, batches: true },
  });
  if (!product) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ data: product });
}

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth("manage_products");
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const old = await prisma.product.findUnique({ where: { id } });
  if (!old) return Response.json({ message: "Not found." }, { status: 404 });

  const data = {};
  for (const k of ["name", "description", "sku", "barcode", /* "imei", */ "categoryId",
    "genericName", "brandName", "strength", "dosageForm", "packSize", "manufacturer"]) if (body[k] !== undefined) data[k] = body[k];
  if (body.prescriptionRequired !== undefined) data.prescriptionRequired = !!body.prescriptionRequired;
  for (const k of ["costPrice", "sellingPrice"]) if (body[k] !== undefined) data[k] = body[k] == null ? null : Number(body[k]);
  for (const k of ["quantityInStock", "reorderLevel"]) if (body[k] !== undefined) data[k] = Number(body[k]);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (data.costPrice !== undefined || data.quantityInStock !== undefined) {
    data.totalCost = (data.costPrice ?? old.costPrice ?? 0) * (data.quantityInStock ?? old.quantityInStock);
  }

  const product = await prisma.product.update({ where: { id }, data });
  await audit({ userId: user.id, event: "updated", type: "Product", auditableId: id, oldValues: old, newValues: data, req });
  return Response.json({ data: product });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth("manage_products");
  if (error) return error;
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return Response.json({ message: "Not found." }, { status: 404 });

  await prisma.product.update({ where: { id }, data: { isActive: false } });
  await prisma.productBranchStock.deleteMany({ where: { productId: id } });
  await audit({ userId: user.id, event: "deactivated", type: "Product", auditableId: id, req });
  return Response.json({ message: "Product deactivated." });
}
