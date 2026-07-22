"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const fmt = (n) =>
  `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => setStats(d.data));
    fetch("/api/ai/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAi(d.data))
      .catch(() => {});
  }, []);

  async function regenerateAi() {
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/insights", { method: "POST" });
      if (r.ok) {
        const d = await fetch("/api/ai/insights").then((x) => x.json());
        setAi(d.data);
      }
    } finally {
      setAiLoading(false);
    }
  }

  if (!stats) return <div className="text-slate-500">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link href="/pos" className="btn-amber">Open POS</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Today's revenue" value={fmt(stats.todayRevenue)} sub={`${stats.todayCount} sale(s)`} />
        <Stat label="This month" value={fmt(stats.monthRevenue)} />
        <Stat label="Active products" value={stats.productCount} />
        <Stat label="Pending expenses" value={stats.pendingExpenses} sub={stats.activeShift ? "Shift open" : "No open shift"} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm">Revenue — last 14 days</div>
            <div className="text-xs text-slate-500">
              Total: {fmt(stats.trend.reduce((a, b) => a + b.revenue, 0))}
            </div>
          </div>
          <TrendChart data={stats.trend} />
        </div>

        <div className="card p-4">
          <div className="font-semibold text-sm mb-3">Payment methods (30d)</div>
          <PaymentDonut data={stats.payments} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-4">
          <div className="font-semibold text-sm mb-3">Sales by category (30d)</div>
          <CategoryPie data={stats.categories} />
        </div>
        <div className="card p-4">
          <div className="font-semibold text-sm mb-3">Top products — last 30 days</div>
          <TopProductsBar data={stats.topProducts} />
        </div>

        <AiCard ai={ai} loading={aiLoading} onRegenerate={regenerateAi} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Recent sales</div>
          <table className="w-full">
            <thead><tr><th className="table-th">Receipt</th><th className="table-th">Cashier</th><th className="table-th text-right">Total</th></tr></thead>
            <tbody>
              {stats.recentSales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="table-td"><Link className="text-teal-700 hover:underline" href={`/sales/${s.id}`}>{s.receiptNumber}</Link></td>
                  <td className="table-td">{s.cashier?.name}</td>
                  <td className="table-td text-right font-medium">{fmt(s.totalAmount)}</td>
                </tr>
              ))}
              {!stats.recentSales.length && <tr><td className="table-td text-slate-400" colSpan={3}>No sales yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Low stock alerts</div>
          <table className="w-full">
            <thead><tr><th className="table-th">Product</th><th className="table-th text-right">In stock</th><th className="table-th text-right">Reorder at</th></tr></thead>
            <tbody>
              {stats.lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="table-td">{p.name}</td>
                  <td className="table-td text-right">
                    <span className={`badge ${p.quantityInStock <= 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{p.quantityInStock}</span>
                  </td>
                  <td className="table-td text-right text-slate-500">{p.reorderLevel}</td>
                </tr>
              ))}
              {!stats.lowStock.length && <tr><td className="table-td text-slate-400" colSpan={3}>All stocked up.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ---------- Charts (inline SVG, no deps) ---------- */

function TrendChart({ data }) {
  const w = 640, h = 200, pad = { l: 40, r: 10, t: 10, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bw = iw / data.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52">
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + ih * (1 - t);
        return (
          <g key={t}>
            <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" className="fill-slate-400" fontSize="10">
              {fmtShort(max * t)}
            </text>
          </g>
        );
      })}
      {/* bars */}
      {data.map((d, i) => {
        const bh = (d.revenue / max) * ih;
        const x = pad.l + i * bw + 3;
        const y = pad.t + ih - bh;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={Math.max(2, bw - 6)} height={bh} rx="3" fill="#0d9488">
              <title>{`${d.date}: ${fmt(d.revenue)} (${d.count} sales)`}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={x + (bw - 6) / 2} y={h - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PaymentDonut({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const size = 180, r = 70, cx = size / 2, cy = size / 2;

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-slate-400">
        No payments yet.
      </div>
    );
  }

  let acc = 0;
  const arcs = data.map((d) => {
    const start = acc / total;
    acc += d.value;
    const end = acc / total;
    return { ...d, path: arcPath(cx, cy, r, 30, start, end) };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 mx-auto">
        {arcs.map((a) => (
          <path key={a.label} d={a.path} fill={a.color}>
            <title>{`${a.label}: ${fmt(a.value)}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-700" fontSize="12" fontWeight="600">
          Total
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-500" fontSize="11">
          {fmtShort(total)}
        </text>
      </svg>
      <ul className="mt-2 space-y-1 text-xs">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
              {a.label}
            </span>
            <span className="tabular-nums text-slate-500">
              {fmt(a.value)} <span className="text-slate-400">({((a.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryPie({ data }) {
  const total = (data || []).reduce((a, b) => a + b.value, 0);
  const size = 180, r = 80, cx = size / 2, cy = size / 2;

  if (!data?.length || total <= 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-slate-400">
        No sales yet.
      </div>
    );
  }

  const nonZero = data.filter((d) => d.value > 0);
  const onlyOne = nonZero.length === 1;

  let acc = 0;
  const slices = data.map((d) => {
    const start = acc / total;
    acc += d.value;
    const end = acc / total;
    return { ...d, path: arcPath(cx, cy, r, 0, start, end) };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-44 h-44 mx-auto">
        {onlyOne ? (
          <circle cx={cx} cy={cy} r={r} fill={nonZero[0].color}>
            <title>{`${nonZero[0].label}: ${fmt(nonZero[0].value)} (100%)`}</title>
          </circle>
        ) : (
          slices.map((s) => (
            <path key={s.label} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1">
              <title>{`${s.label}: ${fmt(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
            </path>
          ))
        )}
      </svg>
      <ul className="mt-3 space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2 truncate">
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="tabular-nums text-slate-500 shrink-0">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function arcPath(cx, cy, rOuter, rInner, startFrac, endFrac) {
  const a0 = startFrac * Math.PI * 2 - Math.PI / 2;
  const a1 = endFrac * Math.PI * 2 - Math.PI / 2;
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  const x0 = cx + rOuter * Math.cos(a0), y0 = cy + rOuter * Math.sin(a0);
  const x1 = cx + rOuter * Math.cos(a1), y1 = cy + rOuter * Math.sin(a1);
  const x2 = cx + rInner * Math.cos(a1), y2 = cy + rInner * Math.sin(a1);
  const x3 = cx + rInner * Math.cos(a0), y3 = cy + rInner * Math.sin(a0);
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
}

function TopProductsBar({ data }) {
  if (!data.length) {
    return <div className="h-40 flex items-center justify-center text-sm text-slate-400">No sales in the last 30 days.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.quantity));
  return (
    <ul className="space-y-3">
      {data.map((p) => (
        <li key={p.id}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-700 truncate">{p.name}</span>
            <span className="text-slate-500 tabular-nums">
              {p.quantity} units · {fmt(p.revenue)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-teal-700"
              style={{ width: `${(p.quantity / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AiCard({ ai, loading, onRegenerate }) {
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
          AI Insights
        </div>
        <button
          className="text-xs text-teal-700 hover:underline disabled:text-slate-400"
          onClick={onRegenerate}
          disabled={loading}
        >
          {loading ? "Analyzing…" : "Refresh"}
        </button>
      </div>

      {ai?.summary ? (
        <>
          <p className="text-sm text-slate-700 leading-relaxed">{ai.summary}</p>
          {ai.paymentAuditSummary && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3">Payment audit</div>
              <p className="text-sm text-slate-700 leading-relaxed">{ai.paymentAuditSummary}</p>
            </>
          )}
          {ai.generatedAt && (
            <div className="text-xs text-slate-400 mt-3">
              Updated {new Date(ai.generatedAt).toLocaleString()}
            </div>
          )}
          <Link href="/ai-insights" className="text-xs text-teal-700 hover:underline mt-2">
            View full forecasts →
          </Link>
        </>
      ) : (
        <div className="text-sm text-slate-500 flex-1 flex flex-col justify-center">
          <p>No AI summary yet.</p>
          <p className="text-xs mt-1">Click <b>Refresh</b> to generate a summary and product forecasts.</p>
        </div>
      )}
    </div>
  );
}
