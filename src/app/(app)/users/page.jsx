"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

export default function UsersPage() {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => fetch("/api/users").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => {
    load();
    fetch("/api/roles").then((r) => r.json()).then((d) => setRoles(d.data || []));
    fetch("/api/branches").then((r) => r.json()).then((d) => setBranches(d.data || []));
  }, []);

  async function save(form) {
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/users/${form.id}` : "/api/users", {
      method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { setEditing(null); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <button className="btn-primary" onClick={() => setEditing({ name: "", email: "", phone: "", password: "", roleIds: [], branchId: "", isActive: true })}>Add user</button>
      </div>
      <Alert msg={msg} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Name</th><th className="table-th">Email</th><th className="table-th">Roles</th>
            <th className="table-th">Branch</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{u.name}</td>
                <td className="table-td text-slate-500">{u.email}</td>
                <td className="table-td space-x-1">
                  {(u.roles || []).map((r) => <span key={r.id} className="badge bg-teal-50 text-teal-700">{r.name}</span>)}
                </td>
                <td className="table-td">{u.branch?.name || "—"}</td>
                <td className="table-td"><span className={`badge ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.isActive ? "Active" : "Disabled"}</span></td>
                <td className="table-td text-right">
                  <button className="text-teal-700 text-sm hover:underline"
                    onClick={() => setEditing({ ...u, password: "", roleIds: (u.roles || []).map((r) => r.id), branchId: u.branchId || "" })}>Edit</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={6}>No users.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <UserModal row={editing} roles={roles} branches={branches} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function UserModal({ row, roles, branches, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const toggleRole = (id) =>
    setForm({ ...form, roleIds: form.roleIds.includes(id) ? form.roleIds.filter((r) => r !== id) : [...form.roleIds, id] });

  return (
    <Modal title={form.id ? "Edit user" : "Add user"} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={set("email")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone || ""} onChange={set("phone")} /></div>
        </div>
        <div><label className="label">{form.id ? "New password (leave blank to keep)" : "Password *"}</label>
          <input type="password" className="input" value={form.password} onChange={set("password")} /></div>
        <div><label className="label">Branch</label>
          <select className="input" value={form.branchId} onChange={set("branchId")}>
            <option value="">No branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Roles</label>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button key={r.id} type="button" onClick={() => toggleRole(r.id)}
                className={`badge cursor-pointer ${form.roleIds.includes(r.id) ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input id="uactive" type="checkbox" checked={form.isActive} onChange={set("isActive")} />
          <label htmlFor="uactive" className="text-sm">Active</label>
        </div>
        <button className="btn-primary w-full" onClick={() => onSave(form)}>Save</button>
      </div>
    </Modal>
  );
}
