"use client";

import { useEffect, useState } from "react";
import { checkoutVisit, useClinic } from "@/lib/store";
import type {
  ID,
  Medicine,
  Order,
  PaymentMethod,
  Visit,
} from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  LocationBadge,
  PageHeader,
  inputClass,
} from "@/components/ui";
import {
  ordersForVisit,
  patientMap,
  patientName,
  visitLocation,
  visitsByStatus,
} from "@/lib/selectors";
import { notify } from "@/lib/toast";

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "mpesa", label: "M-Pesa" },
  { key: "card", label: "Card" },
];

const money = (n: number) =>
  `KSh ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

const medicineLabel = (m: Medicine) =>
  `${m.name} ${m.strength}`.replace(" —", "").trim();

interface Receipt {
  patient: string;
  mrn: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
  method: PaymentMethod;
  reference: string;
  at: Date;
}

export default function PharmacyPage() {
  const data = useClinic();
  const pmap = patientMap(data);
  const queue = visitsByStatus(data, "awaiting-pharmacy");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // Daraja credentials present? If not, M-Pesa falls back to manual entry.
  const [stkEnabled, setStkEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/mpesa/stkpush")
      .then((r) => r.json())
      .then((b: { configured?: boolean }) => setStkEnabled(!!b.configured))
      .catch(() => setStkEnabled(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Pharmacy"
        subtitle="Search the shelf, build the patient's cart, take payment, and close the visit"
      />

      {receipt && (
        <ReceiptCard receipt={receipt} onDismiss={() => setReceipt(null)} />
      )}

      {queue.length === 0 ? (
        <EmptyState>No prescriptions waiting to be dispensed.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {queue.map((visit) => (
            <PosCard
              key={visit.id}
              visit={visit}
              patientLabel={patientName(pmap.get(visit.patientId))}
              mrn={pmap.get(visit.patientId)?.mrn ?? ""}
              prescriptions={ordersForVisit(data, visit.id).filter(
                (o) => o.type === "prescription",
              )}
              stkEnabled={stkEnabled}
              onPaid={setReceipt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One patient's point of sale: the doctor's prescription as a reference,
 *  a catalog search, a cart, and checkout. */
type StkState = {
  id: string; // CheckoutRequestID
  status: "pending" | "success" | "failed";
  startedAt: number; // when the push was requested, for the polling backstop
  receipt?: string;
  detail?: string;
};

// The server settles stale pushes after 2 minutes; this backstop only fires
// if the status endpoint itself is unreachable and keeps reporting pending.
const STK_CLIENT_TIMEOUT_MS = 3 * 60_000;

function PosCard({
  visit,
  patientLabel,
  mrn,
  prescriptions,
  stkEnabled,
  onPaid,
}: {
  visit: Visit;
  patientLabel: string;
  mrn: string;
  prescriptions: Order[];
  stkEnabled: boolean;
  onPaid: (r: Receipt) => void;
}) {
  const data = useClinic();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<ID, number>>(new Map()); // medicineId → qty
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [stk, setStk] = useState<StkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = new Map(data.medicines.map((m) => [m.id, m]));
  const prescribed = prescriptions.flatMap((o) => o.meds ?? []);

  const q = query.trim().toLowerCase();
  const results = q
    ? data.medicines
        .filter((m) =>
          `${m.name} ${m.strength} ${m.form}`.toLowerCase().includes(q),
        )
        .slice(0, 6)
    : [];

  const setQty = (id: ID, qty: number) =>
    setCart((c) => {
      const next = new Map(c);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  const addToCart = (m: Medicine) => {
    setQty(m.id, Math.min((cart.get(m.id) ?? 0) + 1, m.stock));
    setQuery("");
  };

  const cartLines = [...cart.entries()]
    .map(([id, qty]) => ({ med: catalog.get(id), qty }))
    .filter((l): l is { med: Medicine; qty: number } => !!l.med);
  const total = cartLines.reduce((s, l) => s + l.qty * l.med.unitPrice, 0);
  const inStock = cartLines.every((l) => l.qty <= l.med.stock);
  const stkFlow = method === "mpesa" && stkEnabled;
  const needsReference = method !== "cash" && !stkFlow;
  const ready =
    cartLines.length > 0 &&
    inStock &&
    (!needsReference || reference.trim() !== "");

  const checkout = async (serverReference?: string, shownReference?: string) => {
    setBusy(true);
    setError(null);
    const err = await checkoutVisit(
      visit.id,
      method,
      serverReference ?? reference,
      cartLines.map((l) => ({ medicineId: l.med.id, quantity: l.qty })),
    );
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onPaid({
      patient: patientLabel,
      mrn,
      items: cartLines.map((l) => ({
        name: medicineLabel(l.med),
        quantity: l.qty,
        unitPrice: l.med.unitPrice,
      })),
      total,
      method,
      reference: shownReference ?? serverReference ?? reference.trim(),
      at: new Date(),
    });
  };

  // Ask Daraja to pop the PIN prompt on the customer's phone.
  const requestStk = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mpesa/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          accountReference: mrn || "CareFlow",
          items: cartLines.map((l) => ({
            medicineId: l.med.id,
            quantity: l.qty,
          })),
        }),
      });
      const body = (await res.json()) as {
        checkoutRequestId?: string;
        reused?: boolean;
        error?: string;
      };
      if (!res.ok || !body.checkoutRequestId) {
        const message = body.error ?? "M-Pesa request failed.";
        setError(message);
        notify("error", message);
      } else {
        setStk({
          id: body.checkoutRequestId,
          status: "pending",
          startedAt: Date.now(),
        });
        notify(
          "success",
          body.reused
            ? "This amount was already paid from that phone — reusing the payment."
            : "M-Pesa request sent.",
        );
      }
    } catch {
      const message = "M-Pesa request failed — check your connection.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  };

  // While the STK push is pending, poll until Daraja settles it.
  useEffect(() => {
    if (!stk || stk.status !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (Date.now() - stk.startedAt > STK_CLIENT_TIMEOUT_MS) {
        setStk({
          ...stk,
          status: "failed",
          detail: "no response from M-Pesa",
        });
        notify("error", "M-Pesa confirmation timed out.");
        return;
      }
      try {
        const res = await fetch(`/api/mpesa/status?id=${stk.id}`);
        const body = (await res.json()) as {
          status?: string;
          receipt?: string;
          detail?: string;
        };
        if (cancelled) return;
        if (body.status === "success" || body.status === "failed") {
          setStk({
            ...stk,
            status: body.status,
            receipt: body.receipt,
            detail: body.detail,
          });
          if (body.status === "success") {
            notify("success", "M-Pesa payment confirmed.");
            // Payment confirmed → finish the sale automatically.
            void checkout(stk.id, body.receipt ?? stk.id);
          } else {
            notify("error", body.detail ?? "M-Pesa payment failed.");
          }
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stk]);

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{patientLabel}</h2>
          <p className="text-sm text-zinc-500">
            {mrn} · {visit.complaint || "—"}
          </p>
        </div>
        <LocationBadge location={visitLocation(data, visit)} />
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* Left: what the doctor prescribed + catalog search */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">
            Prescription
          </h3>
          {prescribed.length === 0 ? (
            <p className="text-sm text-zinc-500">No prescription lines.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-zinc-700">
              {prescribed.map((m) => (
                <li key={m.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                  <strong>{m.name}</strong> — {m.dosage}, {m.frequency},{" "}
                  {m.duration}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-700">
            Find medicine
          </h3>
          <input
            className={`${inputClass} w-full`}
            placeholder="Search the shelf… e.g. amox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <ul className="mt-2 flex flex-col gap-1">
              {results.length === 0 && (
                <li className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                  Nothing on the shelf matches “{query}”.
                </li>
              )}
              {results.map((m) => {
                const out = m.stock <= (cart.get(m.id) ?? 0);
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>{medicineLabel(m)}</strong>{" "}
                      <span className="text-zinc-500">
                        · {m.form} · {money(m.unitPrice)} ·{" "}
                        {m.stock > 0 ? `${m.stock} in stock` : "out of stock"}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={out}
                      onClick={() => addToCart(m)}
                    >
                      {out ? "Out of stock" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: cart + payment */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">
            Cart ({cartLines.length})
          </h3>
          {cartLines.length === 0 ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500">
              Search the shelf and add medicines to the cart.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {cartLines.map(({ med, qty }) => (
                <li
                  key={med.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <span className="flex-1">
                    <strong>{medicineLabel(med)}</strong>{" "}
                    <span className="text-zinc-500">
                      @ {money(med.unitPrice)}
                    </span>
                  </span>
                  <input
                    className={`${inputClass} h-8 w-16 px-2`}
                    type="number"
                    min={1}
                    max={med.stock}
                    value={qty}
                    onChange={(e) =>
                      setQty(
                        med.id,
                        Math.min(Number(e.target.value) || 0, med.stock),
                      )
                    }
                  />
                  <span className="w-24 text-right font-medium">
                    {money(qty * med.unitPrice)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQty(med.id, 0)}
                  >
                    ✕
                  </Button>
                </li>
              ))}
              <li className="mt-1 flex justify-between border-t border-zinc-200 px-3 pt-2 text-base font-semibold">
                <span>Total due</span>
                <span className="text-teal-700">{money(total)}</span>
              </li>
            </ul>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Payment method">
              <select
                className={inputClass}
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as PaymentMethod);
                  setStk(null);
                  setError(null);
                }}
              >
                {METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            {stkFlow ? (
              <Field label="Customer phone (Safaricom)">
                <input
                  className={inputClass}
                  placeholder="e.g. 0712 345678"
                  value={phone}
                  disabled={stk?.status === "pending"}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label={
                  method === "mpesa"
                    ? "M-Pesa code"
                    : method === "card"
                      ? "Card reference"
                      : "Reference (optional)"
                }
              >
                <input
                  className={inputClass}
                  placeholder={method === "mpesa" ? "e.g. SGH4X2K9QT" : ""}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {stkFlow && stk?.status === "pending" && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <span className="animate-pulse">
                Request sent to {phone} — waiting for the customer to enter
                their M-Pesa PIN…
              </span>
              <Button size="sm" variant="ghost" onClick={() => setStk(null)}>
                Cancel
              </Button>
            </div>
          )}
          {stkFlow && stk?.status === "success" && (
            <p className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
              Payment confirmed{stk.receipt ? ` (${stk.receipt})` : ""} —{" "}
              {error ? (
                <>
                  the visit did not close.{" "}
                  <button
                    className="underline"
                    disabled={busy}
                    onClick={() => void checkout(stk.id, stk.receipt ?? stk.id)}
                  >
                    Retry closing the visit
                  </button>
                </>
              ) : (
                "closing the visit…"
              )}
            </p>
          )}
          {stkFlow && stk?.status === "failed" && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Payment failed: {stk.detail ?? "not confirmed"}.{" "}
              <button className="underline" onClick={() => setStk(null)}>
                Try again
              </button>
            </p>
          )}

          {stkFlow ? (
            <Button
              className="mt-4 w-full"
              disabled={
                !ready ||
                busy ||
                !phone.trim() ||
                stk?.status === "pending" ||
                stk?.status === "success"
              }
              onClick={requestStk}
            >
              {cartLines.length === 0
                ? "Add medicines to the cart first"
                : !inStock
                  ? "Not enough stock for the cart"
                  : !phone.trim()
                    ? "Enter the customer's phone number"
                    : stk?.status === "pending"
                      ? "Waiting for M-Pesa…"
                      : `Request ${money(Math.max(1, Math.round(total)))} via M-Pesa`}
            </Button>
          ) : (
            <Button
              className="mt-4 w-full"
              disabled={!ready || busy}
              onClick={() => checkout()}
            >
              {cartLines.length === 0
                ? "Add medicines to the cart first"
                : !inStock
                  ? "Not enough stock for the cart"
                  : needsReference && !reference.trim()
                    ? "Enter the payment reference"
                    : `Take ${money(total)} & close visit`}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Confirmation of the last sale — what a printed receipt would show. */
function ReceiptCard({
  receipt,
  onDismiss,
}: {
  receipt: Receipt;
  onDismiss: () => void;
}) {
  const methodLabel =
    METHODS.find((m) => m.key === receipt.method)?.label ?? receipt.method;
  return (
    <Card className="mb-6 border-teal-300 bg-teal-50/50">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-teal-900">
            Payment received — visit closed
          </h2>
          <p className="mt-1 text-xs text-teal-700">
            {receipt.patient} ({receipt.mrn}) ·{" "}
            {receipt.at.toLocaleTimeString()} · {methodLabel}
            {receipt.reference ? ` · ${receipt.reference}` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-700">
        {receipt.items.map((item, i) => (
          <li key={i} className="flex justify-between">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{money(item.quantity * item.unitPrice)}</span>
          </li>
        ))}
        <li className="mt-1 flex justify-between border-t border-teal-200 pt-2 font-semibold">
          <span>Total paid</span>
          <span>{money(receipt.total)}</span>
        </li>
      </ul>
    </Card>
  );
}
