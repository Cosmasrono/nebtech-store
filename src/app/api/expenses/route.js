import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const where = userCan(user, "view_expenses") ? {} : { recordedById: user.id };
  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true, recordedBy: { select: { id: true, name: true } } },
    orderBy: { expenseDate: "desc" },
    take: 200,
  });
  return Response.json({ data: expenses });
}

export async function POST(req) {
  const { user, error } = await requireAuth("record_expense");
  if (error) return error;
  const b = await req.json();
  if (!b.categoryId || !b.amount || !b.description) {
    return Response.json({ message: "categoryId, amount and description are required." }, { status: 422 });
  }
  const category = await prisma.expenseCategory.findUnique({ where: { id: b.categoryId } });
  const expense = await prisma.expense.create({
    data: {
      categoryId: b.categoryId,
      categoryName: category?.name || null,
      amount: Number(b.amount),
      description: b.description,
      expenseDate: b.expenseDate ? new Date(b.expenseDate) : new Date(),
      paymentMethod: b.paymentMethod || "cash",
      referenceNumber: b.referenceNumber || null,
      recordedById: user.id,
    },
  });
  return Response.json({ data: expense }, { status: 201 });
}
