"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function PosPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // {productId, name, unitPrice, quantity, stock}
  const [shift, setShift] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [promo, setPromo] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [msg, setMsg] = useState(null);
  const searchRef = useRef(null);

  const loadProducts = useCallback(async (query = "") => {
    const res = await fetch(`/api/pos/products?q=${encodeURIComponent(query)}`);
    if (res.ok) setProducts((await res.json()).data);
  }, []);

  useEffect(() => {
    loadProducts();
    fetch("/api/shifts/active").then((r) => r.json()).then((d) => setShift(d.data));
  }, [loadProducts]);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(q), 250);
    return () => clearTimeout(t);
  }, [q, loadProducts]);

  function addToCart(p) {
    setCart((c) => {
      const existing = c.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.quantity + 1 > p.stock) return c;
        return c.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      if (p.stock <= 0) return c;
      return [...c, { productId: p.id, name: p.name, unitPrice: p.sellingPrice, quantity: 1, stock: p.stock }];
    });
  }

  function setQty(productId, qty) {
    setCart((c) =>
      c
        .map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(qty, i.stock)) } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart]);
  const discount = useMemo(() => {
    if (!promo || subtotal < promo.minSpend) return 0;
    return promo.type === "percentage" ? (subtotal * promo.value) / 100 : Math.min(promo.value, subtotal);
  }, [promo, subtotal]);
  const total = Math.max(0, subtotal - discount);

  async function applyPromo() {
    if (!promoCode.trim()) return;
    const res = await fetch(`/api/promotions?code=${encodeURIComponent(promoCode.trim())}`);
    if (res.ok) {
      setPromo((await res.json()).data);
      setMsg({ ok: true, text: "Promo applied." });
    } else {
      setPromo(null);
      setMsg({ ok: false, text: "Invalid or expired promo code." });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Product grid */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={searchRef}
            className="input"
            placeholder="Search name, SKU or scan barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button className={shift ? "btn-secondary shrink-0" : "btn-amber shrink-0"} onClick={() => setShowShiftModal(true)}>
            {shift ? "Close shift" : "Open shift"}
          </button>
        </div>
        {msg && (
          <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {msg.text}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stock <= 0}
              className="card p-3 text-left hover:border-teal-500 hover:shadow transition disabled:opacity-40"
            >
              <div className="text-sm font-medium leading-tight line-clamp-2">{p.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{p.sku}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-bold text-teal-700 text-sm">{fmt(p.sellingPrice)}</span>
                <span className={`badge ${p.stock <= 5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{p.stock}</span>
              </div>
            </button>
          ))}
          {!products.length && <div className="col-span-full text-slate-400 text-sm py-8 text-center">No products found.</div>}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:col-span-2">
        <div className="card sticky top-6 flex flex-col max-h-[calc(100vh-3rem)]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-sm">Current sale</span>
            {cart.length > 0 && (
              <button className="text-xs text-rose-600 hover:underline" onClick={() => { setCart([]); setPromo(null); }}>Clear</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {cart.map((i) => (
              <div key={i.productId} className="px-4 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.name}</div>
                  <div className="text-xs text-slate-400">{fmt(i.unitPrice)} each</div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200" onClick={() => setQty(i.productId, i.quantity - 1)}>−</button>
                  <input
                    className="w-12 text-center text-sm border border-slate-200 rounded py-1"
                    value={i.quantity}
                    onChange={(e) => setQty(i.productId, parseInt(e.target.value) || 0)}
                  />
                  <button className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200" onClick={() => setQty(i.productId, i.quantity + 1)}>+</button>
                </div>
                <div className="w-24 text-right text-sm font-semibold">{fmt(i.unitPrice * i.quantity)}</div>
              </div>
            ))}
            {!cart.length && <div className="px-4 py-10 text-center text-slate-400 text-sm">Tap a product to start a sale.</div>}
          </div>

          <div className="border-t border-slate-100 p-4 space-y-2">
            <div className="flex gap-2">
              <input className="input !py-1.5" placeholder="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
              <button className="btn-secondary !py-1.5" onClick={applyPromo}>Apply</button>
            </div>
            <Row label="Subtotal" value={fmt(subtotal)} />
            {discount > 0 && <Row label={`Discount (${promo?.name})`} value={`− ${fmt(discount)}`} className="text-emerald-600" />}
            <Row label="Total" value={fmt(total)} className="text-lg font-bold" />
            <button className="btn-amber w-full !py-3 text-base" disabled={!cart.length} onClick={() => setShowPayModal(true)}>
              Charge {fmt(total)}
            </button>
          </div>
        </div>
      </div>

      {showShiftModal && (
        <ShiftModal
          shift={shift}
          onClose={() => setShowShiftModal(false)}
          onChanged={(s) => { setShift(s); setShowShiftModal(false); }}
        />
      )}
      {showPayModal && (
        <PaymentModal
          total={total}
          onClose={() => setShowPayModal(false)}
          onConfirm={async (payment) => {
            const body = {
              items: cart.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.unitPrice * i.quantity,
              })),
              subtotal,
              discountAmount: discount,
              promotionId: promo?.id || null,
              totalAmount: total,
              ...payment,
            };
            const res = await fetch("/api/sales", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
              setCart([]);
              setPromo(null);
              setPromoCode("");
              setShowPayModal(false);
              setMsg({ ok: true, text: `Sale complete — ${data.data.receiptNumber}` });
              router.prefetch(`/sales/${data.data.id}`);
              loadProducts(q);
            } else {
              setMsg({ ok: false, text: data.message || "Sale failed." });
              setShowPayModal(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, className = "" }) {
  return (
    <div className={`flex justify-between text-sm ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShiftModal({ shift, onClose, onChanged }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const url = shift ? "/api/shifts/close" : "/api/shifts";
    const body = shift ? { closingCashCounted: amount, closingNotes: notes } : { openingCash: amount, openingNotes: notes };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) onChanged(shift ? null : data.data);
    else setError(data.message || "Failed.");
  }

  return (
    <Modal title={shift ? "Close shift" : "Open shift"} onClose={onClose}>
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
      {shift && (
        <div className="mb-3 text-sm text-slate-500">
          Cash sales this shift: <b>{fmt(shift.totalCashSales)}</b> · Opening float: <b>{fmt(shift.openingCash)}</b>
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="label">{shift ? "Counted cash in drawer" : "Opening cash float"}</label>
          <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn-primary w-full" onClick={submit}>{shift ? "Close shift" : "Open shift"}</button>
      </div>
    </Modal>
  );
}

function PaymentModal({ total, onClose, onConfirm }) {
  const [method, setMethod] = useState("cash");
  const [cashPaid, setCashPaid] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [mpesaStatus, setMpesaStatus] = useState(null);
  const [error, setError] = useState("");

  const change = Math.max(0, Number(cashPaid || 0) - total);

  async function payCash() {
    if (Number(cashPaid || 0) < total) {
      setError("Cash paid is less than the total.");
      return;
    }
    setBusy(true);
    await onConfirm({
      primaryPaymentMethod: "cash",
      cashPaid: Number(cashPaid),
      changeAmount: change,
    });
    setBusy(false);
  }

  async function payMpesa() {
    setError("");
    setBusy(true);
    setMpesaStatus("Sending STK push…");
    const res = await fetch("/api/mpesa/stk-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, amount: total }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || "STK push failed.");
      setBusy(false);
      setMpesaStatus(null);
      return;
    }
    setMpesaStatus("Waiting for customer PIN… (auto-checking)");
    const txnId = data.data.id;
    // Poll up to 60s for confirmation
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`/api/mpesa/status/${txnId}`).then((r) => r.json());
      if (s.data?.status === "confirmed") {
        setMpesaStatus(`Paid — ${s.data.mpesaReceiptNumber || "confirmed"}`);
        await onConfirm({ primaryPaymentMethod: "mpesa", mpesaPaid: total, customerPhone: phone });
        setBusy(false);
        return;
      }
      if (s.data?.status === "failed" || s.data?.status === "cancelled") {
        setError(s.data.resultDesc || "Payment failed or was cancelled.");
        setBusy(false);
        setMpesaStatus(null);
        return;
      }
    }
    setError("Timed out waiting for confirmation. You can retry or record the sale manually once the SMS arrives.");
    setBusy(false);
    setMpesaStatus(null);
  }

  async function payCard() {
    setBusy(true);
    await onConfirm({ primaryPaymentMethod: "card", cardPaid: total });
    setBusy(false);
  }

  return (
    <Modal title={`Take payment — ${fmt(total)}`} onClose={onClose}>
      {error && <div className="mb-3 text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {["cash", "mpesa", "card"].map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-lg border py-2 text-sm font-medium capitalize ${
              method === m ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            {m === "mpesa" ? "M-Pesa" : m}
          </button>
        ))}
      </div>

      {method === "cash" && (
        <div className="space-y-3">
          <div>
            <label className="label">Cash received</label>
            <input type="number" step="0.01" className="input text-lg" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-between text-sm">
            <span>Change due</span>
            <span className="font-bold text-emerald-600">{fmt(change)}</span>
          </div>
          <button className="btn-primary w-full" onClick={payCash} disabled={busy}>Complete sale</button>
        </div>
      )}

      {method === "mpesa" && (
        <div className="space-y-3">
          <div>
            <label className="label">Customer phone (Safaricom)</label>
            <input className="input text-lg" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
          </div>
          {mpesaStatus && <div className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2">{mpesaStatus}</div>}
          <button className="btn-primary w-full" onClick={payMpesa} disabled={busy || !phone}>
            {busy ? "Processing…" : "Send STK push"}
          </button>
        </div>
      )}

      {method === "card" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Process the card on your terminal, then confirm here.</p>
          <button className="btn-primary w-full" onClick={payCard} disabled={busy}>Card payment received</button>
        </div>
      )}
    </Modal>
  );
}

