// M-Pesa Daraja STK Push — port of App\Services\MpesaService
const BASE = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

function baseUrl() {
  return BASE[process.env.MPESA_ENV === "production" ? "production" : "sandbox"];
}

export async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`M-Pesa auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export function normalizePhone(phone) {
  let p = String(phone).replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

export async function stkPush({ phone, amount, accountReference = "NebTechStore", description = "POS Payment" }) {
  const token = await getAccessToken();
  const shortCode = process.env.MPESA_SHORT_CODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");

  const body = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
    Amount: Math.ceil(Number(amount)),
    PartyA: normalizePhone(phone),
    PartyB: shortCode,
    PhoneNumber: normalizePhone(phone),
    CallBackURL: process.env.MPESA_CALLBACK_URL || `${process.env.APP_URL}/api/mpesa/callback`,
    AccountReference: accountReference,
    TransactionDesc: description,
  };

  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
