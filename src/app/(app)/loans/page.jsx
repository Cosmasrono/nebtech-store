"use client";

import { useEffect, useState } from "react";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";

const STATUS_COLORS = {
  active: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
  defaulted: "bg-rose-100 text-rose-700",
};

export default function LoansPage() {
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/loans").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Loans</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>Issue loan</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Loan no.</th><th className="table-th">Borrower</th><th className="table-th">Issued</th>
            <th className="table-th text-right">Principal</th><th className="table-th text-right">Balance</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{l.loanNumber}</td>
                <td className="table-td">{l.customer?.name || "—"}<div className="text-xs text-slate-400">{l.customer?.phone || ""}</div></td>
                <td className="table-td text-slate-500">{l.loanDate ? new Date(l.loanDate).toLocaleDateString("en-KE") : "—"}</td>
                <td className="table-td text-right">{fmt(l.totalAmount)}</td>
                <td className="table-td text-right font-medium">{fmt(Math.max(0, (l.totalAmount || 0) - (l.amountPaid || 0)))}</td>
                <td className="table-td"><StatusBadge value={l.status} map={STATUS_COLORS} /></td>
                <td className="table-td text-right">
                  {Math.max(0, (l.totalAmount || 0) - (l.amountPaid || 0)) > 0 && <button className="text-teal-700 text-sm hover:underline" onClick={() => setPaying(l)}>Record repayment</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No loans.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <LoanModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} setMsg={setMsg} />}
      {paying && <RepayModal loan={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} setMsg={setMsg} />}
    </div>
  );
}

function LoanModal({ onClose, onDone, setMsg }) {
  const [form, setForm] = useState({ customerId: "", customerName: "", customerPhone: "", productDescription: "", totalAmount: "", interestRate: 0, dueDate: "", notes: "" });
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.data || []))
      .catch(() => setCustomers([]));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const isNew = form.customerId === "__new__";

  async function submit() {
    if ((isNew ? !form.customerName : !form.customerId) || !form.productDescription || !form.totalAmount || !form.dueDate) {
      setMsg({ ok: false, text: "Customer, productDescription, totalAmount and dueDate are required." });
      return;
    }
    const body = isNew ? { ...form, customerId: "" } : { ...form, customerName: "", customerPhone: "" };
    const res = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Failed to issue loan." });
  }

  return (
    <Modal title="Issue loan" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Customer *</label>
          <select className="input" value={form.customerId} onChange={set("customerId")}>
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
            ))}
            <option value="__new__">+ New customer…</option>
          </select>
        </div>
        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Customer name *</label><input className="input" value={form.customerName} onChange={set("customerName")} /></div>
            <div><label className="label">Phone</label><input className="input" placeholder="07XX XXX XXX" value={form.customerPhone} onChange={set("customerPhone")} /></div>
          </div>
        )}
        <div>
          <label className="label">Product description *</label>
          <input className="input" value={form.productDescription} onChange={set("productDescription")} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Total amount (KSh) *</label><input type="number" step="0.01" className="input" value={form.totalAmount} onChange={set("totalAmount")} /></div>
          <div><label className="label">Interest %</label><input type="number" step="0.01" className="input" value={form.interestRate} onChange={set("interestRate")} /></div>
          <div><label className="label">Due date *</label><input type="date" className="input" value={form.dueDate} onChange={set("dueDate")} /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={set("notes")} /></div>
        <button className="btn-primary w-full" onClick={submit}>Issue loan</button>
      </div>
    </Modal>
  );
}

function RepayModal({ loan, onClose, onDone, setMsg }) {
  const balance = Math.max(0, (loan.totalAmount || 0) - (loan.amountPaid || 0));
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState("cash");

  async function submit() {
    const res = await fetch(`/api/loans/${loan.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), paymentMethod: method }),
    });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Repayment failed." });
  }

  return (
    <Modal title={`Repayment — ${loan.loanNumber}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">Balance: <b>{fmt(balance)}</b></div>
        <div><label className="label">Amount *</label><input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option>
          </select>
        </div>
        <button className="btn-primary w-full" onClick={submit}>Record repayment</button>
      </div>
    </Modal>
  );
}
