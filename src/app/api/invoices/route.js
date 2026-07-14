import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateInvoiceNumber } from "@/lib/numbers";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const invoices = await prisma.invoice.findMany({
    include: { customer: true, items: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json({ data: invoices });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const b = await req.json();
  if (!b.customerId || !Array.isArray(b.items) || !b.items.length) {
    return Response.json({ message: "customerId and items are required." }, { status: 422 });
  }

  // Catalog products are always priced from the DB; only free-form (service) lines accept a manual price.
  const productIds = [...new Set(b.items.map((i) => i.productId).filter(Boolean))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = [];
  for (const raw of b.items) {
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return Response.json({ message: "Each item needs a positive whole-number quantity." }, { status: 422 });
    }
    let unitPrice;
    if (raw.productId) {
      const product = productById.get(raw.productId);
      if (!product) return Response.json({ message: "Unknown product in invoice items." }, { status: 422 });
      unitPrice = product.sellingPrice;
    } else {
      unitPrice = Number(raw.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return Response.json({ message: "Each item needs a valid unit price." }, { status: 422 });
      }
    }
    const discountPerItem = Math.min(unitPrice * quantity, Math.max(0, Number(raw.discountPerItem) || 0));
    items.push({
      productId: raw.productId || null,
      description: raw.description,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity - discountPerItem,
      discountPerItem,
    });
  }

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const taxAmount = Math.max(0, Number(b.taxAmount) || 0);
  const discountAmount = Math.min(subtotal + taxAmount, Math.max(0, Number(b.discountAmount) || 0));
  const totalAmount = subtotal + taxAmount - discountAmount;

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: generateInvoiceNumber(),
      customerId: b.customerId,
      saleId: b.saleId || null,
      issueDate: b.issueDate ? new Date(b.issueDate) : new Date(),
      dueDate: b.dueDate ? new Date(b.dueDate) : new Date(Date.now() + 30 * 86400000),
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      balanceDue: totalAmount,
      paymentTerms: b.paymentTerms || "Net 30",
      notes: b.notes || null,
      createdById: user.id,
      items: { create: items },
    },
    include: { items: true },
  });
  return Response.json({ data: invoice }, { status: 201 });
}
