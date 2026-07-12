"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { notify } from "@/lib/toast";

interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
}

const emptyForm = {
  name: "",
  username: "",
  role: "receptionist" as Role,
  password: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/users");
      if (alive && res.ok) setUsers((await res.json()).users);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? "Could not create user";
      setError(message);
      notify("error", message);
      return;
    }
    setUsers((await res.json()).users);
    setForm(emptyForm);
    notify("success", "Staff account created.");
  };

  const patch = async (id: string, changes: Partial<StaffUser>) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notify("error", body.error ?? "Could not update user.");
      return;
    }
    setUsers((await res.json()).users);
    notify("success", "Staff account updated.");
  };

  const resetPassword = async (id: string) => {
    const pw = prompt("New password for this user:");
    if (pw) patch(id, { password: pw } as Partial<StaffUser>);
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Create staff accounts and assign roles. Only admins see this page."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Roster */}
        <div>
          {loading ? (
            <EmptyState>Loading…</EmptyState>
          ) : users.length === 0 ? (
            <EmptyState>No users yet.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Username</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-zinc-100">
                      <td className="px-4 py-2 font-medium">{u.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {u.username}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`${inputClass} h-8`}
                          value={u.role}
                          onChange={(e) =>
                            patch(u.id, { role: e.target.value as Role })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            u.active
                              ? "text-green-700"
                              : "text-zinc-400 line-through"
                          }
                        >
                          {u.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetPassword(u.id)}
                          >
                            Reset pw
                          </Button>
                          <Button
                            size="sm"
                            variant={u.active ? "ghost" : "secondary"}
                            onClick={() => patch(u.id, { active: !u.active })}
                          >
                            {u.active ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">
            Add staff member
          </h2>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field label="Full name">
              <input
                className={inputClass}
                value={form.name}
                onChange={set("name")}
                required
              />
            </Field>
            <Field label="Username">
              <input
                className={inputClass}
                value={form.username}
                onChange={set("username")}
                placeholder="e.g. reception1"
                required
              />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={form.role}
                onChange={set("role")}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Temporary password">
              <input
                className={inputClass}
                value={form.password}
                onChange={set("password")}
                required
              />
            </Field>
            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit">Create account</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
