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
  const [completedSale, setCompletedSale] = useState(null);
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

      {completedSale && (
        <Modal title="Sale complete" onClose={() => setCompletedSale(null)}>
          <div className="text-center space-y-1 mb-4">
            <div className="text-4xl">✅</div>
            <div className="font-mono text-sm text-slate-500">{completedSale.receiptNumber}</div>
            <div className="text-2xl font-bold">{fmt(completedSale.totalAmount)}</div>
            <p className="text-sm text-slate-500">Would you like to print the receipt?</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => router.push(`/sales/${completedSale.id}?print=1`)}>
              🖨️ Print receipt
            </button>
            <button className="btn-secondary" onClick={() => router.push("/sales")}>
              No, go to sales
            </button>
          </div>
        </Modal>
      )}
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
          onMpesaFailed={() => {
            setShowPayModal(false);
            router.push("/mpesa-payments");
          }}
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
              setCompletedSale(data.data);
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

const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

function ShiftModal({ shift, onClose, onChanged }) {
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [closeResult, setCloseResult] = useState(null);

  const countedTotal = DENOMS.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0);

  async function submit() {
    setError("");
    const url = shift ? "/api/shifts/close" : "/api/shifts";
    const breakdown = DENOMS.filter((d) => Number(counts[d]) > 0).map((d) => `${d}×${counts[d]}`).join(", ");
    const body = shift
      ? { closingCashCounted: countedTotal, closingNotes: [notes, breakdown && `Count: ${breakdown}`].filter(Boolean).join(" | ") }
      : { openingCash: amount, openingNotes: notes };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.message || "Failed."); return; }
    if (shift) setCloseResult(data.data);
    else onChanged(data.data);
  }

  if (closeResult) {
    const cashOk = Math.abs(closeResult.cashShortageOverage) <= 0.009;
    const mpesaOk = Math.abs(closeResult.mpesaVariance) <= 0.009;
    return (
      <Modal title="Shift closed — reconciliation" onClose={() => onChanged(null)}>
        <div className="space-y-2 text-sm">
          <div className="font-semibold text-slate-600">Cash</div>
          <Row label="Expected in drawer" value={fmt(closeResult.expectedClosingCash)} />
          <Row label="Counted" value={fmt(closeResult.closingCashCounted)} />
          <Row label={cashOk ? "Cash balanced ✓" : closeResult.cashShortageOverage > 0 ? "Overage" : "Shortage"}
            value={cashOk ? "" : fmt(Math.abs(closeResult.cashShortageOverage))}
            className={cashOk ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"} />
          <div className="font-semibold text-slate-600 pt-2 border-t border-slate-100">M-Pesa</div>
          <Row label="Recorded on sales" value={fmt(closeResult.totalMpesaSales)} />
          <Row label="Confirmed payments" value={fmt(closeResult.mpesaConfirmedTotal)} />
          <Row label={mpesaOk ? "M-Pesa balanced ✓" : "Variance"}
            value={mpesaOk ? "" : fmt(Math.abs(closeResult.mpesaVariance))}
            className={mpesaOk ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"} />
          {closeResult.status === "discrepancy" && (
            <div className="rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-xs">
              This shift was flagged with a discrepancy. Your manager can review it under Reconciliation.
            </div>
          )}
          <button className="btn-primary w-full mt-2" onClick={() => onChanged(null)}>Done</button>
        </div>
      </Modal>
    );
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
        {shift ? (
          <div>
            <label className="label">Count the cash in the drawer</label>
            <div className="grid grid-cols-3 gap-2">
              {DENOMS.map((d) => (
                <div key={d} className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 w-12 text-right shrink-0">{d} ×</span>
                  <input type="number" min="0" className="input !py-1.5 text-center" placeholder="0"
                    value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-sm font-bold">
              <span>Counted total</span><span>{fmt(countedTotal)}</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Opening cash float</label>
            <input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn-primary w-full" onClick={submit}>{shift ? "Close shift" : "Open shift"}</button>
      </div>
    </Modal>
  );
}

function PaymentModal({ total, onClose, onConfirm, onMpesaFailed }) {
  const [method, setMethod] = useState("cash");
  const [cashPaid, setCashPaid] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  // idle | sending | awaiting | paid | failed | timeout
  const [mpesaPhase, setMpesaPhase] = useState("idle");
  const [mpesaMsg, setMpesaMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [redirectIn, setRedirectIn] = useState(0);
  const [error, setError] = useState("");

  // After failure/timeout, count down and auto-route to /mpesa-payments.
  // The Resend button cancels the redirect (see payMpesa).
  useEffect(() => {
    if (mpesaPhase !== "failed" && mpesaPhase !== "timeout") return;
    setRedirectIn(4);
    const tick = setInterval(() => {
      setRedirectIn((n) => {
        if (n <= 1) {
          clearInterval(tick);
          onMpesaFailed?.();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [mpesaPhase, onMpesaFailed]);

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

  async function pollUntilResolved(txnId) {
    const totalSeconds = 120;
    for (let i = 0; i < totalSeconds / 3; i++) {
      setCountdown(totalSeconds - i * 3);
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`/api/mpesa/status/${txnId}`).then((r) => r.json()).catch(() => ({}));
      if (s.data?.status === "confirmed") {
        setMpesaPhase("paid");
        setMpesaMsg(`Paid — ${s.data.mpesaReceiptNumber || "confirmed"}`);
        await onConfirm({
          primaryPaymentMethod: "mpesa",
          mpesaPaid: total,
          customerPhone: phone,
          mpesaTransactionId: txnId,
        });
        return;
      }
      if (s.data?.status === "failed" || s.data?.status === "cancelled") {
        setMpesaPhase("failed");
        setMpesaMsg(s.data.resultDesc || "The customer declined or the payment failed.");
        return;
      }
    }
    setMpesaPhase("timeout");
    setMpesaMsg("Timed out waiting for the customer to enter their PIN.");
  }

  async function payMpesa() {
    setError("");
    setMpesaMsg("");
    setRedirectIn(0);
    setBusy(true);
    setMpesaPhase("sending");
    try {
      const res = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: total }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMpesaPhase("failed");
        setMpesaMsg(data.message || "STK push could not be sent.");
        return;
      }
      setMpesaPhase("awaiting");
      setMpesaMsg("STK push sent. Ask the customer to enter their M-Pesa PIN.");
      await pollUntilResolved(data.data.id);
    } finally {
      setBusy(false);
      setCountdown(0);
    }
  }

  async function payCard() {
    setBusy(true);
    await onConfirm({ primaryPaymentMethod: "card", cardPaid: total });
    setBusy(false);
  }

  const mpesaResolved = mpesaPhase === "failed" || mpesaPhase === "timeout";

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
            <input
              className="input text-lg"
              placeholder="07XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy || mpesaPhase === "awaiting"}
              autoFocus
            />
          </div>

          {mpesaPhase === "sending" && (
            <div className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
              Sending STK push…
            </div>
          )}
          {mpesaPhase === "awaiting" && (
            <div className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2 flex items-center justify-between">
              <span>{mpesaMsg}</span>
              {countdown > 0 && <span className="tabular-nums text-teal-600">{countdown}s</span>}
            </div>
          )}
          {mpesaPhase === "paid" && (
            <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              {mpesaMsg} — recording sale…
            </div>
          )}
          {mpesaResolved && (
            <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
              <div className="font-medium">
                {mpesaPhase === "timeout" ? "No response from customer" : "Payment failed"}
              </div>
              <div className="text-xs mt-0.5">{mpesaMsg}</div>
              {redirectIn > 0 && (
                <div className="text-xs mt-1 text-rose-600">
                  Opening M-Pesa payments in {redirectIn}s…
                </div>
              )}
            </div>
          )}

          {mpesaResolved ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary"
                disabled={busy || !phone}
                onClick={payMpesa}
              >
                Resend payment
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          ) : (
            <button
              className="btn-primary w-full"
              onClick={payMpesa}
              disabled={busy || !phone || mpesaPhase === "awaiting" || mpesaPhase === "paid"}
            >
              {mpesaPhase === "sending" && "Sending…"}
              {mpesaPhase === "awaiting" && "Waiting for customer…"}
              {mpesaPhase === "paid" && "Paid ✓"}
              {mpesaPhase === "idle" && "Send STK push"}
            </button>
          )}
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

