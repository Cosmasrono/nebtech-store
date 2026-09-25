import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req, { params }) {
  const { user, error } = await requireAuth("view_all_sales");
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ message: "Enter a payment amount greater than zero." }, { status: 422 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return Response.json({ message: "Not found." }, { status: 404 });
  const outstanding = Math.max(0, invoice.totalAmount - invoice.amountPaid);
  if (outstanding <= 0.009) return Response.json({ message: "This invoice is already fully paid." }, { status: 422 });
  if (amount > outstanding + 0.009) {
    return Response.json({ message: `Payment is more than the balance due (KSh ${outstanding.toLocaleString()}).` }, { status: 422 });
  }
  const newPaid = invoice.amountPaid + amount;
  const newBalance = Math.max(0, invoice.totalAmount - newPaid);

  await prisma.invoicePayment.create({
    data: {
      invoiceId: id,
      paymentDate: b.paymentDate ? new Date(b.paymentDate) : new Date(),
      amount,
      paymentMethod: b.paymentMethod || "cash",
      referenceNumber: b.referenceNumber || null,
      notes: b.notes || null,
      recordedById: user.id,
    },
  });
  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      amountPaid: newPaid,
      balanceDue: newBalance,
      status: newBalance <= 0.009 ? "paid" : "partial",
      ...(newBalance <= 0.009 && { paidAt: new Date() }),
    },
  });
  return Response.json({ data: updated });
}
