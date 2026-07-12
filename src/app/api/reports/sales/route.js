import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { error } = await requireAuth("view_sales_reports");
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") || new Date(Date.now() - 30 * 86400000));
  const to = new Date((searchParams.get("to") || new Date().toISOString().slice(0, 10)) + "T23:59:59");

  const sales = await prisma.sale.findMany({
    where: { status: "completed", createdAt: { gte: from, lte: to } },
    include: { items: { include: { product: { select: { name: true, costPrice: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  // Daily breakdown + top products
  const byDay = {};
  const byProduct = {};
  let revenue = 0, cogs = 0;
  for (const s of sales) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay[day] = byDay[day] || { revenue: 0, count: 0 };
    byDay[day].revenue += s.totalAmount;
    byDay[day].count += 1;
    revenue += s.totalAmount;
    for (const it of s.items) {
      cogs += (it.product?.costPrice || 0) * it.quantity;
      const key = it.product?.name || it.productId;
      byProduct[key] = byProduct[key] || { quantity: 0, revenue: 0 };
      byProduct[key].quantity += it.quantity;
      byProduct[key].revenue += it.lineTotal;
    }
  }
  const topProducts = Object.entries(byProduct)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  return Response.json({
    data: { revenue, cogs, grossProfit: revenue - cogs, count: sales.length, byDay, topProducts },
  });
}
