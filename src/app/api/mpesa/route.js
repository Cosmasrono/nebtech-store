import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { error } = await requireAuth("view_financial_reports");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const to = searchParams.get("to") ? new Date(searchParams.get("to") + "T23:59:59.999") : new Date();
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from") + "T00:00:00")
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const txns = await prisma.mpesaTransaction.findMany({
    where: { createdAt: { gte: from, lte: to }, ...(status && { status }) },
    include: {
      sale: { select: { receiptNumber: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Response.json({ data: txns });
}
