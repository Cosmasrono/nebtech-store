"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

let idSeq = 0;

const RESOURCE_LABELS = {
  branches: "Branch", users: "User", products: "Product", categories: "Category",
  sales: "Sale", pos: "Sale", expenses: "Expense", "expense-categories": "Expense category",
  suppliers: "Supplier", invoices: "Invoice", loans: "Loan", promotions: "Promotion",
  customers: "Customer", roles: "Role", shifts: "Shift",
  "purchase-orders": "Purchase order", "stock-transfers": "Stock transfer",
  mpesa: "M-Pesa payment", system: "System setting",
};

function successLabel(method, path) {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  if (seg[1] === "auth") {
    if (seg[2] === "login") return "Logged in successfully.";
    if (seg[2] === "logout") return "Logged out.";
    if (seg[2] === "register") return "Account created successfully.";
  }
  const label = RESOURCE_LABELS[seg[1]] || (seg[1] || "Item").replace(/-/g, " ");
  const last = seg[seg.length - 1];
  if (seg.length > 2 && /^[a-z]+(-[a-z]+)+$/.test(last)) {
    return `${label}: ${last.replace(/-/g, " ")} successful.`;
  }
  const verb = method === "DELETE" ? "deleted" : method === "POST" && seg.length === 2 ? "created" : "updated";
  return `${label} ${verb} successfully.`;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const pushRef = useRef(null);

  const push = (text, ok = true) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  };
  pushRef.current = push;

  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (input, init) => {
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const raw = typeof input === "string" ? input : input.url;
      const path = raw.replace(window.location.origin, "");
      const track = path.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      try {
        const res = await orig(input, init);
        if (track) {
          let msg = null;
          try { msg = (await res.clone().json()).message; } catch {}
          if (res.ok) pushRef.current(msg || successLabel(method, path), true);
          else pushRef.current(msg || `Action failed (HTTP ${res.status}).`, false);
        }
        return res;
      } catch (e) {
        if (track) pushRef.current("Network error — action was not completed.", false);
        throw e;
      }
    };
    return () => { window.fetch = orig; };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed top-4 right-4 z-[100] w-80 space-y-2">
        {toasts.map((t) => (
          <div key={t.id}
            className={`shadow-lg rounded-lg px-4 py-3 text-sm text-white flex items-start gap-2 ${t.ok ? "bg-emerald-600" : "bg-rose-600"}`}>
            <span>{t.ok ? "✓" : "✕"}</span>
            <span className="flex-1">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
