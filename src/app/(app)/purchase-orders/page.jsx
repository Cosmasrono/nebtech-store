"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Alert, fmt, StatusBadge } from "@/components/ui";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-700",
  partial: "bg-sky-100 text-sky-700",
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
                <td className="table-td text-right font-medium">{fmt(po.totalCost)}</td>
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

const EMPTY_ROW = { mode: "existing", productId: "", quantityOrdered: "", unitCost: "",
  newProduct: { name: "", sku: "", categoryId: "", sellingPrice: "", genericName: "",
    brandName: "", strength: "", dosageForm: "", packSize: "", manufacturer: "", prescriptionRequired: false } };

// Seed % from Branch.stockDistributionPercentage. Fall back to an even split
// when the configured values don't sum to ~100 (e.g. all zeros on a fresh setup).
function defaultAllocations(branches) {
  if (!branches.length) return {};
  const configured = Object.fromEntries(branches.map((b) => [b.id, Number(b.stockDistributionPercentage) || 0]));
  const sum = Object.values(configured).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 100) <= 0.5) return configured;
  const even = +(100 / branches.length).toFixed(1);
  const out = Object.fromEntries(branches.map((b) => [b.id, even]));
  const drift = +(100 - even * branches.length).toFixed(1);
  out[branches[branches.length - 1].id] = +(even + drift).toFixed(1);
  return out;
}

function CreatePoModal({ onClose, onDone, setMsg }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [items, setItems] = useState([structuredClone(EMPTY_ROW)]);
  // { [branchId]: percentage }. Seeded from branches once they load.
  const [alloc, setAlloc] = useState({});

  useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.data || []));
    fetch("/api/products?per_page=500").then((r) => r.json()).then((d) => setProducts(d.data || []));
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.data || []));
    fetch("/api/branches").then((r) => r.json()).then((d) => {
      const list = (d.data || []).filter((b) => b.isActive !== false);
      setBranches(list);
      setAlloc(defaultAllocations(list));
    });
  }, []);

  const setItem = (idx, k, v) => setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const setNewProd = (idx, k, v) => setItems(items.map((it, i) =>
    i === idx ? { ...it, newProduct: { ...it.newProduct, [k]: v } } : it));
  const total = items.reduce((s, i) => s + Number(i.quantityOrdered || 0) * Number(i.unitCost || 0), 0);
  const allocSum = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const allocOk = Math.abs(allocSum - 100) <= 0.5;

  // Bias % toward branches that are lightest on the products being ordered.
  // Uses branchStocks already returned by /api/products.
  function suggestAllocations() {
    const chosen = items.filter((i) => i.mode === "existing" && i.productId).map((i) => i.productId);
    if (!chosen.length || !branches.length) {
      setAlloc(defaultAllocations(branches));
      return;
    }
    // Sum current stock per branch across the chosen products; branches with less get more.
    const stockByBranch = Object.fromEntries(branches.map((b) => [b.id, 0]));
    for (const pid of chosen) {
      const p = products.find((x) => x.id === pid);
      if (!p) continue;
      for (const bs of p.branchStocks || []) {
        if (stockByBranch[bs.branchId] !== undefined) stockByBranch[bs.branchId] += bs.quantityInStock || 0;
      }
    }
    // weight = max(1, maxStock - currentStock). +1 so a branch with max stock still gets something.
    const maxStock = Math.max(...Object.values(stockByBranch), 0);
    const weights = branches.map((b) => ({ id: b.id, w: Math.max(1, maxStock - stockByBranch[b.id] + 1) }));
    const totalW = weights.reduce((s, x) => s + x.w, 0);
    // Round to 1 decimal, put remainder on the last branch.
    const next = {};
    let assigned = 0;
    for (let i = 0; i < weights.length; i++) {
      const isLast = i === weights.length - 1;
      const pct = isLast ? +(100 - assigned).toFixed(1) : +((weights[i].w / totalW) * 100).toFixed(1);
      next[weights[i].id] = pct;
      assigned += pct;
    }
    setAlloc(next);
  }

  async function submit() {
    const payload = items
      .filter((i) => Number(i.quantityOrdered) > 0 && Number(i.unitCost) > 0)
      .map((i) => i.mode === "new"
        ? { newProduct: i.newProduct, quantityOrdered: i.quantityOrdered, unitCost: i.unitCost }
        : { productId: i.productId, quantityOrdered: i.quantityOrdered, unitCost: i.unitCost })
      .filter((i) => i.productId || (i.newProduct?.name && i.newProduct?.sku && i.newProduct?.categoryId && i.newProduct?.sellingPrice));
    if (!supplierId || !payload.length) {
      setMsg({ ok: false, text: "Pick a supplier and add at least one valid line." });
      return;
    }
    if (!allocOk) {
      setMsg({ ok: false, text: `Branch allocations must sum to 100% (currently ${allocSum.toFixed(1)}%).` });
      return;
    }
    const allocations = Object.entries(alloc)
      .map(([branchId, percentage]) => ({ branchId, percentage: Number(percentage) || 0 }))
      .filter((a) => a.percentage > 0);
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, expectedDeliveryDate: expectedDate || null, items: payload, allocations }),
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
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="label">Branch allocation</label>
            <div className="flex items-center gap-2">
              <button type="button" className="text-xs text-teal-700 hover:underline" onClick={suggestAllocations}>
                Suggest by low-stock
              </button>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setAlloc(defaultAllocations(branches))}>
                Reset to defaults
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">Each received unit is split across branches by these percentages.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-[8rem] truncate">{b.name}{b.isMain ? " (main)" : ""}</span>
                <input
                  type="number" step="0.1" min="0" max="100"
                  className="input !py-1 w-24"
                  value={alloc[b.id] ?? ""}
                  onChange={(e) => setAlloc({ ...alloc, [b.id]: e.target.value === "" ? "" : Number(e.target.value) })}
                />
                <span className="text-xs text-slate-500">%</span>
              </label>
            ))}
            {!branches.length && <div className="text-xs text-slate-500">Loading branches…</div>}
          </div>
          <div className={`text-xs ${allocOk ? "text-emerald-600" : "text-rose-600"}`}>
            Total: {allocSum.toFixed(1)}% {allocOk ? "✓" : "— must equal 100%"}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label">Items</label>
            <span className="text-xs text-slate-500">Stock lands in the POS automatically when you mark this PO received.</span>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={it.mode === "existing"} onChange={() => setItem(idx, "mode", "existing")} />
                  Existing product
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={it.mode === "new"} onChange={() => setItem(idx, "mode", "new")} />
                  New product
                </label>
                <button type="button" className="ml-auto text-rose-500 text-sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕ Remove</button>
              </div>

              {it.mode === "existing" ? (
                <div className="space-y-1">
                  <select className="input" value={it.productId} onChange={(e) => setItem(idx, "productId", e.target.value)}>
                    <option value="">Product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.brandName ? ` — ${p.brandName}` : ""}{p.strength ? ` ${p.strength}` : ""}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    if (!it.productId) return null;
                    const p = products.find((x) => x.id === it.productId);
                    if (!p) return null;
                    const stockById = Object.fromEntries((p.branchStocks || []).map((s) => [s.branchId, s.quantityInStock]));
                    return (
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600 pl-1">
                        <span className="text-slate-400">Current stock:</span>
                        {branches.map((b) => (
                          <span key={b.id} className="rounded bg-slate-100 px-1.5 py-0.5">
                            {b.name}: <span className={((stockById[b.id] || 0) <= (p.reorderLevel || 0)) ? "text-rose-600 font-medium" : ""}>{stockById[b.id] || 0}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2">
                  <input className="input col-span-4" placeholder="Product name *" value={it.newProduct.name} onChange={(e) => setNewProd(idx, "name", e.target.value)} />
                  <input className="input col-span-2" placeholder="SKU *" value={it.newProduct.sku} onChange={(e) => setNewProd(idx, "sku", e.target.value)} />
                  <select className="input col-span-3" value={it.newProduct.categoryId} onChange={(e) => setNewProd(idx, "categoryId", e.target.value)}>
                    <option value="">Category *</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="number" step="0.01" className="input col-span-3" placeholder="Selling price *" value={it.newProduct.sellingPrice} onChange={(e) => setNewProd(idx, "sellingPrice", e.target.value)} />

                  <input className="input col-span-4" placeholder="Generic name (e.g. Paracetamol 500mg)" value={it.newProduct.genericName} onChange={(e) => setNewProd(idx, "genericName", e.target.value)} />
                  <input className="input col-span-3" placeholder="Brand (e.g. Panadol)" value={it.newProduct.brandName} onChange={(e) => setNewProd(idx, "brandName", e.target.value)} />
                  <input className="input col-span-2" placeholder="Strength" value={it.newProduct.strength} onChange={(e) => setNewProd(idx, "strength", e.target.value)} />
                  <select className="input col-span-3" value={it.newProduct.dosageForm} onChange={(e) => setNewProd(idx, "dosageForm", e.target.value)}>
                    <option value="">Dosage form…</option>
                    {["tablet","capsule","syrup","suspension","injection","cream","ointment","drops","inhaler","sachet","suppository","other"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>

                  <input className="input col-span-3" placeholder="Pack size (e.g. 20 tabs)" value={it.newProduct.packSize} onChange={(e) => setNewProd(idx, "packSize", e.target.value)} />
                  <input className="input col-span-4" placeholder="Manufacturer" value={it.newProduct.manufacturer} onChange={(e) => setNewProd(idx, "manufacturer", e.target.value)} />
                  <label className="flex items-center gap-2 text-sm col-span-5">
                    <input type="checkbox" checked={it.newProduct.prescriptionRequired} onChange={(e) => setNewProd(idx, "prescriptionRequired", e.target.checked)} />
                    Prescription required (Rx)
                  </label>
                </div>
              )}

              <div className="grid grid-cols-12 gap-2">
                <input type="number" className="input col-span-3" placeholder="Qty ordered *" value={it.quantityOrdered} onChange={(e) => setItem(idx, "quantityOrdered", e.target.value)} />
                <input type="number" step="0.01" className="input col-span-3" placeholder="Unit cost *" value={it.unitCost} onChange={(e) => setItem(idx, "unitCost", e.target.value)} />
                <div className="col-span-6 text-right text-sm text-slate-500 self-center">
                  Line total: {fmt(Number(it.quantityOrdered || 0) * Number(it.unitCost || 0))}
                </div>
              </div>
            </div>
          ))}
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => setItems([...items, structuredClone(EMPTY_ROW)])}>+ Add line</button>
        </div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(total)}</span></div>
        <button className="btn-primary w-full" onClick={submit}>Create purchase order</button>
      </div>
    </Modal>
  );
}
