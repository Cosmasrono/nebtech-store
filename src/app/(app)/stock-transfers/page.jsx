"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

export default function StockTransfersPage() {
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/stock-transfers").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock transfers</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>New transfer</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Date</th><th className="table-th">Product</th><th className="table-th">From</th>
            <th className="table-th">To</th><th className="table-th text-right">Qty</th><th className="table-th">By</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="table-td text-slate-500">{new Date(t.createdAt).toLocaleString("en-KE")}</td>
                <td className="table-td font-medium">{t.product?.name}</td>
                <td className="table-td">{t.fromBranch?.name}</td>
                <td className="table-td">{t.toBranch?.name}</td>
                <td className="table-td text-right">{Math.abs(t.quantity)}</td>
                <td className="table-td">{t.user?.name}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={6}>No transfers.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <TransferModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} setMsg={setMsg} />}
    </div>
  );
}

function TransferModal({ onClose, onDone, setMsg }) {
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ productId: "", fromBranchId: "", toBranchId: "", quantity: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    fetch("/api/products?perPage=500").then((r) => r.json()).then((d) => setProducts(d.data || []));
    fetch("/api/branches").then((r) => r.json()).then((d) => setBranches((d.data || []).filter((b) => b.isActive)));
  }, []);

  async function submit() {
    if (!form.productId || !form.fromBranchId || !form.toBranchId || form.fromBranchId === form.toBranchId) return;
    const res = await fetch("/api/stock-transfers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Transfer failed." });
  }

  return (
    <Modal title="Transfer stock between branches" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Product *</label>
          <select className="input" value={form.productId} onChange={set("productId")}>
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (total {p.quantityInStock})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">From branch *</label>
            <select className="input" value={form.fromBranchId} onChange={set("fromBranchId")}>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="label">To branch *</label>
            <select className="input" value={form.toBranchId} onChange={set("toBranchId")}>
              <option value="">Select…</option>
              {branches.filter((b) => b.id !== form.fromBranchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Quantity *</label><input type="number" min="1" className="input" value={form.quantity} onChange={set("quantity")} /></div>
        <button className="btn-primary w-full" onClick={submit}>Transfer</button>
      </div>
    </Modal>
  );
}
