import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function GET(req) {
  const { error } = await requireAuth("view_financial_reports");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const runAi = searchParams.get("ai") === "1";
  const aiPrompt = (searchParams.get("prompt") || "").trim();
  const to = searchParams.get("to") ? new Date(searchParams.get("to") + "T23:59:59.999") : new Date();
  const from = searchParams.get("from")
    ? new Date(searchParams.get("from") + "T00:00:00")
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const shifts = await prisma.shift.findMany({
    where: { openedAt: { gte: from, lte: to } },
    include: { cashier: { select: { name: true, branch: { select: { name: true } } } } },
    orderBy: { openedAt: "desc" },
  });

  const data = [];
  for (const s of shifts) {
    const mpesaAgg = await prisma.mpesaTransaction.aggregate({
      _sum: { amount: true },
      where: {
        userId: s.cashierId,
        status: "confirmed",
        confirmedAt: { gte: s.openedAt, ...(s.closedAt && { lte: s.closedAt }) },
      },
    });
    const mpesaConfirmed = mpesaAgg._sum.amount || 0;
    const expectedCash = s.openingCash + s.totalCashSales - s.totalRefunds;
    data.push({
      id: s.id,
      cashier: s.cashier?.name,
      branch: s.cashier?.branch?.name || "—",
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      status: s.status,
      openingCash: s.openingCash,
      totalCashSales: s.totalCashSales,
      expectedCash,
      countedCash: s.closingCashCounted,
      cashVariance: s.status === "open" ? null : (s.closingCashCounted || 0) - expectedCash,
      mpesaSales: s.totalMpesaSales,
      mpesaConfirmed,
      mpesaVariance: mpesaConfirmed - s.totalMpesaSales,
      cardSales: s.totalCardSales,
    });
  }

  const sales = await prisma.sale.findMany({
    where: { status: "completed", createdAt: { gte: from, lte: to } },
    select: {
      totalAmount: true,
      cashPaid: true,
      mpesaPaid: true,
      cardPaid: true,
      changeAmount: true,
      items: { select: { quantity: true, product: { select: { costPrice: true } } } },
    },
  });

  let salesTotal = 0;
  let cashGross = 0;
  let cashChange = 0;
  let mpesaRecordedTotal = 0;
  let cardTotal = 0;
  let productsSoldUnits = 0;
  let cogsTotal = 0;

  for (const s of sales) {
    salesTotal += Number(s.totalAmount || 0);
    cashGross += Number(s.cashPaid || 0);
    cashChange += Number(s.changeAmount || 0);
    mpesaRecordedTotal += Number(s.mpesaPaid || 0);
    cardTotal += Number(s.cardPaid || 0);
    productsSoldUnits += s.items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
    cogsTotal += s.items.reduce((acc, it) => acc + Number(it.quantity || 0) * Number(it.product?.costPrice || 0), 0);
  }

  const mpesaConfirmedAgg = await prisma.mpesaTransaction.aggregate({
    _sum: { amount: true },
    where: {
      status: "confirmed",
      confirmedAt: { gte: from, lte: to },
    },
  });
  const mpesaConfirmedTotal = Number(mpesaConfirmedAgg._sum.amount || 0);

  const cashNet = cashGross - cashChange;
  const paymentSumRecorded = cashNet + mpesaRecordedTotal + cardTotal;
  const paymentSumConfirmed = cashNet + mpesaConfirmedTotal + cardTotal;
  const overview = {
    from: from.toISOString(),
    to: to.toISOString(),
    salesCount: sales.length,
    productsSoldUnits,
    salesTotal,
    cashGross,
    cashChange,
    cashNet,
    mpesaRecordedTotal,
    mpesaConfirmedTotal,
    cardTotal,
    paymentSumRecorded,
    paymentSumConfirmed,
    varianceRecorded: paymentSumRecorded - salesTotal,
    varianceConfirmed: paymentSumConfirmed - salesTotal,
    cogsTotal,
    grossProfit: salesTotal - cogsTotal,
  };

  let aiSummary = null;
  if (runAi && process.env.GROQ_API_KEY) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            {
              role: "system",
              content:
                "You are a finance reconciliation assistant for a retail store. Return plain text only (no markdown). Provide 2-4 concise sentences validating totals and highlighting variance causes.",
            },
            {
              role: "user",
              content: aiPrompt
                ? `User request: ${aiPrompt}\n\nUse this selected-period snapshot and answer precisely with concrete values: ${JSON.stringify(overview)}`
                : `Analyze this reconciliation snapshot and summarize whether payments match sales totals: ${JSON.stringify(overview)}`,
            },
          ],
        }),
      });

      if (res.ok) {
        const body = await res.json();
        aiSummary = body?.choices?.[0]?.message?.content?.trim() || null;
      }
    } catch {
      aiSummary = null;
    }
  }

  return Response.json({ data, overview, aiSummary, promptUsed: aiPrompt || null });
}
