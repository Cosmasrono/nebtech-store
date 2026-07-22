"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const fmt = (n) => (n == null ? "—" : `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`);

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active"); // active | inactive | all
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState(null);

  async function load() {
    const res = await fetch(
      `/api/products?q=${encodeURIComponent(q)}&status=${status}&page=${page}`,
    );
    if (res.ok) {
      const d = await res.json();
      setRows(d.data);
      setTotal(d.total);
    }
  }
  useEffect(() => { load(); }, [q, status, page]); // eslint-disable-line

  async function deactivate(p) {
    if (!confirm(`Deactivate "${p.name}" (${p.sku})?\n\nIt will be hidden from the main list and POS. Sale history is preserved.`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setMsg({ ok: true, text: data.message || "Deactivated." }); load(); }
    else setMsg({ ok: false, text: data.message || "Deactivate failed." });
  }

  async function deleteAll() {
    const confirmText = "DELETE ALL";
    const answer = prompt(
      `This will remove EVERY product.\n\n` +
      `• Products with no sale/PO history are permanently deleted.\n` +
      `• Products with history are deactivated (history preserved).\n\n` +
      `Type ${confirmText} to confirm.`,
    );
    if (answer !== confirmText) return;

    const res = await fetch("/api/products/delete-all", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setMsg({ ok: true, text: data.message || "All products removed." }); setPage(1); load(); }
    else setMsg({ ok: false, text: data.message || "Bulk delete failed." });
  }

  async function reactivate(p) {
    const res = await fetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setMsg({ ok: true, text: `"${p.name}" activated.` }); load(); }
    else setMsg({ ok: false, text: data.message || "Activate failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Products</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            className="input w-64"
            placeholder="Search products…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
          <select
            className="input w-40"
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          >
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All statuses</option>
          </select>
          <button
            className="text-sm text-rose-600 hover:underline px-2"
            onClick={deleteAll}
            title="Owner only"
          >
            Delete all
          </button>
          <Link href="/products/new" className="btn-primary shrink-0">Add product</Link>
        </div>
      </div>
      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Name</th><th className="table-th">SKU</th><th className="table-th">Category</th>
              <th className="table-th text-right">Cost</th><th className="table-th text-right">Price</th>
              <th className="table-th text-right">Stock</th><th className="table-th">Branch allocation</th>
              <th className="table-th">Status</th><th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`hover:bg-slate-50 ${!p.isActive ? "opacity-60" : ""}`}>
                <td className="table-td font-medium">{p.name}</td>
                <td className="table-td text-slate-500">{p.sku}</td>
                <td className="table-td">{p.category?.name}</td>
                <td className="table-td text-right">{fmt(p.costPrice)}</td>
                <td className="table-td text-right font-medium">{fmt(p.sellingPrice)}</td>
                <td className="table-td text-right">
                  <span className={`badge ${p.quantityInStock <= p.reorderLevel ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {p.quantityInStock}
                  </span>
                </td>
                <td className="table-td">
                  <div className="flex flex-wrap gap-1">
                    {(p.branchStocks || []).map((s) => (
                      <span key={s.id} className="badge bg-sky-50 text-sky-700 whitespace-nowrap">
                        {s.branch?.name}: {s.quantityInStock}
                      </span>
                    ))}
                    {!(p.branchStocks || []).length && <span className="text-slate-400 text-sm">—</span>}
                  </div>
                </td>
                <td className="table-td">
                  <span className={`badge ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="table-td text-right space-x-3 whitespace-nowrap">
                  <Link href={`/products/${p.id}`} className="text-teal-700 text-sm hover:underline">Edit</Link>
                  {p.isActive ? (
                    <button className="text-amber-600 text-sm hover:underline" onClick={() => deactivate(p)}>Deactivate</button>
                  ) : (
                    <button className="text-emerald-700 text-sm hover:underline" onClick={() => reactivate(p)}>Activate</button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={9}>No products found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} product(s)</span>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <button className="btn-secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
