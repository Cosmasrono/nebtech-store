"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui";

const SEVERITY = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};
const OUTCOME = {
  cleared: ["Looked fine", "bg-emerald-100 text-emerald-700"],
  confirmed: ["Real problem", "bg-rose-100 text-rose-700"],
};
const HIDDEN_FIELDS = ["id", "createdAt", "updatedAt", "totalCost", "password"];
const when = (d) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });

/** One readable line: what changed, or the values recorded. */
function details({ oldValues: o, newValues: n }) {
  const visible = ([k, v]) => !HIDDEN_FIELDS.includes(k) && (v === null || typeof v !== "object");
  if (o && n) {
    const changed = Object.entries(n).filter(visible).filter(([k, v]) => String(o[k]) !== String(v));
    if (changed.length) return changed.map(([k, v]) => `${k}: ${o[k] ?? "—"} → ${v ?? "—"}`).join(", ");
  }
  return Object.entries(n || o || {}).filter(visible).map(([k, v]) => `${k}: ${v ?? "—"}`).join(", ");
}

export default function AuditLogsPage() {
  const [tab, setTab] = useState("alerts");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async (signal) => {
    const query = tab === "alerts" ? `view=alerts&status=${status}&page=${page}` : `page=${page}`;
    try {
      const res = await fetch(`/api/audit-logs?${query}`, { signal, cache: "no-store" });
      const body = await res.json();
      if (res.ok) { setResult(body); setError(""); }
      else setError(body.message || "You don't have permission to view audit logs.");
    } catch (e) {
      if (e.name !== "AbortError") setError("Couldn't load the audit log. Check your connection and try again.");
    }
  }, [tab, status, page]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function switchTab(next) { setTab(next); setPage(1); setResult(null); setMsg(null); }
  function switchStatus(next) { setStatus(next); setPage(1); setResult(null); }

  async function review(id, reviewStatus, reviewNote) {
    const res = await fetch(`/api/audit-logs/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewStatus, reviewNote }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: body.message || "Couldn't save the review." }); return; }
    setMsg({ ok: true, text: "Review saved." });
    load();
  }

  async function runAi() {
    setAiBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/audit-logs/ai-review", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setMsg({ ok: true, text: `AI reviewed ${body.data.assessed} alert(s).` }); await load(); }
      else setMsg({ ok: false, text: body.message || "The AI review failed." });
    } catch {
      setMsg({ ok: false, text: "The AI review failed. Check your connection and try again." });
    }
    setAiBusy(false);
  }

  if (error) return <div className="rounded-lg bg-amber-50 text-amber-800 px-4 py-3 text-sm">{error}</div>;

  const rows = result?.data || [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.perPage)) : 1;
  const tabClass = (active) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Audit logs</h1>

      <div className="flex border-b border-slate-200" role="tablist">
        <button role="tab" aria-selected={tab === "alerts"} className={tabClass(tab === "alerts")} onClick={() => switchTab("alerts")}>
          Suspicious activity
          {result?.openAlerts > 0 && <span className="badge bg-rose-100 text-rose-700 ml-2">{result.openAlerts}</span>}
        </button>
        <button role="tab" aria-selected={tab === "all"} className={tabClass(tab === "all")} onClick={() => switchTab("all")}>All activity</button>
      </div>

      <Alert msg={msg} />

      {tab === "alerts" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {[["open", "Needs review"], ["reviewed", "Reviewed"]].map(([value, label]) => (
                <button key={value} className={value === status ? "btn-primary" : "btn-secondary"} onClick={() => switchStatus(value)}>{label}</button>
              ))}
            </div>
            {result?.canReview && (
              <button className="btn-secondary" onClick={runAi} disabled={aiBusy || !result.openAlerts}>{aiBusy ? "AI is reviewing…" : "Review open alerts with AI"}</button>
            )}
          </div>

          {result?.aiReview?.summary && (
            <div className="card p-4 text-sm">
              <div className="font-semibold">AI overview</div>
              <p className="mt-1 text-slate-600">{result.aiReview.summary}</p>
              <p className="mt-2 text-xs text-slate-400">
                {result.aiReview.generatedAt && `Generated ${when(result.aiReview.generatedAt)}. `}AI opinions can be wrong. Check the facts before acting.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {rows.map((l) => <AlertCard key={l.id} alert={l} canReview={result.canReview} onReview={review} />)}
            {result && !rows.length && (
              <div className="card p-8 text-center text-sm text-slate-400">{status === "open" ? "No alerts need review." : "No alerts have been reviewed yet."}</div>
            )}
            {!result && <div className="card p-8 text-center text-sm text-slate-400">Loading…</div>}
          </div>
        </>
      )}

      {tab === "all" && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr><th className="table-th">When</th><th className="table-th">User</th><th className="table-th">Action</th>
              <th className="table-th">Entity</th><th className="table-th">Details</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="table-td text-slate-500 whitespace-nowrap">{when(l.createdAt)}</td>
                  <td className="table-td">{l.user?.name || "System"}</td>
                  <td className="table-td whitespace-nowrap">
                    <span className="badge bg-slate-100 text-slate-600">{l.event}</span>
                    {l.severity && <span className={`badge ml-1 ${SEVERITY[l.severity]}`}>{l.severity}</span>}
                  </td>
                  <td className="table-td whitespace-nowrap">{l.auditableType || "—"}{l.auditableId ? ` #${l.auditableId.slice(-6)}` : ""}</td>
                  <td className="table-td text-slate-500 text-sm max-w-md truncate" title={details(l)}>{details(l)}</td>
                </tr>
              ))}
              {result && !rows.length && <tr><td className="table-td text-slate-400" colSpan={5}>No log entries.</td></tr>}
              {!result && <tr><td className="table-td text-slate-400" colSpan={5}>Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm text-slate-500">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert: a, canReview, onReview }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const outcome = OUTCOME[a.reviewStatus];

  async function submit(reviewStatus) {
    setBusy(true);
    await onReview(a.id, reviewStatus, note);
    setBusy(false);
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${SEVERITY[a.severity]}`}>{a.severity}</span>
        <span className="text-sm font-medium">{a.user?.name || "Not signed in"}</span>
        <span className="text-xs text-slate-400">{when(a.createdAt)}</span>
        {outcome && <span className={`badge ml-auto ${outcome[1]}`}>{outcome[0]}</span>}
      </div>

      <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
        {(a.flags || []).map((f, i) => <li key={i}>{f.message}</li>)}
      </ul>

      {a.aiAssessment && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="text-xs font-semibold text-slate-500">AI opinion: {a.aiAssessment.risk} risk</div>
          <p className="mt-1 text-slate-700">{a.aiAssessment.explanation}</p>
          {a.aiAssessment.recommendedAction && <p className="mt-1 text-slate-500"><b>Suggested:</b> {a.aiAssessment.recommendedAction}</p>}
        </div>
      )}

      {a.reviewStatus === "open" && canReview && (
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-48" placeholder="Note (optional)" aria-label="Review note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-secondary" disabled={busy} onClick={() => submit("cleared")}>Looks fine</button>
          <button className="btn-danger" disabled={busy} onClick={() => submit("confirmed")}>Real problem</button>
        </div>
      )}

      {a.reviewStatus !== "open" && (
        <p className="text-xs text-slate-500">
          Reviewed by {a.reviewedByName || "unknown"}{a.reviewedAt ? ` on ${when(a.reviewedAt)}` : ""}{a.reviewNote ? `: ${a.reviewNote}` : "."}
        </p>
      )}
    </div>
  );
}
