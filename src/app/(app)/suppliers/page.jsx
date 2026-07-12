"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", address: "", paymentTerms: "" };

export default function SuppliersPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/suppliers").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  async function save(form) {
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/suppliers/${form.id}` : "/api/suppliers", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setEditing(null); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Suppliers</h1>
        <button className="btn-primary" onClick={() => setEditing(EMPTY)}>Add supplier</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Name</th><th className="table-th">Contact</th><th className="table-th">Phone</th>
            <th className="table-th">Email</th><th className="table-th">Terms</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{s.name}</td>
                <td className="table-td">{s.contactPerson}</td>
                <td className="table-td">{s.phone}</td>
                <td className="table-td text-slate-500">{s.email}</td>
                <td className="table-td text-slate-500">{s.paymentTerms}</td>
                <td className="table-td text-right">
                  <button className="text-teal-700 text-sm hover:underline" onClick={() => setEditing(s)}>Edit</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={6}>No suppliers.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <SupplierModal row={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function SupplierModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={form.id ? "Edit supplier" : "Add supplier"} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Contact person</label><input className="input" value={form.contactPerson || ""} onChange={set("contactPerson")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone || ""} onChange={set("phone")} /></div>
        </div>
        <div><label className="label">Email</label><input type="email" className="input" value={form.email || ""} onChange={set("email")} /></div>
        <div><label className="label">Address</label><input className="input" value={form.address || ""} onChange={set("address")} /></div>
        <div><label className="label">Payment terms</label><input className="input" placeholder="e.g. Net 30" value={form.paymentTerms || ""} onChange={set("paymentTerms")} /></div>
        <button className="btn-primary w-full" onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
