import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { stkQuery } from "@/lib/mpesa";

// Auto-fail transactions that have been sitting in `initiated` for this long
// without a callback or a PayHero SUCCESS/FAILED verdict.
const PENDING_TTL_MS = 2 * 60_000;

export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const txn = await prisma.mpesaTransaction.findUnique({ where: { id } });
  if (!txn) return Response.json({ message: "Not found." }, { status: 404 });

  // Already settled by the callback or an earlier poll — just return DB state.
  if (txn.status !== "initiated" && txn.status !== "pending") {
    return Response.json({
      data: {
        id: txn.id,
        status: txn.status,
        mpesaReceiptNumber: txn.mpesaReceiptNumber,
        resultDesc: txn.resultDesc,
      },
    });
  }

  // Actively ask PayHero for the outcome (works even without a public callback)
  const payheroRef = txn.merchantRequestId || txn.checkoutRequestId;
  const result = payheroRef ? await stkQuery(payheroRef) : { status: "pending" };

  // Still pending? Enforce TTL to avoid stale "initiated" rows forever.
  if (result.status === "pending") {
    const age = Date.now() - new Date(txn.createdAt).getTime();
    if (age < PENDING_TTL_MS) {
      return Response.json({
        data: { id: txn.id, status: txn.status, mpesaReceiptNumber: null, resultDesc: null },
      });
    }
    const expired = await prisma.mpesaTransaction.update({
      where: { id },
      data: {
        status: "failed",
        resultDesc: "Timed out waiting for M-Pesa confirmation.",
        failedAt: new Date(),
        errorMessage: "Timeout waiting for PayHero SUCCESS/FAILED.",
      },
    });
    return Response.json({
      data: { id: expired.id, status: expired.status, mpesaReceiptNumber: null, resultDesc: expired.resultDesc },
    });
  }

  // PayHero told us SUCCESS or FAILED — persist and return.
  if (result.status === "success") {
    const updated = await prisma.mpesaTransaction.update({
      where: { id },
      data: {
        status: "confirmed",
        mpesaReceiptNumber: result.receipt || null,
        transactionCode: result.receipt || null,
        transactionDate: new Date(),
        confirmedAt: new Date(),
        resultCode: "0",
        resultDesc: "Payment confirmed",
      },
    });
    return Response.json({
      data: {
        id: updated.id,
        status: updated.status,
        mpesaReceiptNumber: updated.mpesaReceiptNumber,
        resultDesc: updated.resultDesc,
      },
    });
  }

  const failed = await prisma.mpesaTransaction.update({
    where: { id },
    data: {
      status: "failed",
      resultDesc: result.detail || "Payment failed.",
      failedAt: new Date(),
      errorMessage: result.detail || "Payment failed.",
    },
  });
  return Response.json({
    data: { id: failed.id, status: failed.status, mpesaReceiptNumber: null, resultDesc: failed.resultDesc },
  });
}
