// PayHero client — pattern mirrors CareFlow's working implementation.
// Kept filename & existing exports (stkPush, normalizePhone) for import compat.

const PAYHERO_BASE = "https://backend.payhero.co.ke/api/v2";

function baseUrl() {
  return (process.env.PAYHERO_BASE_URL || PAYHERO_BASE).replace(/\/$/, "");
}

function basicAuth() {
  const raw = process.env.PAYHERO_AUTH_TOKEN?.trim();
  if (raw) return raw.startsWith("Basic ") ? raw : `Basic ${raw}`;
  const u = process.env.PAYHERO_API_USERNAME?.trim() || process.env.PAYHERO_USERNAME?.trim() || "";
  const p = process.env.PAYHERO_API_PASSWORD?.trim() || process.env.PAYHERO_PASSWORD?.trim() || "";
  if (!u || !p) return "";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

function channelId() {
  const v = Number(process.env.PAYHERO_CHANNEL_ID);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function callbackUrl() {
  return (
    process.env.PAYHERO_CALLBACK_URL?.trim() ||
    (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/api/mpesa/callback` : undefined)
  );
}

export function mpesaConfigured() {
  return Boolean(basicAuth() && channelId());
}

export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const n = digits.startsWith("254")
    ? digits
    : digits.startsWith("0")
      ? `254${digits.slice(1)}`
      : digits.startsWith("7") || digits.startsWith("1")
        ? `254${digits}`
        : digits;
  return n;
}

export function isValidPhone(raw) {
  return /^254[71]\d{8}$/.test(normalizePhone(raw));
}

function toLocalPhone(phone) {
  return phone.startsWith("254") ? `0${phone.slice(3)}` : phone;
}

/**
 * Send an STK push via PayHero. Generates its own externalReference and returns it
 * so the caller can use it as the DB-side correlation key.
 * Resolves to: { ok, externalReference, payheroReference, payheroCheckoutRequestId, error }
 */
export async function stkPush({ phone, amount, accountReference, description = "POS Payment" }) {
  const auth = basicAuth();
  const ch = channelId();
  const cb = callbackUrl();
  if (!auth || !ch) return { ok: false, error: "PayHero is not configured (set PAYHERO_API_USERNAME/PASSWORD and PAYHERO_CHANNEL_ID)." };

  const externalReference = accountReference || `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const res = await fetch(`${baseUrl()}/payments`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.max(1, Math.round(Number(amount))),
      phone_number: toLocalPhone(normalizePhone(phone)),
      channel_id: ch,
      provider: "m-pesa",
      external_reference: externalReference,
      customer_name: description || "POS Customer",
      callback_url: cb,
    }),
    cache: "no-store",
  });

  let body = {};
  try { body = await res.json(); } catch { /* keep empty */ }

  if (res.ok && (body.success || String(body.status || "").toUpperCase() === "QUEUED")) {
    return {
      ok: true,
      externalReference,
      payheroReference: body.reference || null,
      payheroCheckoutRequestId: body.CheckoutRequestID || null,
      raw: body,
    };
  }

  console.error("[payhero] STK rejected", res.status, body);
  return {
    ok: false,
    externalReference,
    error: body.error_message || body.message || body.detail || `PayHero HTTP ${res.status}`,
    raw: body,
  };
}

/**
 * Query PayHero for the outcome of a transaction by its PayHero reference.
 * Resolves to: { status: 'success'|'failed'|'pending', receipt?, detail? }
 */
export async function stkQuery(reference) {
  const auth = basicAuth();
  if (!auth) return { status: "pending" };

  const url = new URL(`${baseUrl()}/transaction-status`);
  url.searchParams.set("reference", reference);

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth },
    cache: "no-store",
  });
  let body = {};
  try { body = await res.json(); } catch { /* keep empty */ }

  const status = String(body.status || "").toUpperCase();

  if (res.ok && status === "SUCCESS") {
    return { status: "success", receipt: body.provider_reference || body.third_party_reference || body.MpesaReceiptNumber || null };
  }
  if (res.ok && status === "FAILED") {
    return { status: "failed", detail: body.message || body.error_message || "Payment failed." };
  }
  if (res.ok && (!status || status === "QUEUED" || status === "PENDING")) {
    return { status: "pending" };
  }
  if (res.status >= 500) return { status: "pending" }; // transient — keep polling
  return { status: "failed", detail: body.error_message || body.message || `PayHero status HTTP ${res.status}` };
}
