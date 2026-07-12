import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const b = await req.json();
  if (!b.amount) return Response.json({ message: "Amount is required." }, { status: 422 });

  const loan = await prisma.loan.findUnique({ where: { id } });
  if (!loan) return Response.json({ message: "Not found." }, { status: 404 });

  const amount = Number(b.amount);
  await prisma.loanPayment.create({
    data: {
      loanId: id,
      amount,
      paymentMethod: b.paymentMethod || "cash",
      paymentDate: b.paymentDate ? new Date(b.paymentDate) : new Date(),
      referenceNumber: b.referenceNumber || null,
      notes: b.notes || null,
      userId: user.id,
    },
  });
  const newPaid = loan.amountPaid + amount;
  const updated = await prisma.loan.update({
    where: { id },
    data: { amountPaid: newPaid, status: newPaid >= loan.totalAmount ? "paid" : "active" },
  });
  return Response.json({ data: updated });
}
