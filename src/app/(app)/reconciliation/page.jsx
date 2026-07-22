"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const day = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 10);
const QUICK_PROMPTS = [
  "What is the total cost of goods sold in this selected period?",
  "Using confirmed amounts, do payments match sales total?",
  "Show the variance and the likely reason for mismatch.",
  "What is gross profit for this selected period?",
];

function Variance({ value }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const ok = Math.abs(value) <= 0.009;
  return (
    <span className={`font-semibold ${ok ? "text-emerald-600" : "text-rose-600"}`}>
      {ok ? "Balanced" : `${value > 0 ? "+" : "−"} ${fmt(Math.abs(value))}`}
    </span>
  );
}

function groupRows(rows, keyFn, labelKey) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!map.has(key)) {
      map.set(key, { [labelKey]: key, shifts: 0, discrepancies: 0, open: 0, cashSales: 0, cashVariance: 0, hasClosed: false, mpesaSales: 0, mpesaConfirmed: 0, mpesaVariance: 0, cardSales: 0 });
    }
    const g = map.get(key);
    g.shifts += 1;
    if (r.status === "discrepancy") g.discrepancies += 1;
    if (r.status === "open") g.open += 1;
    g.cashSales += r.totalCashSales;
    if (r.cashVariance != null) { g.cashVariance += r.cashVariance; g.hasClosed = true; }
    g.mpesaSales += r.mpesaSales;
    g.mpesaConfirmed += r.mpesaConfirmed;
    g.mpesaVariance += r.mpesaVariance;
    g.cardSales += r.cardSales;
  }
  return [...map.values()];
}

export default function ReconciliationPage() {
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [promptUsed, setPromptUsed] = useState(null);
  const [from, setFrom] = useState(day(7 * 24 * 60 * 60 * 1000));
  const [to, setTo] = useState(day(0));
  const [groupBy, setGroupBy] = useState("shift");
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reconciliation?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.data || []);
        setOverview(d.overview || null);
        setAiSummary(null);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  async function runAiCheck(promptText = "") {
    setAiLoading(true);
    try {
      const q = encodeURIComponent(promptText);
      const r = await fetch(`/api/reconciliation?from=${from}&to=${to}&ai=1${promptText ? `&prompt=${q}` : ""}`);
      const d = await r.json();
      setOverview(d.overview || null);
      setAiSummary(d.aiSummary || "AI check could not generate a summary. Please try again.");
      setPromptUsed(d.promptUsed || null);
    } finally {
      setAiLoading(false);
    }
  }

  const byDay = useMemo(
    () => groupRows(rows, (r) => new Date(r.openedAt).toLocaleDateString("en-KE"), "label").sort((a, b) => (a.label < b.label ? 1 : -1)),
    [rows]
  );
  const byBranch = useMemo(() => groupRows(rows, (r) => r.branch, "label").sort((a, b) => (a.label > b.label ? 1 : -1)), [rows]);

  const totals = useMemo(() => {
    const t = groupRows(rows, () => "total", "label")[0];
    return t || { shifts: 0, discrepancies: 0, open: 0, cashSales: 0, cashVariance: 0, hasClosed: false, mpesaSales: 0, mpesaConfirmed: 0, mpesaVariance: 0, cardSales: 0 };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Reconciliation</h1>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button className="btn-primary" onClick={runAiCheck} disabled={aiLoading}>
            {aiLoading ? "Running AI check..." : "Run AI Check"}
          </button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {[["shift", "By shift"], ["day", "By day"], ["branch", "By branch"]].map(([v, label]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                className={`px-3 py-1.5 text-sm ${groupBy === v ? "bg-teal-600 text-white" : "bg-white hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
          <label>From</label>
          <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label>To</label>
          <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Quick AI Prompts</div>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              className="btn-secondary !py-1.5 text-sm"
              disabled={aiLoading}
              onClick={() => runAiCheck(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* General summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Shifts" value={totals.shifts} sub={`${totals.open} open · ${totals.discrepancies} discrepancies`} />
        <Card label="Cash sales" value={fmt(totals.cashSales)} />
        <Card label="Cash variance" value={<Variance value={totals.hasClosed ? totals.cashVariance : null} />} />
        <Card label="M-Pesa sales" value={fmt(totals.mpesaSales)} />
        <Card label="M-Pesa confirmed" value={fmt(totals.mpesaConfirmed)} />
        <Card label="M-Pesa variance" value={<Variance value={rows.length ? totals.mpesaVariance : null} />} />
      </div>

      {overview && (
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Payment Check (Confirmed, Selected Period)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card label="Cash (net)" value={fmt(overview.cashNet)} />
            <Card label="M-Pesa confirmed" value={fmt(overview.mpesaConfirmedTotal)} />
            <Card label="Card" value={fmt(overview.cardTotal)} />
            <Card label="Payment sum (confirmed)" value={fmt(overview.paymentSumConfirmed)} />
            <Card label="Sales total" value={fmt(overview.salesTotal)} />
            <Card label="Variance (confirmed)" value={<Variance value={overview.varianceConfirmed} />} />
            <Card label="Products sold" value={overview.productsSoldUnits} sub="Units sold" />
            <Card label="Completed sales" value={overview.salesCount} />
            <Card label="M-Pesa recorded" value={fmt(overview.mpesaRecordedTotal)} />
            <Card label="Variance (recorded)" value={<Variance value={overview.varianceRecorded} />} />
            <Card label="COGS" value={fmt(overview.cogsTotal)} />
            <Card label="Gross profit" value={fmt(overview.grossProfit)} />
          </div>
        </div>
      )}

      {aiSummary && (
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">AI Reconciliation Summary</div>
          {promptUsed && <p className="text-xs text-slate-500 mb-2">Prompt: {promptUsed}</p>}
          <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
        </div>
      )}

      <div className="card overflow-x-auto">
        {groupBy === "shift" ? (
          <ShiftTable rows={rows} loading={loading} />
        ) : (
          <GroupTable rows={groupBy === "day" ? byDay : byBranch} label={groupBy === "day" ? "Date" : "Branch"} loading={loading} totals={totals} />
        )}
      </div>
      <p className="text-xs text-slate-400">
        Cash variance = counted drawer − (opening float + cash sales − refunds), closed shifts only. M-Pesa variance = confirmed STK payments − M-Pesa recorded on sales.
        Cross-check confirmed M-Pesa against your Safaricom statement periodically.
      </p>
    </div>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function GroupTable({ rows, label, loading, totals }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="table-th">{label}</th>
          <th className="table-th text-right">Shifts</th>
          <th className="table-th text-right">Discrepancies</th>
          <th className="table-th text-right">Cash sales</th>
          <th className="table-th text-right">Cash variance</th>
          <th className="table-th text-right">M-Pesa sales</th>
          <th className="table-th text-right">M-Pesa confirmed</th>
          <th className="table-th text-right">M-Pesa variance</th>
          <th className="table-th text-right">Card sales</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.label} className={`hover:bg-slate-50 ${g.discrepancies ? "bg-rose-50/50" : ""}`}>
            <td className="table-td font-medium">{g.label}</td>
            <td className="table-td text-right">{g.shifts}{g.open ? <span className="text-sky-600 text-xs"> ({g.open} open)</span> : null}</td>
            <td className="table-td text-right">{g.discrepancies || "—"}</td>
            <td className="table-td text-right">{fmt(g.cashSales)}</td>
            <td className="table-td text-right"><Variance value={g.hasClosed ? g.cashVariance : null} /></td>
            <td className="table-td text-right">{fmt(g.mpesaSales)}</td>
            <td className="table-td text-right">{fmt(g.mpesaConfirmed)}</td>
            <td className="table-td text-right"><Variance value={g.mpesaVariance} /></td>
            <td className="table-td text-right">{fmt(g.cardSales)}</td>
          </tr>
        ))}
        {rows.length > 1 && (
          <tr className="font-semibold bg-slate-50">
            <td className="table-td">Total</td>
            <td className="table-td text-right">{totals.shifts}</td>
            <td className="table-td text-right">{totals.discrepancies || "—"}</td>
            <td className="table-td text-right">{fmt(totals.cashSales)}</td>
            <td className="table-td text-right"><Variance value={totals.hasClosed ? totals.cashVariance : null} /></td>
            <td className="table-td text-right">{fmt(totals.mpesaSales)}</td>
            <td className="table-td text-right">{fmt(totals.mpesaConfirmed)}</td>
            <td className="table-td text-right"><Variance value={totals.mpesaVariance} /></td>
            <td className="table-td text-right">{fmt(totals.cardSales)}</td>
          </tr>
        )}
        {!rows.length && !loading && <tr><td className="table-td text-slate-400" colSpan={9}>No shifts in this period.</td></tr>}
        {loading && <tr><td className="table-td text-slate-400" colSpan={9}><span className="inline-flex items-center gap-2"><Spinner /> Loading…</span></td></tr>}
      </tbody>
    </table>
  );
}

function ShiftTable({ rows, loading }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="table-th">Cashier</th><th className="table-th">Branch</th>
          <th className="table-th">Opened</th><th className="table-th">Status</th>
          <th className="table-th text-right">Float</th><th className="table-th text-right">Cash sales</th>
          <th className="table-th text-right">Expected cash</th><th className="table-th text-right">Counted</th>
          <th className="table-th text-right">Cash variance</th>
          <th className="table-th text-right">M-Pesa sales</th><th className="table-th text-right">M-Pesa confirmed</th>
          <th className="table-th text-right">M-Pesa variance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={`hover:bg-slate-50 ${r.status === "discrepancy" ? "bg-rose-50/50" : ""}`}>
            <td className="table-td font-medium">{r.cashier}</td>
            <td className="table-td">{r.branch}</td>
            <td className="table-td text-slate-500 whitespace-nowrap">{new Date(r.openedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="table-td">
              <span className={`badge ${
                r.status === "open" ? "bg-sky-100 text-sky-700"
                : r.status === "discrepancy" ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700"}`}>
                {r.status}
              </span>
            </td>
            <td className="table-td text-right">{fmt(r.openingCash)}</td>
            <td className="table-td text-right">{fmt(r.totalCashSales)}</td>
            <td className="table-td text-right">{fmt(r.expectedCash)}</td>
            <td className="table-td text-right">{r.countedCash == null ? "—" : fmt(r.countedCash)}</td>
            <td className="table-td text-right"><Variance value={r.cashVariance} /></td>
            <td className="table-td text-right">{fmt(r.mpesaSales)}</td>
            <td className="table-td text-right">{fmt(r.mpesaConfirmed)}</td>
            <td className="table-td text-right"><Variance value={r.mpesaVariance} /></td>
          </tr>
        ))}
        {!rows.length && !loading && <tr><td className="table-td text-slate-400" colSpan={12}>No shifts in this period.</td></tr>}
        {loading && <tr><td className="table-td text-slate-400" colSpan={12}><span className="inline-flex items-center gap-2"><Spinner /> Loading…</span></td></tr>}
      </tbody>
    </table>
  );
}
