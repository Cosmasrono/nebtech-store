"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProductForm({ productId = null }) {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", imei: "", categoryId: "", costPrice: "", sellingPrice: "",
    quantityInStock: 0, reorderLevel: 10, description: "", expiryDate: "", batchNumber: "", isActive: true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockAdd, setStockAdd] = useState({ quantity: "", expiryDate: "", batchNumber: "" });

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.data || []));
    if (productId) {
      fetch(`/api/products/${productId}`).then((r) => r.json()).then((d) => {
        const p = d.data;
        setForm((f) => ({
          ...f, name: p.name, sku: p.sku, barcode: p.barcode || "", categoryId: p.categoryId,
          imei: p.imei || "",
          costPrice: p.costPrice ?? "", sellingPrice: p.sellingPrice, quantityInStock: p.quantityInStock,
          reorderLevel: p.reorderLevel, description: p.description || "", isActive: p.isActive,
        }));
      });
    }
  }, [productId]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(productId ? `/api/products/${productId}` : "/api/products", {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) router.push("/products");
    else setError((await res.json()).message || "Save failed.");
  }

  async function addStock() {
    if (!stockAdd.quantity) return;
    const res = await fetch("/api/products/add-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...stockAdd }),
    });
    if (res.ok) router.refresh();
    else setError((await res.json()).message || "Failed to add stock.");
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 max-w-3xl">
      {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={set("name")} /></div>
        <div><label className="label">Category *</label>
          <select className="input" required value={form.categoryId} onChange={set("categoryId")}>
            <option value="">Select category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">SKU *</label><input className="input" required value={form.sku} onChange={set("sku")} /></div>
        <div><label className="label">Barcode</label><input className="input" value={form.barcode} onChange={set("barcode")} /></div>
        <div><label className="label">IMEI (phones optional)</label><input className="input" value={form.imei} onChange={set("imei")} /></div>
        <div><label className="label">Cost price (KSh)</label><input type="number" step="0.01" className="input" value={form.costPrice} onChange={set("costPrice")} /></div>
        <div><label className="label">Selling price (KSh) *</label><input type="number" step="0.01" className="input" required value={form.sellingPrice} onChange={set("sellingPrice")} /></div>
        {!productId && (
          <>
            <div><label className="label">Opening stock</label><input type="number" className="input" value={form.quantityInStock} onChange={set("quantityInStock")} /></div>
            <div><label className="label">Expiry date (optional)</label><input type="date" className="input" value={form.expiryDate} onChange={set("expiryDate")} /></div>
          </>
        )}
        <div><label className="label">Reorder level</label><input type="number" className="input" value={form.reorderLevel} onChange={set("reorderLevel")} /></div>
        <div className="flex items-end gap-2 pb-2">
          <input id="active" type="checkbox" checked={form.isActive} onChange={set("isActive")} />
          <label htmlFor="active" className="text-sm">Active</label>
        </div>
      </div>
      <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={set("description")} /></div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : productId ? "Save changes" : "Create product"}</button>
        <button type="button" className="btn-secondary" onClick={() => router.push("/products")}>Cancel</button>
      </div>

      {productId && (
        <div className="border-t border-slate-100 pt-4">
          <div className="label mb-2">Receive stock into main branch</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input type="number" className="input" placeholder="Quantity" value={stockAdd.quantity}
              onChange={(e) => setStockAdd({ ...stockAdd, quantity: e.target.value })} />
            <input className="input" placeholder="Batch no. (optional)" value={stockAdd.batchNumber}
              onChange={(e) => setStockAdd({ ...stockAdd, batchNumber: e.target.value })} />
            <input type="date" className="input" value={stockAdd.expiryDate}
              onChange={(e) => setStockAdd({ ...stockAdd, expiryDate: e.target.value })} />
            <button type="button" className="btn-secondary" onClick={addStock}>Add stock</button>
          </div>
        </div>
      )}
    </form>
  );
}
