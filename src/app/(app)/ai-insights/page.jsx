"use client";

import { useEffect, useState } from "react";

const RISK_STYLES = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-sky-100 text-sky-700",
  none: "bg-slate-100 text-slate-500",
};

export default function AiInsightsPage() {
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    const r = await fetch("/api/ai/insights");
    if (r.ok) setData((await r.json()).data);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/insights", { method: "POST" });
      const body = await r.json();
      if (!r.ok) setError(body.message || "Generation failed.");
      else await load();
    } catch {
      setError("Generation failed. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  const predictions = data?.predictions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">AI Insights</h1>
          <p className="text-sm text-slate-500">
            Demand forecasts and reorder recommendations, powered by Claude.
            {data?.generatedAt && <> Last generated {new Date(data.generatedAt).toLocaleString()}.</>}
          </p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={generating}>
          {generating ? "Analyzing…" : "Generate insights"}
        </button>
      </div>

      {error && (
        <div className="card p-4 border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</div>
      )}

      {generating && (
        <div className="card p-4 text-sm text-slate-500">
          Claude is analyzing your sales history and stock levels. This can take a minute or two…
        </div>
      )}

      {data?.summary && (
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Summary</div>
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </div>
      )}

      <div className="card">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Product forecasts (next 30 days)</div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Product</th>
              <th className="table-th text-right">In stock</th>
              <th className="table-th text-right">Forecast demand</th>
              <th className="table-th text-right">Reorder qty</th>
              <th className="table-th">Stockout risk</th>
              <th className="table-th text-right">Confidence</th>
              <th className="table-th">Why</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p) => {
              const d = p.predictionData || {};
              return (
                <tr key={p.id}>
                  <td className="table-td">
                    <div className="font-medium">{p.product?.name}</div>
                    <div className="text-xs text-slate-400">{p.product?.sku}</div>
                  </td>
                  <td className="table-td text-right">{p.product?.quantityInStock}</td>
                  <td className="table-td text-right font-medium">{d.predictedDemandNext30Days}</td>
                  <td className="table-td text-right font-medium">
                    {d.recommendedReorderQuantity > 0 ? d.recommendedReorderQuantity : "—"}
                  </td>
                  <td className="table-td">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_STYLES[d.stockoutRisk] || RISK_STYLES.none}`}>
                      {d.stockoutRisk || "none"}
                    </span>
                  </td>
                  <td className="table-td text-right">{Math.round((p.confidenceScore || 0) * 100)}%</td>
                  <td className="table-td text-sm text-slate-500 max-w-xs">{d.reasoning}</td>
                </tr>
              );
            })}
            {!predictions.length && (
              <tr>
                <td className="table-td text-slate-400" colSpan={7}>
                  No insights yet. Click "Generate insights" to analyze your inventory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
