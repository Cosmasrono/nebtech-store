"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", address: "", paymentTerms: "" };

export default function SuppliersPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
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
    if (res.ok) { setEditing(null); setMsg({ ok: true, text: `${form.name} saved.` }); load(); }
    else setMsg({ ok: false, text: (await res.json().catch(() => ({}))).message || "Save failed." });
  }

  async function remove(supplier) {
    const res = await fetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.message || "Couldn't delete this supplier.";
    setDeleting(null);
    setMsg({ ok: true, text: body.message || `${supplier.name} was deleted.` });
    load();
    return null;
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
                <td className="table-td text-right whitespace-nowrap space-x-3">
                  <button className="text-teal-700 text-sm hover:underline" onClick={() => setEditing(s)}>Edit</button>
                  <button className="text-rose-600 text-sm hover:underline" onClick={() => { setMsg(null); setDeleting(s); }}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={6}>No suppliers.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <SupplierModal row={editing} error={msg?.ok === false ? msg : null} onClose={() => { setEditing(null); setMsg(null); }} onSave={save} />}
      {deleting && <DeleteSupplierModal supplier={deleting} onClose={() => setDeleting(null)} onDelete={remove} />}
    </div>
  );
}

function DeleteSupplierModal({ supplier, onClose, onDelete }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setError("");
    setBusy(true);
    const err = await onDelete(supplier);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Modal title="Delete supplier" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Delete <b>{supplier.name}</b>? This can&apos;t be undone from this page.</p>
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          If this supplier has purchase orders or payments, it will be removed from this list but those records are kept.
        </p>
        {error && <div role="alert" className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-danger" onClick={confirm} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </Modal>
  );
}

function SupplierModal({ row, error, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={form.id ? "Edit supplier" : "Add supplier"} onClose={onClose}>
      <div className="space-y-3">
        <Alert msg={error} />
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
