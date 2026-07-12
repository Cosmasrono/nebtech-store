"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => setStats(d.data));
  }, []);

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
