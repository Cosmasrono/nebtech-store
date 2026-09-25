"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";
import { DEBT_STATUS_COLORS } from "@/lib/loans";

// Debts are stored in the Loan table (API: /api/loans); users only ever see "debt".

const day = (d) => (d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—");
const METHOD_LABEL = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", card: "Card" };

export default function DebtsPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null); // customer id
  const [msg, setMsg] = useState(null);

  function load(query = q) {
    setLoading(true);
    return fetch(`/api/loans?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.data || []); setSummary(d.summary || null); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(() => load(q), 300); // wait for the user to stop typing
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Debts</h1>
        <div className="flex gap-2">
          <input className="input w-64" placeholder="Search customer name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>Record debt</button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total owed to you" value={fmt(summary.outstanding)} />
          <Stat label="Overdue" value={fmt(summary.overdue)} tone={summary.overdue > 0 ? "text-amber-700" : ""} />
          <Stat label="Customers owing" value={summary.customersOwing} />
        </div>
      )}

      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Customer</th>
              <th className="table-th text-right">Debts</th>
              <th className="table-th text-right">Total owed</th>
              <th className="table-th text-right">Paid</th>
              <th className="table-th text-right">Balance</th>
              <th className="table-th">Next due</th>
              <th className="table-th">Status</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customerId} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewing(r.customerId)}>
                <td className="table-td">
                  <div className="font-medium">{r.customer.name}</div>
                  <div className="text-xs text-slate-400">{r.customer.phone || ""}</div>
                </td>
                <td className="table-td text-right">
                  {r.loanCount}
                  {r.openCount > 0 && <div className="text-xs text-slate-400">{r.openCount} unpaid</div>}
                </td>
                <td className="table-td text-right">{fmt(r.totalBorrowed)}</td>
                <td className="table-td text-right text-emerald-700">{fmt(r.totalPaid)}</td>
                <td className="table-td text-right font-semibold">{fmt(r.balance)}</td>
                <td className="table-td text-slate-500">{r.balance > 0 ? day(r.nextDueDate) : "—"}</td>
                <td className="table-td">
                  <StatusBadge value={r.status} map={DEBT_STATUS_COLORS} />
                  {r.overdueCount > 0 && <div className="text-xs text-amber-700 mt-0.5">{r.overdueCount} overdue</div>}
                </td>
                <td className="table-td text-right">
                  <button className="text-teal-700 text-sm hover:underline" onClick={(e) => { e.stopPropagation(); setViewing(r.customerId); }}>View</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="table-td text-slate-400" colSpan={8}>{loading ? "Loading…" : q ? "No customers with debts match your search." : "No debts yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <DebtModal
          onClose={() => setCreating(false)}
          onDone={(text) => { setCreating(false); setMsg({ ok: true, text }); load(); }}
        />
      )}
      {viewing && <CustomerDebts customerId={viewing} onClose={() => setViewing(null)} onChanged={() => load()} />}
    </div>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}

// ─────────── One customer's debt history ───────────

function CustomerDebts({ customerId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // expanded debt id
  const [paying, setPaying] = useState(null); // { debt } or { all: true }
  const [msg, setMsg] = useState(null);

  const load = () => fetch(`/api/customers/${customerId}/loans`).then((r) => r.json()).then((d) => setData(d.data || null));
  useEffect(() => { load(); }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={data ? `Debts — ${data.customer.name}` : "Debts"} onClose={onClose} wide="xl">
      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-500">
              {data.customer.phone || "No phone"}
              {data.customer.creditLimit > 0 && <> · Debt limit {fmt(data.customer.creditLimit)}</>}
            </div>
            {data.totals.balance > 0 && (
              <button className="btn-primary" onClick={() => setPaying({ all: true })}>Record payment</button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total owed" value={fmt(data.totals.borrowed)} />
            <Stat label="Paid" value={fmt(data.totals.paid)} tone="text-emerald-700" />
            <Stat label="Balance" value={fmt(data.totals.balance)} tone={data.totals.balance > 0 ? "text-rose-700" : ""} />
          </div>

          <Alert msg={msg} />

          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Debt no.</th>
                  <th className="table-th">Products / reason</th>
                  <th className="table-th text-right">Amount</th>
                  <th className="table-th text-right">Paid</th>
                  <th className="table-th text-right">Balance</th>
                  <th className="table-th">Due</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.loans.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <td className="table-td whitespace-nowrap">{day(l.loanDate)}</td>
                      <td className="table-td font-medium whitespace-nowrap">{open === l.id ? "▾" : "▸"} {l.loanNumber}</td>
                      <td className="table-td text-sm max-w-xs truncate" title={l.productDescription}>{l.productDescription}</td>
                      <td className="table-td text-right">{fmt(l.totalAmount)}</td>
                      <td className="table-td text-right text-emerald-700">{fmt(l.amountPaid)}</td>
                      <td className="table-td text-right font-semibold">{fmt(l.balance)}</td>
                      <td className="table-td whitespace-nowrap">{day(l.dueDate)}</td>
                      <td className="table-td"><StatusBadge value={l.displayStatus} map={DEBT_STATUS_COLORS} /></td>
                    </tr>
                    {open === l.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-4 py-3">
                          <DebtDetail debt={l} onPay={() => setPaying({ debt: l })} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!data.loans.length && <tr><td className="table-td text-slate-400" colSpan={8}>No debts for this customer.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {paying && data && (
        <PaymentModal
          customer={data.customer}
          debt={paying.debt}
          totalOwed={data.totals.balance}
          onClose={() => setPaying(null)}
          onDone={(text) => { setPaying(null); setMsg({ ok: true, text }); load(); onChanged(); }}
        />
      )}
    </Modal>
  );
}

function DebtDetail({ debt, onPay }) {
  const items = Array.isArray(debt.items) ? debt.items : [];
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-2">
        <div className="font-semibold text-slate-700">Products taken</div>
        {items.length ? (
          <table className="w-full">
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-1">{it.name}{it.sku && <span className="text-xs text-slate-400"> · {it.sku}</span>}</td>
                  <td className="py-1 text-right text-slate-500 whitespace-nowrap">{it.quantity} × {fmt(it.unitPrice)}</td>
                  <td className="py-1 text-right whitespace-nowrap">{fmt(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-slate-600">{debt.productDescription}</div>
        )}
        <div className="text-xs text-slate-500 space-y-0.5">
          {debt.sale && <div>From POS sale <Link className="text-teal-700 hover:underline" href={`/sales/${debt.sale.id}`}>{debt.sale.receiptNumber}</Link></div>}
          <div>Recorded by {debt.user?.name || "—"}</div>
          {debt.notes && <div>Note: {debt.notes}</div>}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700">Payments</span>
          {debt.balance > 0 && <button className="text-teal-700 text-sm font-medium hover:underline" onClick={onPay}>Record payment</button>}
        </div>
        {debt.payments.length ? (
          <table className="w-full">
            <tbody>
              {debt.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 whitespace-nowrap">{day(p.paymentDate)}</td>
                  <td className="py-1 text-slate-500">{METHOD_LABEL[p.paymentMethod] || p.paymentMethod}{p.referenceNumber && ` · ${p.referenceNumber}`}</td>
                  <td className="py-1 text-slate-400 text-xs">{p.user?.name}</td>
                  <td className="py-1 text-right font-medium whitespace-nowrap">{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-slate-400">No payments yet.</div>
        )}
      </div>
    </div>
  );
}

// ─────────── Record a payment (one debt, or spread across all) ───────────

function PaymentModal({ customer, debt, totalOwed, onClose, onDone }) {
  const max = debt ? debt.balance : totalOwed;
  const [amount, setAmount] = useState(String(max));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount greater than zero.");
    if (value > max + 0.009) return setError(`That's more than the ${debt ? "debt balance" : "total owed"} (${fmt(max)}).`);
    setBusy(true);
    const url = debt ? `/api/loans/${debt.id}/payments` : `/api/customers/${customer.id}/loans`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, paymentMethod: method, referenceNumber: reference || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.message || "Payment failed.");
    const spread = d.data?.applied?.length > 1 ? ` across ${d.data.applied.length} debts` : "";
    onDone(`${fmt(value)} recorded for ${customer.name}${spread}.`);
  }

  return (
    <Modal title={debt ? `Payment — ${debt.loanNumber}` : `Payment from ${customer.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">
          {debt ? "Debt balance" : "Total owed"}: <b>{fmt(max)}</b>
          {!debt && <div className="text-xs mt-1">The payment clears the debts that are due soonest first.</div>}
        </div>
        {error && <div className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <div><label className="label">Amount (KSh) *</label><input type="number" step="0.01" min="0" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="card">Card</option>
            </select>
          </div>
          <div><label className="label">Reference</label><input className="input" placeholder={method === "mpesa" ? "M-Pesa code" : "Optional"} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
      </div>
    </Modal>
  );
}

// ─────────── Record a debt by hand ───────────

function DebtModal({ onClose, onDone }) {
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const [form, setForm] = useState({ customerId: "", customerName: "", customerPhone: "", productDescription: "", amount: "", dueDate: in30, notes: "" });
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.data || [])).catch(() => setCustomers([]));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isNew = form.customerId === "__new__";

  async function submit() {
    setError("");
    if ((isNew ? !form.customerName : !form.customerId) || !form.productDescription || !(Number(form.amount) > 0) || !form.dueDate) {
      return setError("Choose a customer, and enter what the debt is for, the amount and the due date.");
    }
    setBusy(true);
    const body = { ...form, principal: form.amount, ...(isNew ? { customerId: "" } : { customerName: "", customerPhone: "" }) };
    const res = await fetch("/api/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) onDone(`Debt ${d.data.loanNumber} recorded: ${fmt(d.data.totalAmount)} owed.`);
    else setError(d.message || "Couldn't record the debt.");
  }

  return (
    <Modal title="Record debt" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">When a customer takes products and pays later, sell them at the POS and choose <b>Debt</b> as the payment. Use this form for anything else.</p>
        {error && <div className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <div>
          <label className="label">Customer *</label>
          <select className="input" value={form.customerId} onChange={set("customerId")}>
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
            <option value="__new__">+ New customer…</option>
          </select>
        </div>
        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Customer name *</label><input className="input" value={form.customerName} onChange={set("customerName")} /></div>
            <div><label className="label">Phone *</label><input className="input" placeholder="07XX XXX XXX" value={form.customerPhone} onChange={set("customerPhone")} /></div>
          </div>
        )}
        <div><label className="label">What is it for? *</label><input className="input" placeholder="e.g. Cash advance, balance from last order" value={form.productDescription} onChange={set("productDescription")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Amount owed (KSh) *</label><input type="number" step="0.01" min="0" className="input" value={form.amount} onChange={set("amount")} /></div>
          <div><label className="label">Due date *</label><input type="date" className="input" value={form.dueDate} onChange={set("dueDate")} /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={set("notes")} /></div>
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record debt"}</button>
      </div>
    </Modal>
  );
}
