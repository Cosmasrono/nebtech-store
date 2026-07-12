"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/components/ui";

const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const [range, setRange] = useState({ from: firstOfMonth(), to: today() });
  const [sales, setSales] = useState(null);
  const [pnl, setPnl] = useState(null);

  useEffect(() => {
    const qs = `from=${range.from}&to=${range.to}`;
    fetch(`/api/reports/sales?${qs}`).then((r) => r.json()).then((d) => setSales(d.data));
    fetch(`/api/reports/pnl?${qs}`).then((r) => r.json()).then((d) => setPnl(d.data));
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Reports</h1>
        <div className="flex gap-2 items-center text-sm">
          <input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-slate-400">to</span>
          <input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      </div>

      {pnl && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Stat label="Revenue" value={fmt(pnl.revenue)} />
          <Stat label="COGS" value={fmt(pnl.cogs)} />
          <Stat label="Gross profit" value={fmt(pnl.grossProfit)} />
          <Stat label="Expenses" value={fmt(pnl.expenses)} />
          <Stat label="Net profit" value={fmt(pnl.netProfit)} highlight={pnl.netProfit >= 0} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Daily sales</div>
          <table className="w-full">
            <thead><tr><th className="table-th">Day</th><th className="table-th text-right">Sales</th><th className="table-th text-right">Revenue</th></tr></thead>
            <tbody>
              {(sales?.daily || []).map((d) => (
                <tr key={d.date}><td className="table-td">{d.date}</td><td className="table-td text-right">{d.count}</td><td className="table-td text-right font-medium">{fmt(d.revenue)}</td></tr>
              ))}
              {!sales?.daily?.length && <tr><td className="table-td text-slate-400" colSpan={3}>No sales in range.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Top products</div>
          <table className="w-full">
            <thead><tr><th className="table-th">Product</th><th className="table-th text-right">Qty sold</th><th className="table-th text-right">Revenue</th></tr></thead>
            <tbody>
              {(sales?.topProducts || []).map((p) => (
                <tr key={p.productId}><td className="table-td">{p.name}</td><td className="table-td text-right">{p.quantity}</td><td className="table-td text-right font-medium">{fmt(p.revenue)}</td></tr>
              ))}
              {!sales?.topProducts?.length && <tr><td className="table-td text-slate-400" colSpan={3}>No data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${highlight === undefined ? "" : highlight ? "text-emerald-600" : "text-rose-600"}`}>{value}</div>
    </div>
  );
}
