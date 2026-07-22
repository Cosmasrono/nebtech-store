"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const day = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 10);

const STATUS_STYLE = {
  confirmed: "bg-emerald-100 text-emerald-700",
  pending: "bg-sky-100 text-sky-700",
  initiated: "bg-sky-100 text-sky-700",
  failed: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
  reversed: "bg-rose-100 text-rose-700",
};

export default function MpesaPaymentsPage() {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(day(7 * 24 * 60 * 60 * 1000));
  const [to, setTo] = useState(day(0));
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch(`/api/mpesa?from=${from}&to=${to}&status=${status}`)
      .then((r) => r.json())
      .then((d) => setRows(d.data || []))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [from, to, status]); // eslint-disable-line

  async function reverse(id) {
    const res = await fetch(`/api/mpesa/${id}/reverse`, { method: "POST" });
    setConfirming(null);
    if (res.ok) load();
  }

  const confirmedTotal = rows.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.amount, 0);
  const reversedTotal = rows.filter((r) => r.status === "reversed").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">M-Pesa Payments</h1>
        <div className="flex items-center gap-2 text-sm">
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["confirmed", "pending", "failed", "cancelled", "reversed"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label>From</label>
          <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label>To</label>
          <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Transactions</div>
          <div className="text-2xl font-bold">{rows.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Confirmed total</div>
          <div className="text-2xl font-bold text-emerald-600">{fmt(confirmedTotal)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Reversed total</div>
          <div className="text-2xl font-bold text-rose-600">{fmt(reversedTotal)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Date</th><th className="table-th">Phone</th>
              <th className="table-th text-right">Amount</th><th className="table-th">M-Pesa receipt</th>
              <th className="table-th">Sale</th><th className="table-th">Cashier</th>
              <th className="table-th">Status</th><th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`hover:bg-slate-50 ${t.status === "reversed" ? "bg-rose-50/50" : ""}`}>
                <td className="table-td text-slate-500 whitespace-nowrap">{new Date(t.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="table-td">{t.phoneNumber}</td>
                <td className="table-td text-right font-medium">{fmt(t.amount)}</td>
                <td className="table-td font-mono text-xs">{t.mpesaReceiptNumber || "—"}</td>
                <td className="table-td font-mono text-xs">{t.sale?.receiptNumber || "—"}</td>
                <td className="table-td">{t.user?.name || "—"}</td>
                <td className="table-td"><span className={`badge ${STATUS_STYLE[t.status] || ""}`}>{t.status}</span></td>
                <td className="table-td text-right">
                  {t.status === "confirmed" && (
                    confirming === t.id ? (
                      <span className="whitespace-nowrap text-xs">
                        Sure?{" "}
                        <button className="text-rose-600 font-semibold hover:underline" onClick={() => reverse(t.id)}>Yes, reverse</button>
                        {" · "}
                        <button className="text-slate-500 hover:underline" onClick={() => setConfirming(null)}>No</button>
                      </span>
                    ) : (
                      <button className="text-rose-600 text-sm hover:underline" onClick={() => setConfirming(t.id)}>Mark reversed</button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td className="table-td text-slate-400" colSpan={8}>No M-Pesa transactions in this period.</td></tr>}
            {loading && <tr><td className="table-td text-slate-400" colSpan={8}><span className="inline-flex items-center gap-2"><Spinner /> Loading…</span></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Mark a payment as reversed when Safaricom reverses it (customer dispute/refund). Reversed payments are removed from confirmed
        totals, so the affected shift will show a red M-Pesa variance on the Reconciliation page.
      </p>
    </div>
  );
}
