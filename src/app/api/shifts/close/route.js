import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req) {
  const { user, error } = await requireAuth("close_shift");
  if (error) return error;
  const { closingCashCounted, closingNotes } = await req.json();

  const shift = await prisma.shift.findFirst({ where: { cashierId: user.id, status: "open" } });
  if (!shift) return Response.json({ message: "No open shift found." }, { status: 422 });

  const expected = shift.openingCash + shift.totalCashSales - shift.totalRefunds;
  const counted = Number(closingCashCounted || 0);
  const diff = counted - expected;

  const mpesaAgg = await prisma.mpesaTransaction.aggregate({
    _sum: { amount: true },
    where: { userId: user.id, status: "confirmed", confirmedAt: { gte: shift.openedAt } },
  });
  const mpesaConfirmed = mpesaAgg._sum.amount || 0;
  const mpesaVariance = mpesaConfirmed - shift.totalMpesaSales;

  const balanced = Math.abs(diff) <= 0.009 && Math.abs(mpesaVariance) <= 0.009;
  const closed = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(),
      status: balanced ? "closed" : "discrepancy",
      closingCashCounted: counted,
      closingNotes: closingNotes || null,
      expectedClosingCash: expected,
      cashShortageOverage: diff,
      closedById: user.id,
    },
  });
  return Response.json({ data: { ...closed, mpesaConfirmedTotal: mpesaConfirmed, mpesaVariance } });
}
