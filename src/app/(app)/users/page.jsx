"use client";

import { useEffect, useState } from "react";
import { Modal, Alert } from "@/components/ui";

const TOP_ROLES = ["owner", "super_admin", "superadmin", "admin"];

export default function UsersPage() {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [linkInfo, setLinkInfo] = useState(null); // { email, link } when the email couldn't be sent

  const load = () => fetch("/api/users").then((r) => r.json()).then((d) => setRows(d.data || []));
  useEffect(() => {
    load();
    fetch("/api/roles").then((r) => r.json()).then((d) => setRoles(d.data || []));
    fetch("/api/branches").then((r) => r.json()).then((d) => setBranches(d.data || []));
  }, []);

  function reportLink(email, d) {
    if (d.emailSent) {
      setMsg({ ok: true, text: `A link to set the password was emailed to ${email}.` });
      setLinkInfo(null);
    } else if (d.manualLink) {
      setMsg({ ok: false, text: `The email to ${email} couldn't be sent${d.emailError ? ` (${d.emailError})` : ""}. Copy the link below and send it another way.` });
      setLinkInfo({ email, link: d.manualLink });
    }
  }

  async function save(form) {
    const isEdit = Boolean(form.id);
    const body = { name: form.name, email: form.email, phone: form.phone, branchId: form.branchId, roleId: form.roleId, isActive: form.isActive };
    const res = await fetch(isEdit ? `/api/users/${form.id}` : "/api/users", {
      method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return d.message || "Save failed.";
    setEditing(null);
    if (isEdit) { setMsg({ ok: true, text: `${form.name} updated.` }); setLinkInfo(null); }
    else reportLink(form.email, d);
    load();
    return null;
  }

  async function sendLink(u) {
    setMsg(null);
    const res = await fetch(`/api/users/${u.id}/send-link`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: d.message || "Couldn't send the link." });
    reportLink(u.email, d);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <button className="btn-primary" onClick={() => setEditing({ name: "", email: "", phone: "", roleId: "", branchId: "", isActive: true })}>Add user</button>
      </div>
      <Alert msg={msg} />
      {linkInfo && <CopyLink {...linkInfo} />}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Name</th><th className="table-th">Email</th><th className="table-th">Role</th>
            <th className="table-th">Branch</th><th className="table-th">Status</th><th className="table-th"></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="table-td font-medium">{u.name}</td>
                <td className="table-td text-slate-500">
                  {u.email}
                  {!u.hasSetPassword && <div className="text-xs text-amber-600">Invite sent, password not set yet</div>}
                </td>
                <td className="table-td space-x-1">
                  {(u.roles || []).map((r) => <span key={r.id} className="badge bg-teal-50 text-teal-700">{r.displayName || r.name}</span>)}
                </td>
                <td className="table-td">{u.branch?.name || "—"}</td>
                <td className="table-td"><span className={`badge ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.isActive ? "Active" : "Disabled"}</span></td>
                <td className="table-td text-right whitespace-nowrap space-x-3">
                  {u.isActive && (
                    <button className="text-slate-600 text-sm hover:underline" onClick={() => sendLink(u)}>
                      {u.hasSetPassword ? "Send reset link" : "Resend invite"}
                    </button>
                  )}
                  <button className="text-teal-700 text-sm hover:underline"
                    onClick={() => setEditing({ ...u, roleId: u.roles?.[0]?.id || "", branchId: u.branchId || "" })}>Edit</button>
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

function CopyLink({ email, link }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-3 space-y-2">
      <div className="text-sm text-slate-600">Set-password link for <b>{email}</b> (works once, expires in 72 hours):</div>
      <div className="flex gap-2">
        <input className="input text-xs font-mono" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn-primary shrink-0" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {})}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function UserModal({ row, roles, branches, onClose, onSave }) {
  const [form, setForm] = useState(row);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const isNew = !form.id;

  async function submit() {
    setError("");
    if (!form.name.trim() || !form.email.trim()) return setError("Name and email are required.");
    if (!form.roleId) return setError("Choose a role.");
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <Modal title={isNew ? "Add user" : "Edit user"} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={set("email")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone || ""} onChange={set("phone")} /></div>
        </div>
        <div><label className="label">Branch</label>
          <select className="input" value={form.branchId} onChange={set("branchId")}>
            <option value="">No branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="label">Role *</legend>
          <div className="space-y-1.5">
            {roles.map((r) => (
              <label key={r.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer ${form.roleId === r.id ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="role" className="mt-1" value={r.id} checked={form.roleId === r.id}
                  onChange={() => setForm({ ...form, roleId: r.id })} />
                <span>
                  <span className="text-sm font-medium text-slate-800">{r.displayName || r.name}</span>
                  {TOP_ROLES.includes(r.name) && <span className="ml-2 text-[10px] font-bold uppercase text-rose-600">Full access</span>}
                  {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-2">
          <input id="uactive" type="checkbox" checked={form.isActive} onChange={set("isActive")} />
          <label htmlFor="uactive" className="text-sm">Active</label>
        </div>
        {isNew && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            We&apos;ll email {form.email || "the user"} a link to set their own password. The link expires in 72 hours.
          </p>
        )}
        <button className="btn-primary w-full" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create user and send invite" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
