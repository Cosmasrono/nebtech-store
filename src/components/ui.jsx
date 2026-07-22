"use client";

export const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

// Small circular spinner. Inherits currentColor, so wrap in text-<color>-* to tint.
export function Spinner({ size = 16, className = "" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Inline loading state for pages / cards. Replace bare "Loading…" strings with this.
export function Loading({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex items-center gap-2 text-slate-500 text-sm ${className}`}>
      <Spinner /> <span>{label}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className={`card w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({ msg }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      {msg.text}
    </div>
  );
}

export function StatusBadge({ value, map }) {
  const cls = map?.[value] || "bg-slate-100 text-slate-600";
  return <span className={`badge ${cls}`}>{value}</span>;
}
