"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  partially_received: "bg-sky-100 text-sky-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function PurchaseOrdersPage() {
  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/purchase-orders").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchase orders</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>New PO</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">PO number</th><th className="table-th">Supplier</th><th className="table-th">Date</th>
            <th className="table-th text-right">Items</th><th className="table-th text-right">Total</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((po) => (
              <tr key={po.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{po.poNumber}</td>
                <td className="table-td">{po.supplier?.name}</td>
                <td className="table-td text-slate-500">{new Date(po.createdAt).toLocaleDateString("en-KE")}</td>
                <td className="table-td text-right">{po.items?.length || 0}</td>
                <td className="table-td text-right font-medium">{fmt(po.totalAmount)}</td>
                <td className="table-td"><StatusBadge value={po.status} map={STATUS_COLORS} /></td>
                <td className="table-td text-right">
                  <Link href={`/purchase-orders/${po.id}`} className="text-teal-700 text-sm hover:underline">Open</Link>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No purchase orders.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <CreatePoModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} setMsg={setMsg} />}
    </div>
  );
}

function CreatePoModal({ onClose, onDone, setMsg }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState([{ productId: "", quantityOrdered: "", unitCost: "" }]);

  useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.data || []));
    fetch("/api/products?perPage=500").then((r) => r.json()).then((d) => setProducts(d.data || []));
  }, []);

  const setItem = (idx, k, v) => setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const total = items.reduce((s, i) => s + Number(i.quantityOrdered || 0) * Number(i.unitCost || 0), 0);

  async function submit() {
    const valid = items.filter((i) => i.productId && Number(i.quantityOrdered) > 0);
    if (!supplierId || !valid.length) return;
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, expectedDate: expectedDate || null, items: valid }),
    });
    if (res.ok) onDone();
    else setMsg({ ok: false, text: (await res.json()).message || "Failed to create PO." });
  }

  return (
    <Modal title="New purchase order" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Supplier *</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">Expected date</label>
            <input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="label">Items</label>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <select className="input col-span-6" value={it.productId} onChange={(e) => setItem(idx, "productId", e.target.value)}>
                <option value="">Product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" className="input col-span-2" placeholder="Qty" value={it.quantityOrdered} onChange={(e) => setItem(idx, "quantityOrdered", e.target.value)} />
              <input type="number" step="0.01" className="input col-span-3" placeholder="Unit cost" value={it.unitCost} onChange={(e) => setItem(idx, "unitCost", e.target.value)} />
              <button className="text-rose-500 col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => setItems([...items, { productId: "", quantityOrdered: "", unitCost: "" }])}>+ Add line</button>
        </div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(total)}</span></div>
        <button className="btn-primary w-full" onClick={submit}>Create purchase order</button>
      </div>
    </Modal>
  );
}
