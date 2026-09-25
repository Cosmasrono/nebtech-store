"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATALOG_EVENT, getCatalog, getQueuedSales, isNetworkError, queueSale, searchCatalog } from "@/lib/offline";
import { priceCart } from "@/lib/discounts";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function PosPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // {productId, name, unitPrice, quantity, stock}
  const [shift, setShift] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [promo, setPromo] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  // Discounts typed in at the till (only for users allowed to give discounts)
  const [canDiscount, setCanDiscount] = useState(false);
  const [discountFor, setDiscountFor] = useState(null); // productId whose discount box is open
  const [saleDiscount, setSaleDiscount] = useState({ type: "amount", value: "" });
  const [discountReason, setDiscountReason] = useState("");
  const [msg, setMsg] = useState(null);
  const [online, setOnline] = useState(true);
  const searchRef = useRef(null);
  const loadVersion = useRef(0);

  // Online: ask the server. Offline (or the request fails): search the cached catalog.
  const loadProducts = useCallback(async (query = "", catId = selectedCat) => {
    const version = ++loadVersion.current;
    const cached = await getCatalog().catch(() => []);
    const showCached = () => {
      if (version !== loadVersion.current) return;
      setProducts(searchCatalog(cached, query, catId));
      if (cached.length) setCategories([...new Map(cached.map((p) => [p.categoryId, { id: p.categoryId, name: p.category }])).values()].filter((c) => c.id));
    };
    if (cached.length) showCached();
    const catParam = catId && catId !== "all" ? `&category_id=${encodeURIComponent(catId)}` : "";
    const pending = await getQueuedSales().catch(() => []);
    if (navigator.onLine && !pending.length) {
      try {
        const res = await fetch(`/api/pos/products?q=${encodeURIComponent(query)}${catParam}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (version === loadVersion.current) setProducts(data.data);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          if (version === loadVersion.current) {
            setProducts([]);
            setMsg({ ok: false, text: "Sign in with POS access to continue." });
          }
          return;
        }
      } catch {}
    }
    showCached();
  }, [selectedCat]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => { if (d.data?.length) setCategories(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    loadProducts(q, selectedCat);
    fetch("/api/shifts/active").then((r) => r.json()).then((d) => setShift(d.data)).catch(() => {});
  }, [loadProducts]); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => loadProducts(q, selectedCat), 250);
    return () => clearTimeout(t);
  }, [q, selectedCat, loadProducts]);

  useEffect(() => {
    const reload = () => loadProducts(q, selectedCat);
    window.addEventListener(CATALOG_EVENT, reload);
    window.addEventListener("online", reload);
    window.addEventListener("offline", reload);
    return () => {
      window.removeEventListener(CATALOG_EVENT, reload);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", reload);
    };
  }, [q, selectedCat, loadProducts]);

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

  const priced = useMemo(
    () => priceCart({
      items: cart.map((i) => ({ ...i, discountPerItem: i.discount })),
      promo,
      manual: canDiscount ? saleDiscount : null,
    }),
    [cart, promo, saleDiscount, canDiscount],
  );
  const subtotal = priced.gross;
  const discount = priced.discountAmount;
  const total = priced.total;
  const handDiscount = priced.itemDiscount + priced.manualDiscount;

  // Can this user give discounts? Remembered on the device so it still works offline.
  useEffect(() => {
    try { setCanDiscount(localStorage.getItem("nbt-can-discount") === "1"); } catch {}
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) return;
        const ok = d.user.roles.some((r) => ["owner", "super_admin"].includes(r)) || d.user.permissions.includes("give_discounts");
        setCanDiscount(ok);
        try { localStorage.setItem("nbt-can-discount", ok ? "1" : "0"); } catch {}
      })
      .catch(() => {});
  }, []);

  // A new sale starts without discounts.
  useEffect(() => {
    if (cart.length) return;
    setSaleDiscount({ type: "amount", value: "" });
    setDiscountReason("");
    setDiscountFor(null);
  }, [cart.length]);

  function setItemDiscount(productId, value) {
    setCart((c) => c.map((i) => (i.productId === productId
      ? { ...i, discount: Math.min(i.unitPrice, Math.max(0, Number(value) || 0)) }
      : i)));
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    let res;
    try {
      res = await fetch(`/api/promotions?code=${encodeURIComponent(promoCode.trim())}`);
    } catch {
      setMsg({ ok: false, text: "Promo codes can't be checked while offline." });
      return;
    }
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
            placeholder="Search crop & animal inputs, active ingredients (e.g. Glyphosate, Oxytet), SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button className={shift ? "btn-secondary shrink-0" : "btn-amber shrink-0"} onClick={() => setShowShiftModal(true)}>
            {shift ? "Close shift" : "Open shift"}
          </button>
        </div>

        {/* Agrovet Category Pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSelectedCat("all")}
              className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition ${
                selectedCat === "all" ? "bg-teal-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              All Items
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.id)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition ${
                  selectedCat === c.id ? "bg-teal-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

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
              className="card p-3 text-left hover:border-teal-500 hover:shadow transition disabled:opacity-40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-1">
                  <div className="text-sm font-semibold leading-tight line-clamp-2 text-slate-800">{p.name}</div>
                  {p.prescriptionRequired && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200" title="Prescription / POM required">
                      POM
                    </span>
                  )}
                </div>
                {p.genericName && (
                  <div className="text-[11px] text-slate-500 italic truncate mt-0.5" title={p.genericName}>
                    {p.genericName}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {p.packSize && (
                    <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
                      {p.packSize}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">{p.sku}</span>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-bold text-teal-700 text-sm">{fmt(p.sellingPrice)}</span>
                <span className={`badge ${p.stock <= 5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{p.stock}</span>
              </div>
            </button>
          ))}
          {!products.length && <div className="col-span-full text-slate-400 text-sm py-8 text-center">No products found in this category.</div>}
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
              <div key={i.productId} className="px-4 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.name}</div>
                  <div className="text-xs text-slate-400">
                    {i.discount > 0 ? (
                      <><span className="line-through">{fmt(i.unitPrice)}</span> <span className="text-emerald-600 font-medium">{fmt(i.unitPrice - i.discount)}</span> each</>
                    ) : (
                      <>{fmt(i.unitPrice)} each</>
                    )}
                    {canDiscount && (
                      <button type="button" className="ml-2 text-teal-700 hover:underline"
                        onClick={() => setDiscountFor(discountFor === i.productId ? null : i.productId)}>
                        {i.discount > 0 ? "Edit discount" : "Discount"}
                      </button>
                    )}
                  </div>
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
                <div className="w-24 text-right text-sm font-semibold">{fmt((i.unitPrice - (i.discount || 0)) * i.quantity)}</div>
              </div>
              {canDiscount && discountFor === i.productId && (
                <div className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                  <span className="text-slate-500">KSh off each:</span>
                  <input type="number" min="0" max={i.unitPrice} step="1" autoFocus
                    className="w-24 border border-slate-200 rounded px-2 py-1 text-sm"
                    value={i.discount || ""} placeholder="0"
                    onChange={(e) => setItemDiscount(i.productId, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setDiscountFor(null)} />
                  {[5, 10].map((pct) => (
                    <button key={pct} type="button" className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100"
                      onClick={() => setItemDiscount(i.productId, Math.round(i.unitPrice * pct) / 100)}>{pct}%</button>
                  ))}
                  {i.discount > 0 && (
                    <button type="button" className="text-rose-600 hover:underline" onClick={() => setItemDiscount(i.productId, 0)}>Remove</button>
                  )}
                  <button type="button" className="ml-auto text-slate-500 hover:underline" onClick={() => setDiscountFor(null)}>Done</button>
                </div>
              )}
              </div>
            ))}
            {!cart.length && <div className="px-4 py-10 text-center text-slate-400 text-sm">Tap a product to start a sale.</div>}
          </div>

          <div className="border-t border-slate-100 p-4 space-y-2">
            <div className="flex gap-2">
              <input className="input !py-1.5" placeholder="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
              <button className="btn-secondary !py-1.5" onClick={applyPromo}>Apply</button>
            </div>
            {canDiscount && cart.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input type="number" min="0" step="1" className="input !py-1.5" placeholder="Discount on whole sale"
                    value={saleDiscount.value}
                    onChange={(e) => setSaleDiscount({ ...saleDiscount, value: e.target.value })} />
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0 text-xs font-semibold">
                    {[["amount", "KSh"], ["percent", "%"]].map(([t, label]) => (
                      <button key={t} type="button"
                        className={`px-3 ${saleDiscount.type === t ? "bg-teal-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                        onClick={() => setSaleDiscount({ ...saleDiscount, type: t })}>{label}</button>
                    ))}
                  </div>
                </div>
                {saleDiscount.type === "percent" && Number(saleDiscount.value) > 100 && (
                  <div className="text-xs text-rose-600">A discount can&apos;t be more than 100%.</div>
                )}
                {handDiscount > 0 && (
                  <input className="input !py-1.5 text-sm" placeholder="Reason for discount (optional)"
                    value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
                )}
              </div>
            )}
            <Row label="Subtotal" value={fmt(subtotal)} />
            {priced.itemDiscount > 0 && <Row label="Item discounts" value={`− ${fmt(priced.itemDiscount)}`} className="text-emerald-600" />}
            {priced.promoDiscount > 0 && <Row label={`Promo (${promo?.name})`} value={`− ${fmt(priced.promoDiscount)}`} className="text-emerald-600" />}
            {priced.manualDiscount > 0 && (
              <Row label={`Sale discount${saleDiscount.type === "percent" ? ` (${Math.min(100, Number(saleDiscount.value))}%)` : ""}`}
                value={`− ${fmt(priced.manualDiscount)}`} className="text-emerald-600" />
            )}
            <Row label="Total" value={fmt(total)} className="text-lg font-bold" />
            <button className="btn-amber w-full !py-3 text-base"
              disabled={!cart.length || (saleDiscount.type === "percent" && Number(saleDiscount.value) > 100)}
              onClick={() => setShowPayModal(true)}>
              Charge {fmt(total)}
            </button>
          </div>
        </div>
      </div>

      {completedSale?.offline && (
        <Modal title="Sale saved offline" onClose={() => setCompletedSale(null)}>
          <div className="text-center space-y-1 mb-4">
            <div className="text-4xl">📥</div>
            <div className="font-mono text-sm text-slate-500">Ref {completedSale.clientId.slice(0, 8).toUpperCase()}</div>
            <div className="text-2xl font-bold">{fmt(completedSale.totalAmount)}</div>
            <p className="text-sm text-slate-500">
              No internet right now. This sale is stored on this device and will upload automatically when the
              connection is back — it will then appear under Sales with a receipt number you can print.
            </p>
          </div>
          <button className="btn-primary w-full" onClick={() => setCompletedSale(null)}>New sale</button>
        </Modal>
      )}
      {completedSale && !completedSale.offline && (
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
          online={online}
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
                discountPerItem: i.discount || 0,
                lineTotal: (i.unitPrice - (i.discount || 0)) * i.quantity,
              })),
              ...(canDiscount && Number(saleDiscount.value) > 0 && {
                saleDiscount: { type: saleDiscount.type, value: Number(saleDiscount.value) },
              }),
              ...(handDiscount > 0 && discountReason.trim() && { discountReason: discountReason.trim() }),
              subtotal,
              discountAmount: discount,
              promotionId: promo?.id || null,
              totalAmount: total,
              ...payment,
              // Lets the server drop a duplicate if this request landed but the reply was lost
              clientId: crypto.randomUUID(),
            };
            const resetCart = () => {
              setCart([]);
              setPromo(null);
              setPromoCode("");
              setShowPayModal(false);
            };
            const saveOffline = async () => {
              // M-Pesa sales are always confirmed online, so only cash/card reach here.
              const entry = await queueSale({
                ...body,
                items: body.items.map((it) => ({ ...it, name: cart.find((c) => c.productId === it.productId)?.name })),
              });
              resetCart();
              setCompletedSale({ offline: true, clientId: entry.clientId, totalAmount: total });
              loadProducts(q);
            };

            const canSaveOffline = ["cash", "card"].includes(payment.primaryPaymentMethod);
            if (!navigator.onLine) {
              if (!canSaveOffline) throw new Error("M-Pesa and debt sales need an internet connection.");
              await saveOffline();
              return;
            }
            let res;
            try {
              res = await fetch("/api/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000),
              });
            } catch (e) {
              if (isNetworkError(e) && canSaveOffline) {
                await saveOffline();
              } else {
                setMsg({ ok: false, text: "Connection lost while recording the sale. Check Sales before retrying." });
                setShowPayModal(false);
              }
              return;
            }
            if (res.status >= 500 && canSaveOffline) {
              await saveOffline();
              return;
            }
            const data = await res.json().catch(() => ({}));
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
    // Offline cash sales must reach the server first, or the drawer count won't match expected cash.
    if (shift && (await getQueuedSales().catch(() => [])).length) {
      setError("Some offline sales haven't uploaded yet. Reconnect (or resolve them in the top bar) before closing the shift.");
      return;
    }
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      setError("You're offline. Shifts can only be opened or closed with an internet connection.");
      return;
    }
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

function PaymentModal({ total, online, onClose, onConfirm, onMpesaFailed }) {
  const [method, setMethod] = useState("cash");
  const [cashPaid, setCashPaid] = useState("");
  const [phone, setPhone] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [loanNotes, setLoanNotes] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  // idle | sending | awaiting | paid | failed | timeout
  const [mpesaPhase, setMpesaPhase] = useState("idle");
  const [mpesaMsg, setMpesaMsg] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [redirectIn, setRedirectIn] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.data || []))
      .catch(() => {});
  }, []);

  const selectedCust = customers.find((c) => c.id === customerId);
  const availCredit = selectedCust ? Math.max(0, (selectedCust.creditLimit || 0) - (selectedCust.currentCreditBalance || 0)) : 0;

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

  async function confirmPayment(payment) {
    setError("");
    setBusy(true);
    try {
      await onConfirm(payment);
    } catch (error) {
      setError(error.message || "Sale could not be saved. Your cart is still available; please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function payCash() {
    if (Number(cashPaid || 0) < total) {
      setError("Cash paid is less than the total.");
      return;
    }
    await confirmPayment({
      primaryPaymentMethod: "cash",
      cashPaid: Number(cashPaid),
      changeAmount: change,
      customerId: customerId || undefined,
      customerName: selectedCust?.name,
      customerPhone: selectedCust?.phone || undefined,
    });
  }

  async function addCustomer() {
    setError("");
    const name = newCustomer.name.trim();
    if (!name || !newCustomer.phone.trim()) return setError("Enter the customer's name and phone number.");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: newCustomer.phone.trim() || null, customerType: "registered" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return setError(d?.message || "Couldn't add the customer.");
    setCustomers((list) => [...list, d.data].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerId(d.data.id);
    if (d.data.phone && !phone) setPhone(d.data.phone);
    setAddingCustomer(false);
    setNewCustomer({ name: "", phone: "" });
  }

  async function payDebt() {
    setError("");
    if (!navigator.onLine) {
      setError("Debt sales need an internet connection.");
      return;
    }
    if (!customerId || !selectedCust) {
      setError("Choose the customer who will owe this amount (or add them).");
      return;
    }
    if (selectedCust.creditLimit > 0 && total > availCredit) {
      setError(`Debt limit reached. ${selectedCust.name} can owe up to ${fmt(availCredit)} more, but this sale is ${fmt(total)}.`);
      return;
    }
    await confirmPayment({
      primaryPaymentMethod: "credit",
      customerId,
      customerName: selectedCust.name,
      customerPhone: selectedCust.phone || undefined,
      creditDueDate,
      loanNotes: loanNotes.trim() || undefined,
    });
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
          customerId: customerId || undefined,
          customerName: selectedCust?.name,
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
    await confirmPayment({
      primaryPaymentMethod: "card",
      cardPaid: total,
      customerId: customerId || undefined,
      customerName: selectedCust?.name,
      customerPhone: selectedCust?.phone || undefined,
    });
  }

  const mpesaResolved = mpesaPhase === "failed" || mpesaPhase === "timeout";

  return (
    <Modal title={`Take payment — ${fmt(total)}`} onClose={onClose}>
      {error && <div className="mb-3 text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}

      {/* Customer */}
      <div className="mb-4 pb-3 border-b border-slate-100">
        <label className="label flex justify-between items-center text-xs">
          <span>Customer {method === "credit" ? <span className="text-rose-600 font-bold">*</span> : "(Optional)"}</span>
          {selectedCust && selectedCust.creditLimit > 0 && (
            <span className="text-teal-700 font-semibold">
              Can still owe: {fmt(availCredit)}
            </span>
          )}
        </label>
        {!addingCustomer ? (
          <div className="flex gap-2">
            <select
              className="input text-sm !py-1.5"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const c = customers.find((cust) => cust.id === e.target.value);
                if (c?.phone && !phone) setPhone(c.phone);
              }}
            >
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ""} {c.currentCreditBalance > 0 ? `· owes ${fmt(c.currentCreditBalance)}` : ""}
                </option>
              ))}
            </select>
            {online && (
              <button type="button" className="text-xs text-teal-700 font-semibold whitespace-nowrap hover:underline" onClick={() => setAddingCustomer(true)}>
                + New
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm !py-1.5" placeholder="Customer name *" value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} autoFocus />
            <input className="input text-sm !py-1.5" placeholder="Phone 07XX… *" value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            <button type="button" className="btn-primary text-xs !py-1.5" onClick={addCustomer}>Save customer</button>
            <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setAddingCustomer(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {[
          { id: "cash", label: "Cash" },
          { id: "mpesa", label: "M-Pesa" },
          { id: "credit", label: "Debt" },
          { id: "card", label: "Card" },
        ].map((m) => (
          <button
            key={m.id}
            disabled={busy || (!online && ["mpesa", "credit"].includes(m.id))}
            onClick={() => setMethod(m.id)}
            className={`rounded-lg border py-2 text-xs font-semibold ${
              method === m.id ? "border-teal-600 bg-teal-50 text-teal-700 shadow-sm" : "border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            {m.label}
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

      {method === "credit" && (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-amber-900">Record as debt (pay later)</div>
            <div className="text-amber-700">
              {selectedCust ? (
                <>
                  <b>{selectedCust.name}</b> takes these products now and pays later. The products are saved on the debt.
                  {selectedCust.currentCreditBalance > 0 && <> Already owes <b>{fmt(selectedCust.currentCreditBalance)}</b>.</>}
                  {!selectedCust.canBuyOnCredit && <div className="mt-1">Not yet approved to buy on debt: a manager&apos;s account is needed to complete this.</div>}
                </>
              ) : (
                <span className="text-rose-600 font-semibold">Choose the customer above, or add a new one.</span>
              )}
            </div>
          </div>

          <div>
            <label className="label">Pay by</label>
            <input type="date" className="input" value={creditDueDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setCreditDueDate(e.target.value)} />
          </div>

          <input className="input text-sm" placeholder="Note (optional)" value={loanNotes} onChange={(e) => setLoanNotes(e.target.value)} />

          <button
            className="btn-amber w-full !py-2.5 font-semibold"
            onClick={payDebt}
            disabled={busy || !customerId || !online}
          >
            Record as debt ({fmt(total)})
          </button>
        </div>
      )}

      {method === "mpesa" && !online && mpesaPhase === "idle" && (
        <div className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
          M-Pesa needs an internet connection. Take cash or card, or wait until you're back online.
        </div>
      )}

      {method === "mpesa" && (online || mpesaPhase !== "idle") && (
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

