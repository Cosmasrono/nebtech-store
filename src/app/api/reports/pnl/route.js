import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { error } = await requireAuth("view_financial_reports");
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") || new Date(Date.now() - 30 * 86400000));
  const to = new Date((searchParams.get("to") || new Date().toISOString().slice(0, 10)) + "T23:59:59");

  const [sales, expenses, otherIncome] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "completed", createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: { select: { costPrice: true } } } } },
    }),
    prisma.expense.aggregate({
      where: { status: "approved", expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.otherIncome.aggregate({
      where: { incomeDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = sales.reduce((s, x) => s + x.totalAmount, 0);
  const cogs = sales.reduce((s, x) => s + x.items.reduce((a, i) => a + (i.product?.costPrice || 0) * i.quantity, 0), 0);
  const totalExpenses = expenses._sum.amount || 0;
  const income = otherIncome._sum.amount || 0;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit + income - totalExpenses;

  return Response.json({ data: { revenue, cogs, grossProfit, otherIncome: income, expenses: totalExpenses, netProfit } });
}
