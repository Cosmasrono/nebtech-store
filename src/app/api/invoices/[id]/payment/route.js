import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  if (!b.amount) return Response.json({ message: "Amount is required." }, { status: 422 });

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return Response.json({ message: "Not found." }, { status: 404 });

  const amount = Number(b.amount);
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
