import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth("approve_expense");
  if (error) return error;
  const { id } = await params;
  const expense = await prisma.expense.update({
    where: { id },
    data: { status: "approved", approvedById: user.id, approvedAt: new Date() },
  });
  await audit({
    userId: user.id, event: "expense_approved", type: "Expense", auditableId: id, req,
    newValues: { amount: expense.amount, description: expense.description, recordedById: expense.recordedById },
  });
  return Response.json({ data: expense });
}
