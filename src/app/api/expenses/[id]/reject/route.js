import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth("approve_expense");
  if (error) return error;
  const { id } = await params;
  const { reason } = await req.json().catch(() => ({}));
  const expense = await prisma.expense.update({
    where: { id },
    data: { status: "rejected", approvedById: user.id, approvedAt: new Date(), rejectionReason: reason || null },
  });
  await audit({
    userId: user.id, event: "expense_rejected", type: "Expense", auditableId: id, req,
    newValues: { amount: expense.amount, description: expense.description, recordedById: expense.recordedById, reason: reason || null },
  });
  return Response.json({ data: expense });
}
