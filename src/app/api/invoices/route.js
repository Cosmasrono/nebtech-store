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
  const subtotal = b.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice) - Number(i.discountPerItem || 0), 0);
  const taxAmount = Number(b.taxAmount || 0);
  const discountAmount = Number(b.discountAmount || 0);
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
      items: {
        create: b.items.map((i) => ({
          productId: i.productId || null,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.quantity) * Number(i.unitPrice) - Number(i.discountPerItem || 0),
          discountPerItem: Number(i.discountPerItem || 0),
        })),
      },
    },
    include: { items: true },
  });
  return Response.json({ data: invoice }, { status: 201 });
}
