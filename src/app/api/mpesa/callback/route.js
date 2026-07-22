import prisma from "@/lib/prisma";

// PayHero callback. Shape: { response: { ExternalReference, CheckoutRequestID,
// ResultCode, Status, MpesaReceiptNumber, ResultDesc }, status?: boolean }.
// This endpoint is optional — the status endpoint also polls PayHero directly.
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const r = body?.response || {};
  const externalReference = r.ExternalReference || null;              // == our checkoutRequestId
  const payheroCheckoutRequestId = r.CheckoutRequestID || null;       // Safaricom-side id; == merchantRequestId
  const mpesaReceipt = r.MpesaReceiptNumber || null;
  const resultDesc = r.ResultDesc || r.Status || null;
  const isSuccess =
    body?.status === true ||
    Number(r.ResultCode) === 0 ||
    String(r.Status || "").toLowerCase() === "success";

  console.log("[mpesa/callback] PayHero:", { externalReference, payheroCheckoutRequestId, isSuccess, mpesaReceipt });

  if (!externalReference && !payheroCheckoutRequestId) {
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

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
  if (!txn) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

  if (isSuccess) {
    await prisma.mpesaTransaction.update({
      where: { id: txn.id },
      data: {
        status: "confirmed",
        resultCode: "0",
        resultDesc: resultDesc || "Success",
        mpesaReceiptNumber: mpesaReceipt ? String(mpesaReceipt) : null,
        transactionCode: mpesaReceipt ? String(mpesaReceipt) : null,
        transactionDate: new Date(),
        confirmedAt: new Date(),
        responseData: body,
      },
    });
  } else {
    await prisma.mpesaTransaction.update({
      where: { id: txn.id },
      data: {
        status: "failed",
        resultCode: r.ResultCode != null ? String(r.ResultCode) : null,
        resultDesc: resultDesc || "Payment failed",
        failedAt: new Date(),
        errorMessage: resultDesc || "Payment failed",
        responseData: body,
      },
    });
  }

  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
