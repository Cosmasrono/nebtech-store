"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

export default function CategoriesPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} | row
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/categories").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => { load(); }, []);

  async function save(form) {
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/categories/${form.id}` : "/api/categories", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setEditing(null); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  async function remove(id) {
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setMsg({ ok: false, text: (await res.json()).message || "Delete failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Categories</h1>
        <button className="btn-primary" onClick={() => setEditing({ name: "", description: "" })}>Add category</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className="table-th">Name</th><th className="table-th">Description</th><th className="table-th"></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{c.name}</td>
                <td className="table-td text-slate-500">{c.description}</td>
                <td className="table-td text-right space-x-3">
                  <button className="text-teal-700 text-sm hover:underline" onClick={() => setEditing(c)}>Edit</button>
                  <button className="text-rose-600 text-sm hover:underline" onClick={() => remove(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={3}>No categories.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <CategoryModal row={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function CategoryModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(row);
  return (
    <Modal title={form.id ? "Edit category" : "Add category"} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <button className="btn-primary w-full" onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
