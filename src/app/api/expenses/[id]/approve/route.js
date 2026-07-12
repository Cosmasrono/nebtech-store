import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth("approve_expense");
  if (error) return error;
  const { id } = await params;
  const expense = await prisma.expense.update({
    where: { id },
    data: { status: "approved", approvedById: user.id, approvedAt: new Date() },
  });
  return Response.json({ data: expense });
}
