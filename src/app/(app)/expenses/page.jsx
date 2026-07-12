"use client";

import { useEffect, useState } from "react";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function ExpensesPage() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [creating, setCreating] = useState(false);
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/expenses").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => {
    load();
    fetch("/api/expense-categories").then((r) => r.json()).then((d) => setCats(d.data || []));
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user));
  }, []);

  const canApprove = me?.roles?.some((r) => ["owner", "super_admin", "manager"].includes(r));

  async function act(id, action) {
    const res = await fetch(`/api/expenses/${id}/${action}`, { method: "POST" });
    if (res.ok) load();
    else setMsg({ ok: false, text: (await res.json()).message || "Action failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Expenses</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>Record expense</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Date</th><th className="table-th">Category</th><th className="table-th">Description</th>
            <th className="table-th">By</th><th className="table-th text-right">Amount</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="table-td text-slate-500">{new Date(e.expenseDate).toLocaleDateString("en-KE")}</td>
                <td className="table-td">{e.category?.name}</td>
                <td className="table-td">{e.description}</td>
                <td className="table-td">{e.user?.name}</td>
                <td className="table-td text-right font-medium">{fmt(e.amount)}</td>
                <td className="table-td"><StatusBadge value={e.status} map={STATUS_COLORS} /></td>
                <td className="table-td text-right space-x-2">
                  {canApprove && e.status === "pending" && (
                    <>
                      <button className="text-emerald-600 text-sm hover:underline" onClick={() => act(e.id, "approve")}>Approve</button>
                      <button className="text-rose-600 text-sm hover:underline" onClick={() => act(e.id, "reject")}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No expenses.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <ExpenseModal cats={cats} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} setMsg={setMsg} />}
    </div>
  );
}

function ExpenseModal({ cats, onClose, onDone, setMsg }) {
  const [form, setForm] = useState({ categoryId: "", amount: "", description: "", expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "cash" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Failed to record expense." });
  }

  return (
    <Modal title="Record expense" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Category *</label>
          <select className="input" value={form.categoryId} onChange={set("categoryId")}>
            <option value="">Select…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Amount (KSh) *</label><input type="number" step="0.01" className="input" value={form.amount} onChange={set("amount")} /></div>
          <div><label className="label">Date</label><input type="date" className="input" value={form.expenseDate} onChange={set("expenseDate")} /></div>
        </div>
        <div><label className="label">Payment method</label>
          <select className="input" value={form.paymentMethod} onChange={set("paymentMethod")}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option>
          </select>
        </div>
        <div><label className="label">Description *</label><textarea className="input" rows={2} value={form.description} onChange={set("description")} /></div>
        <button className="btn-primary w-full" onClick={submit}>Save expense</button>
      </div>
    </Modal>
  );
}
