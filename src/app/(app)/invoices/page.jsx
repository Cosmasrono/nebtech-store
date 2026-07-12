"use client";

import { useEffect, useState } from "react";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-sky-100 text-sky-700",
  partially_paid: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
};

export default function InvoicesPage() {
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/invoices").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Invoices</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>New invoice</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Invoice</th><th className="table-th">Customer</th><th className="table-th">Due</th>
            <th className="table-th text-right">Total</th><th className="table-th text-right">Balance</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{inv.invoiceNumber}</td>
                <td className="table-td">{inv.customerName}</td>
                <td className="table-td text-slate-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-KE") : "—"}</td>
                <td className="table-td text-right">{fmt(inv.totalAmount)}</td>
                <td className="table-td text-right font-medium">{fmt(inv.balance)}</td>
                <td className="table-td"><StatusBadge value={inv.status} map={STATUS_COLORS} /></td>
                <td className="table-td text-right">
                  {inv.balance > 0 && <button className="text-teal-700 text-sm hover:underline" onClick={() => setPaying(inv)}>Record payment</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No invoices.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <InvoiceModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} setMsg={setMsg} />}
      {paying && <PaymentModal inv={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} setMsg={setMsg} />}
    </div>
  );
}

function InvoiceModal({ onClose, onDone, setMsg }) {
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", dueDate: "", notes: "" });
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: "" }]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setItem = (idx, k, v) => setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  async function submit() {
    const valid = items.filter((i) => i.description && Number(i.quantity) > 0);
    if (!form.customerName || !valid.length) return;
    const res = await fetch("/api/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, items: valid }),
    });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Failed to create invoice." });
  }

  return (
    <Modal title="New invoice" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Customer *</label><input className="input" value={form.customerName} onChange={set("customerName")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.customerPhone} onChange={set("customerPhone")} /></div>
          <div><label className="label">Due date</label><input type="date" className="input" value={form.dueDate} onChange={set("dueDate")} /></div>
        </div>
        <div className="space-y-2">
          <label className="label">Line items</label>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input className="input col-span-6" placeholder="Description" value={it.description} onChange={(e) => setItem(idx, "description", e.target.value)} />
              <input type="number" className="input col-span-2" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(idx, "quantity", e.target.value)} />
              <input type="number" step="0.01" className="input col-span-3" placeholder="Unit price" value={it.unitPrice} onChange={(e) => setItem(idx, "unitPrice", e.target.value)} />
              <button className="text-rose-500 col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: "" }])}>+ Add line</button>
        </div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(total)}</span></div>
        <button className="btn-primary w-full" onClick={submit}>Create invoice</button>
      </div>
    </Modal>
  );
}

function PaymentModal({ inv, onClose, onDone, setMsg }) {
  const [amount, setAmount] = useState(inv.balance);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  async function submit() {
    const res = await fetch(`/api/invoices/${inv.id}/payment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), method, reference }),
    });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Payment failed." });
  }

  return (
    <Modal title={`Record payment — ${inv.invoiceNumber}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">Outstanding balance: <b>{fmt(inv.balance)}</b></div>
        <div><label className="label">Amount *</label><input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank transfer</option><option value="card">Card</option>
          </select>
        </div>
        <div><label className="label">Reference</label><input className="input" placeholder="e.g. M-Pesa code" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <button className="btn-primary w-full" onClick={submit}>Record payment</button>
      </div>
    </Modal>
  );
}
