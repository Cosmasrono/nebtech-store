import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const PREDICTION_TYPE = "demand_forecast";
const MAX_PRODUCTS = 40;

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
  predictions: ProductPrediction[];
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "predictions"],
  properties: {
    summary: {
      type: "string",
      description: "2-4 sentence overview of the inventory situation and the most urgent actions.",
    },
    predictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "productId",
          "predictedDemandNext30Days",
          "recommendedReorderQuantity",
          "stockoutRisk",
          "confidence",
          "reasoning",
        ],
        properties: {
          productId: { type: "string", description: "The product id exactly as given in the input." },
          predictedDemandNext30Days: { type: "number", description: "Forecast units sold over the next 30 days." },
          recommendedReorderQuantity: { type: "integer", description: "Units to reorder now; 0 if none needed." },
          stockoutRisk: { type: "string", enum: ["none", "low", "medium", "high"] },
          confidence: { type: "number", description: "0 to 1." },
          reasoning: { type: "string", description: "One sentence explaining the forecast." },
        },
      },
    },
  },
} as const;

// GET — latest prediction per product + stored summary
export async function GET() {
  const { error } = await requireAuth("view_inventory_reports");
  if (error) return error;

  const [rows, summarySetting, generatedSetting] = await Promise.all([
    prisma.inventoryPrediction.findMany({
      where: { predictionType: PREDICTION_TYPE },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { product: { select: { id: true, name: true, sku: true, quantityInStock: true, reorderLevel: true } } },
    }),
    prisma.setting.findUnique({ where: { key: "ai_insights_summary" } }),
    prisma.setting.findUnique({ where: { key: "ai_insights_generated_at" } }),
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
      predictions: latest,
    },
  });
}

// POST — generate fresh predictions with Claude
export async function POST() {
  const { error } = await requireAuth("view_inventory_reports");
  if (error) return error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { message: "AI is not configured. Set ANTHROPIC_API_KEY in .env and restart the server." },
      { status: 503 }
    );
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  const [products, saleItems] = await Promise.all([
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

  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        "You are an inventory analyst for a retail store. Forecast demand from the sales history provided and recommend reorder quantities. Be realistic: base forecasts on the 30/90-day sales trend, keep confidence low when history is thin, and recommend 0 reorder when stock comfortably covers forecast demand.",
      messages: [
        {
          role: "user",
          content: `Today is ${now.toISOString().slice(0, 10)}. Analyze these products and produce a demand forecast and reorder recommendation for each:\n\n${inputLines.join("\n")}`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });
  } catch (e) {
    console.error("AI insights request failed:", e);
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ message: "The ANTHROPIC_API_KEY is invalid. Check the key in .env." }, { status: 503 });
    }
    return Response.json({ message: "The AI request failed. Try again shortly." }, { status: 502 });
  }

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    return Response.json({ message: "The AI could not complete the analysis. Try again." }, { status: 502 });
  }

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  )?.text;

  let result: InsightsResult;
  try {
    result = JSON.parse(text ?? "");
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
    ],
    { maxWait: 10000, timeout: 30000 }
  );

  return Response.json(
    { data: { summary: result.summary, generatedAt: now.toISOString(), count: predictions.length } },
    { status: 201 }
  );
}
