import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  const saleScope = userCan(user, "view_all_sales") ? {} : { cashierId: user.id };

  const [todaySales, monthSales, productCount, lowStock, pendingExpenses, activeShift, recentSales] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...saleScope, status: "completed", createdAt: { gte: startOfDay } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { ...saleScope, status: "completed", createdAt: { gte: startOfMonth } },
      _sum: { totalAmount: true },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.findMany({
      where: { isActive: true, quantityInStock: { lte: 10 } },
      orderBy: { quantityInStock: "asc" },
      take: 10,
      select: { id: true, name: true, quantityInStock: true, reorderLevel: true },
    }),
    userCan(user, "approve_expense") ? prisma.expense.count({ where: { status: "pending" } }) : 0,
    prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } }),
    prisma.sale.findMany({
      where: saleScope,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { cashier: { select: { name: true } } },
    }),
  ]);

  return Response.json({
    data: {
      todayRevenue: todaySales._sum.totalAmount || 0,
      todayCount: todaySales._count,
      monthRevenue: monthSales._sum.totalAmount || 0,
      productCount,
      lowStock,
      pendingExpenses,
      activeShift,
      recentSales,
    },
  });
}
