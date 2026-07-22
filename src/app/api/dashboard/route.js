import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
  const start14 = new Date(startOfDay.getTime() - 13 * 86400000);
  const start30 = new Date(startOfDay.getTime() - 29 * 86400000);

  const saleScope = userCan(user, "view_all_sales") ? {} : { cashierId: user.id };

  const [
    todaySales,
    monthSales,
    productCount,
    lowStock,
    pendingExpenses,
    activeShift,
    recentSales,
    trendSales,
    paymentBreakdown,
    topProductRows,
    categoryItems,
  ] = await Promise.all([
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
    prisma.sale.findMany({
      where: { ...saleScope, status: "completed", createdAt: { gte: start14 } },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.sale.findMany({
      where: { ...saleScope, status: "completed", createdAt: { gte: start30 } },
      select: { cashPaid: true, mpesaPaid: true, cardPaid: true, changeAmount: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { ...saleScope, status: "completed", createdAt: { gte: start30 } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.saleItem.findMany({
      where: { sale: { ...saleScope, status: "completed", createdAt: { gte: start30 } } },
      select: {
        lineTotal: true,
        quantity: true,
        product: { select: { category: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  // Build 14-day trend (fill zeros for empty days)
  const trend = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(start14.getTime() + i * 86400000);
    trend.push({ date: day.toISOString().slice(0, 10), revenue: 0, count: 0 });
  }
  const trendIdx = Object.fromEntries(trend.map((d, i) => [d.date, i]));
  for (const s of trendSales) {
    const key = new Date(s.createdAt).toISOString().slice(0, 10);
    const i = trendIdx[key];
    if (i != null) {
      trend[i].revenue += Number(s.totalAmount || 0);
      trend[i].count += 1;
    }
  }

  // Payment method breakdown (last 30 days)
  let cashNet = 0, mpesa = 0, card = 0;
  for (const s of paymentBreakdown) {
    cashNet += Number(s.cashPaid || 0) - Number(s.changeAmount || 0);
    mpesa += Number(s.mpesaPaid || 0);
    card += Number(s.cardPaid || 0);
  }
  const payments = [
    { label: "Cash", value: Math.max(0, cashNet), color: "#10b981" },
    { label: "M-Pesa", value: mpesa, color: "#0d9488" },
    { label: "Card", value: card, color: "#6366f1" },
  ];

  // Top products - hydrate names
  const topProductIds = topProductRows.map((r) => r.productId);
  const topProductInfo = topProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topProductIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  const infoMap = Object.fromEntries(topProductInfo.map((p) => [p.id, p]));
  const topProducts = topProductRows.map((r) => ({
    id: r.productId,
    name: infoMap[r.productId]?.name || "Unknown",
    sku: infoMap[r.productId]?.sku || "",
    quantity: r._sum.quantity || 0,
    revenue: Number(r._sum.lineTotal || 0),
  }));

  // Sales by category (last 30 days) — pie chart data
  const CAT_COLORS = ["#0d9488", "#6366f1", "#f59e0b", "#ec4899", "#10b981", "#0ea5e9", "#a855f7", "#f43f5e"];
  const catMap = new Map();
  for (const it of categoryItems) {
    const name = it.product?.category?.name || "Uncategorized";
    const prev = catMap.get(name) || { label: name, value: 0, quantity: 0 };
    prev.value += Number(it.lineTotal || 0);
    prev.quantity += Number(it.quantity || 0);
    catMap.set(name, prev);
  }
  const categories = [...catMap.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((c, i) => ({ ...c, color: CAT_COLORS[i % CAT_COLORS.length] }));

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
      trend,
      payments,
      topProducts,
      categories,
    },
  });
}
