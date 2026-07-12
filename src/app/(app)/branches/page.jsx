"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

const EMPTY = { name: "", location: "", phone: "", isMain: false, stockDistributionPercentage: 0 };

export default function BranchesPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/branches").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  async function save(form) {
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/branches/${form.id}` : "/api/branches", {
      method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { setEditing(null); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  async function toggle(id) {
    const res = await fetch(`/api/branches/${id}/toggle-status`, { method: "POST" });
    if (res.ok) load();
    else setMsg({ ok: false, text: (await res.json()).message || "Toggle failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Branches</h1>
        <button className="btn-primary" onClick={() => setEditing(EMPTY)}>Add branch</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Name</th><th className="table-th">Location</th><th className="table-th">Phone</th>
            <th className="table-th">Type</th><th className="table-th text-right">Stock %</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{b.name}</td>
                <td className="table-td">{b.location}</td>
                <td className="table-td">{b.phone}</td>
                <td className="table-td">{b.isMain ? <span className="badge bg-teal-50 text-teal-700">Main</span> : <span className="text-slate-400 text-sm">Branch</span>}</td>
                <td className="table-td text-right">{b.stockDistributionPercentage}%</td>
                <td className="table-td"><span className={`badge ${b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{b.isActive ? "Active" : "Inactive"}</span></td>
                <td className="table-td text-right space-x-3">
                  <button className="text-teal-700 text-sm hover:underline" onClick={() => setEditing(b)}>Edit</button>
                  {!b.isMain && <button className="text-amber-600 text-sm hover:underline" onClick={() => toggle(b.id)}>{b.isActive ? "Disable" : "Enable"}</button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={7}>No branches.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <BranchModal row={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function BranchModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <Modal title={form.id ? "Edit branch" : "Add branch"} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Location</label><input className="input" value={form.location || ""} onChange={set("location")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone || ""} onChange={set("phone")} /></div>
        </div>
        <div><label className="label">Stock distribution %</label>
          <input type="number" min="0" max="100" className="input" value={form.stockDistributionPercentage} onChange={set("stockDistributionPercentage")} /></div>
        <div className="flex items-center gap-2">
          <input id="ismain" type="checkbox" checked={form.isMain} onChange={set("isMain")} />
          <label htmlFor="ismain" className="text-sm">Main branch (receives all incoming stock)</label>
        </div>
        <button className="btn-primary w-full" onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
