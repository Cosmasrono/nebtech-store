import prisma from "@/lib/prisma";
import { stkQuery } from "@/lib/mpesa";

// PayHero callback. Shape: { response: { ExternalReference, CheckoutRequestID,
// ResultCode, Status, MpesaReceiptNumber, ResultDesc }, status?: boolean }.
//
// This URL is public, so anyone could post a fake "success" to it. The body is only
// used to find the transaction; the outcome is always confirmed with PayHero itself.
// Optionally set PAYHERO_CALLBACK_SECRET and add ?key=<secret> to PAYHERO_CALLBACK_URL.
const ACCEPTED = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

export async function POST(req) {
  const secret = process.env.PAYHERO_CALLBACK_SECRET;
  if (secret && new URL(req.url).searchParams.get("key") !== secret) {
    return Response.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const r = body?.response || {};
  const externalReference = r.ExternalReference || null;        // == our checkoutRequestId
  const payheroCheckoutRequestId = r.CheckoutRequestID || null; // == merchantRequestId
  const callbackReceipt = r.MpesaReceiptNumber ? String(r.MpesaReceiptNumber) : null;

  if (!externalReference && !payheroCheckoutRequestId) return ACCEPTED();

  const txn = await prisma.mpesaTransaction.findFirst({
    where: {
      status: { in: ["initiated", "pending"] },
      OR: [
        externalReference ? { checkoutRequestId: externalReference } : undefined,
        externalReference ? { accountReference: externalReference } : undefined,
        payheroCheckoutRequestId ? { merchantRequestId: payheroCheckoutRequestId } : undefined,
      ].filter(Boolean),
    },
  });
  if (!txn) return ACCEPTED();

  // Ask PayHero what really happened.
  const ref = txn.merchantRequestId || txn.checkoutRequestId;
  const verified = ref ? await stkQuery(ref).catch(() => ({ status: "pending" })) : { status: "pending" };
  console.log("[mpesa/callback]", { txnId: txn.id, verified: verified.status });

  if (verified.status === "success") {
    const receipt = verified.receipt || callbackReceipt;
    await prisma.mpesaTransaction.updateMany({
      where: { id: txn.id, status: { in: ["initiated", "pending"] } },
      data: {
        status: "confirmed",
        resultCode: "0",
        resultDesc: "Success",
        mpesaReceiptNumber: receipt,
        transactionCode: receipt,
        transactionDate: new Date(),
        confirmedAt: new Date(),
        responseData: body,
      },
    });
  } else if (verified.status === "failed") {
    await prisma.mpesaTransaction.updateMany({
      where: { id: txn.id, status: { in: ["initiated", "pending"] } },
      data: {
        status: "failed",
        resultCode: r.ResultCode != null ? String(r.ResultCode) : null,
        resultDesc: verified.detail || r.ResultDesc || "Payment failed",
        failedAt: new Date(),
        errorMessage: verified.detail || "Payment failed",
        responseData: body,
      },
    });
  }
  // Still pending at PayHero: leave it. The POS status poll will settle it.

  return ACCEPTED();
}
