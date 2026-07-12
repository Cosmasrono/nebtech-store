"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const fmt = (n) => (n == null ? "—" : `KSh ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`);

export default function ProductsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  async function load() {
    const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${page}`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.data);
      setTotal(d.total);
    }
  }
  useEffect(() => { load(); }, [q, page]); // eslint-disable-line

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Products</h1>
        <div className="flex gap-2">
          <input className="input w-64" placeholder="Search products…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <Link href="/products/new" className="btn-primary shrink-0">Add product</Link>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Name</th><th className="table-th">SKU</th><th className="table-th">Category</th>
              <th className="table-th text-right">Cost</th><th className="table-th text-right">Price</th>
              <th className="table-th text-right">Stock</th><th className="table-th">Status</th><th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
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
                  <span className={`badge ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="table-td text-right">
                  <Link href={`/products/${p.id}`} className="text-teal-700 text-sm hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={8}>No products found.</td></tr>}
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
