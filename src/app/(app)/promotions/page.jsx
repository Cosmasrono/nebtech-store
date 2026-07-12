"use client";

import { useEffect, useState } from "react";
import { Modal, Alert, fmt } from "@/components/ui";

const EMPTY = { name: "", code: "", type: "percentage", value: "", minSpend: 0, startDate: "", endDate: "", isActive: true };

export default function PromotionsPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/promotions").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  async function save(form) {
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/promotions/${form.id}` : "/api/promotions", {
      method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { setEditing(null); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Promotions</h1>
        <button className="btn-primary" onClick={() => setEditing(EMPTY)}>New promotion</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Name</th><th className="table-th">Code</th><th className="table-th">Discount</th>
            <th className="table-th text-right">Min spend</th><th className="table-th">Window</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{p.name}</td>
                <td className="table-td font-mono text-sm">{p.code}</td>
                <td className="table-td">{p.type === "percentage" ? `${p.value}%` : fmt(p.value)}</td>
                <td className="table-td text-right">{fmt(p.minSpend)}</td>
                <td className="table-td text-slate-500 text-sm">
                  {p.startDate ? new Date(p.startDate).toLocaleDateString("en-KE") : "—"} → {p.endDate ? new Date(p.endDate).toLocaleDateString("en-KE") : "—"}
                </td>
                <td className="table-td"><span className={`badge ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.isActive ? "Active" : "Off"}</span></td>
                <td className="table-td text-right">
                  <button className="text-teal-700 text-sm hover:underline"
                    onClick={() => setEditing({ ...p, startDate: p.startDate?.slice(0, 10) || "", endDate: p.endDate?.slice(0, 10) || "" })}>Edit</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No promotions.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <PromoModal row={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function PromoModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <Modal title={form.id ? "Edit promotion" : "New promotion"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} /></div>
          <div><label className="label">Code *</label><input className="input uppercase" value={form.code} onChange={set("code")} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Type</label>
            <select className="input" value={form.type} onChange={set("type")}>
              <option value="percentage">Percent %</option><option value="fixed">Fixed KSh</option>
            </select>
          </div>
          <div><label className="label">Value *</label><input type="number" step="0.01" className="input" value={form.value} onChange={set("value")} /></div>
          <div><label className="label">Min spend</label><input type="number" step="0.01" className="input" value={form.minSpend} onChange={set("minSpend")} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Starts</label><input type="date" className="input" value={form.startDate} onChange={set("startDate")} /></div>
          <div><label className="label">Ends</label><input type="date" className="input" value={form.endDate} onChange={set("endDate")} /></div>
        </div>
        <div className="flex items-center gap-2">
          <input id="pactive" type="checkbox" checked={form.isActive} onChange={set("isActive")} />
          <label htmlFor="pactive" className="text-sm">Active</label>
        </div>
        <button className="btn-primary w-full" onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
