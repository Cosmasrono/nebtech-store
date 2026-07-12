"use client";

import { useEffect, useState } from "react";

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/audit-logs").then(async (r) => {
      const d = await r.json();
      if (r.ok) setRows(d.data || []);
      else setError(d.message || "You don't have permission to view audit logs.");
    });
  }, []);

  if (error) return <div className="rounded-lg bg-amber-50 text-amber-800 px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Audit logs</h1>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">When</th><th className="table-th">User</th><th className="table-th">Action</th>
            <th className="table-th">Entity</th><th className="table-th">Details</th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="table-td text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString("en-KE")}</td>
                <td className="table-td">{l.user?.name || "System"}</td>
                <td className="table-td"><span className="badge bg-slate-100 text-slate-600">{l.action}</span></td>
                <td className="table-td">{l.entityType}{l.entityId ? ` #${l.entityId.slice(-6)}` : ""}</td>
                <td className="table-td text-slate-500 text-sm max-w-md truncate">{l.description}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="table-td text-slate-400" colSpan={5}>No log entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
