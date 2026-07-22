import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const PREDICTION_TYPE = "demand_forecast";
const MAX_PRODUCTS = 40;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

type StockoutRisk = "none" | "low" | "medium" | "high";

interface ProductPrediction {
  productId: string;
  predictedDemandNext30Days: number;
  recommendedReorderQuantity: number;
  stockoutRisk: StockoutRisk;
  confidence: number;
  reasoning: string;
}

interface InsightsResult {
  summary: string;
  paymentAuditSummary?: string;
  predictions: ProductPrediction[];
}

const OUTPUT_FORMAT_INSTRUCTIONS = `Respond with a single JSON object only — no markdown, no commentary. Shape:
{
  "summary": "2-4 sentence overview of the inventory situation and the most urgent actions.",
  "paymentAuditSummary": "2-4 sentence summary that validates payment totals vs sales totals, highlights any mismatch and likely causes.",
  "predictions": [
    {
      "productId": "the product id exactly as given in the input",
      "predictedDemandNext30Days": <number, forecast units sold over the next 30 days>,
      "recommendedReorderQuantity": <integer, units to reorder now; 0 if none needed>,
      "stockoutRisk": "none" | "low" | "medium" | "high",
      "confidence": <number between 0 and 1>,
      "reasoning": "one sentence explaining the forecast"
    }
  ]
}
Include one prediction per input product.`;

async function getPaymentSnapshot(from: Date, to: Date) {
  const sales = await prisma.sale.findMany({
    where: { status: "completed", createdAt: { gte: from, lte: to } },
    select: {
      totalAmount: true,
      cashPaid: true,
      mpesaPaid: true,
      cardPaid: true,
      changeAmount: true,
      items: { select: { quantity: true } },
    },
  });

  let salesTotal = 0;
  let cashGross = 0;
  let cashChange = 0;
  let mpesaTotal = 0;
  let cardTotal = 0;
  let productsSoldUnits = 0;

  for (const s of sales) {
    salesTotal += Number(s.totalAmount || 0);
    cashGross += Number(s.cashPaid || 0);
    cashChange += Number(s.changeAmount || 0);
    mpesaTotal += Number(s.mpesaPaid || 0);
    cardTotal += Number(s.cardPaid || 0);
    productsSoldUnits += s.items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
  }

  const cashNet = cashGross - cashChange;
  const paymentSum = cashNet + mpesaTotal + cardTotal;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    salesCount: sales.length,
    productsSoldUnits,
    salesTotal,
    cashGross,
    cashChange,
    cashNet,
    mpesaTotal,
    cardTotal,
    paymentSum,
    variance: paymentSum - salesTotal,
  };
}

// GET — latest prediction per product + stored summary
export async function GET() {
  const { error } = await requireAuth("view_inventory_reports");
  if (error) return error;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);

  const [rows, summarySetting, generatedSetting, paymentAuditSetting, paymentSnapshot] = await Promise.all([
    prisma.inventoryPrediction.findMany({
      where: { predictionType: PREDICTION_TYPE },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { product: { select: { id: true, name: true, sku: true, quantityInStock: true, reorderLevel: true } } },
    }),
    prisma.setting.findUnique({ where: { key: "ai_insights_summary" } }),
    prisma.setting.findUnique({ where: { key: "ai_insights_generated_at" } }),
    prisma.setting.findUnique({ where: { key: "ai_insights_payment_audit_summary" } }),
    getPaymentSnapshot(d30, now),
  ]);

  // Keep only the newest prediction per product
  const seen = new Set<string>();
  const latest = rows.filter((r: { productId: string }) =>
    seen.has(r.productId) ? false : (seen.add(r.productId), true)
  );

  return Response.json({
    data: {
      summary: summarySetting?.value || null,
      generatedAt: generatedSetting?.value || null,
      paymentAuditSummary: paymentAuditSetting?.value || null,
      paymentSnapshot,
      predictions: latest,
    },
  });
}

// POST — generate fresh predictions with Groq
export async function POST() {
  const { error } = await requireAuth("view_inventory_reports");
  if (error) return error;

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { message: "AI is not configured. Set GROQ_API_KEY in .env and restart the server." },
      { status: 503 }
    );
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  const [products, saleItems, paymentSnapshot] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, sku: true, quantityInStock: true, reorderLevel: true,
        sellingPrice: true, costPrice: true, category: { select: { name: true } },
      },
    }),
    prisma.saleItem.findMany({
      where: { sale: { createdAt: { gte: d90 }, status: "completed" } },
      select: { productId: true, quantity: true, sale: { select: { createdAt: true } } },
    }),
    getPaymentSnapshot(d30, now),
  ]);

  if (!products.length) {
    return Response.json({ message: "No active products to analyze." }, { status: 422 });
  }

  // Aggregate sales per product
  const stats: Record<string, { sold30: number; sold90: number }> = {};
  for (const item of saleItems) {
    const s = (stats[item.productId] ??= { sold30: 0, sold90: 0 });
    s.sold90 += item.quantity;
    if (item.sale.createdAt >= d30) s.sold30 += item.quantity;
  }

  // Most relevant products first: recent sales activity, then low stock relative to reorder level
  const ranked = products
    .map((p: (typeof products)[number]) => ({ ...p, ...(stats[p.id] ?? { sold30: 0, sold90: 0 }) }))
    .sort(
      (a: { sold90: number; quantityInStock: number }, b: { sold90: number; quantityInStock: number }) =>
        b.sold90 - a.sold90 || a.quantityInStock - b.quantityInStock
    )
    .slice(0, MAX_PRODUCTS);

  const inputLines = ranked.map(
    (p: (typeof ranked)[number]) =>
      `id=${p.id} | ${p.name} (${p.sku}) | category=${p.category?.name || "-"} | in_stock=${p.quantityInStock} | reorder_level=${p.reorderLevel} | sold_last_30d=${p.sold30} | sold_last_90d=${p.sold90} | price=${p.sellingPrice}`
  );

  let text: string;
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
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an inventory analyst for a retail store. Forecast demand from the sales history provided and recommend reorder quantities. Be realistic: base forecasts on the 30/90-day sales trend, keep confidence low when history is thin, and recommend 0 reorder when stock comfortably covers forecast demand.\n\n" +
              OUTPUT_FORMAT_INSTRUCTIONS,
          },
          {
            role: "user",
            content: `Today is ${now.toISOString().slice(0, 10)}. Analyze these products and produce a demand forecast and reorder recommendation for each, as JSON:\n\n${inputLines.join("\n")}\n\nAlso audit this payment summary for the last 30 days and provide a concise paymentAuditSummary:\n${JSON.stringify(paymentSnapshot)}`,
          },
        ],
      }),
    });

    if (res.status === 401) {
      return Response.json({ message: "The GROQ_API_KEY is invalid. Check the key in .env." }, { status: 503 });
    }
    if (res.status === 429) {
      return Response.json({ message: "The AI service is rate-limited. Try again in a minute." }, { status: 502 });
    }
    if (!res.ok) {
      console.error("Groq request failed:", res.status, await res.text().catch(() => ""));
      return Response.json({ message: "The AI request failed. Try again shortly." }, { status: 502 });
    }

    const body = await res.json();
    text = body?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("AI insights request failed:", e);
    return Response.json({ message: "The AI request failed. Try again shortly." }, { status: 502 });
  }

  let result: InsightsResult;
  try {
    result = JSON.parse(text);
  } catch {
    return Response.json({ message: "The AI returned an unreadable response. Try again." }, { status: 502 });
  }

  const validIds = new Set(ranked.map((p: { id: string }) => p.id));
  const predictions = (result.predictions ?? []).filter((p) => validIds.has(p.productId));
  const predictedForDate = new Date(now.getTime() + 30 * 86400000);

  await prisma.$transaction(
    [
      prisma.inventoryPrediction.deleteMany({ where: { predictionType: PREDICTION_TYPE } }),
      prisma.inventoryPrediction.createMany({
        data: predictions.map((p) => ({
          productId: p.productId,
          predictionType: PREDICTION_TYPE,
          predictionData: {
            predictedDemandNext30Days: p.predictedDemandNext30Days,
            recommendedReorderQuantity: p.recommendedReorderQuantity,
            stockoutRisk: p.stockoutRisk,
            reasoning: p.reasoning,
          },
          confidenceScore: p.confidence,
          predictedForDate,
        })),
      }),
      prisma.predictionLog.createMany({
        data: predictions.map((p) => ({
          productId: p.productId,
          predictionType: PREDICTION_TYPE,
          predictedValue: p.predictedDemandNext30Days,
          predictionDate: now,
        })),
      }),
      prisma.setting.upsert({
        where: { key: "ai_insights_summary" },
        update: { value: result.summary },
        create: { key: "ai_insights_summary", value: result.summary, description: "Latest AI inventory summary" },
      }),
      prisma.setting.upsert({
        where: { key: "ai_insights_generated_at" },
        update: { value: now.toISOString() },
        create: { key: "ai_insights_generated_at", value: now.toISOString(), description: "When AI insights were last generated" },
      }),
      prisma.setting.upsert({
        where: { key: "ai_insights_payment_audit_summary" },
        update: { value: result.paymentAuditSummary || "" },
        create: {
          key: "ai_insights_payment_audit_summary",
          value: result.paymentAuditSummary || "",
          description: "Latest AI summary for payment-method totals vs sales totals",
        },
      }),
    ],
    { maxWait: 10000, timeout: 30000 }
  );

  return Response.json(
    {
      data: {
        summary: result.summary,
        paymentAuditSummary: result.paymentAuditSummary || null,
        paymentSnapshot,
        generatedAt: now.toISOString(),
        count: predictions.length,
      },
    },
    { status: 201 }
  );
}
