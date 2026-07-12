"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function SalesPage() {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });

  async function load() {
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    const res = await fetch(`/api/sales?${params}`);
    if (res.ok) setRows((await res.json()).data);
  }
  useEffect(() => { load(); }, [range]); // eslint-disable-line

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Sales</h1>
        <div className="flex gap-2 items-center text-sm">
          <input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-slate-400">to</span>
          <input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Receipt</th><th className="table-th">Date</th><th className="table-th">Cashier</th>
              <th className="table-th">Payment</th><th className="table-th text-right">Items</th>
              <th className="table-th text-right">Total</th><th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="table-td"><Link className="text-teal-700 font-medium hover:underline" href={`/sales/${s.id}`}>{s.receiptNumber}</Link></td>
                <td className="table-td text-slate-500">{new Date(s.createdAt).toLocaleString("en-KE")}</td>
                <td className="table-td">{s.cashier?.name}</td>
                <td className="table-td capitalize">{s.primaryPaymentMethod}</td>
                <td className="table-td text-right">{s.items?.length || 0}</td>
                <td className="table-td text-right font-semibold">{fmt(s.totalAmount)}</td>
                <td className="table-td">
                  <span className={`badge ${s.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{s.status}</span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No sales found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
