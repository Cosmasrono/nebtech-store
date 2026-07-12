import prisma from "@/lib/prisma";

// Safaricom Daraja callback — public endpoint
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const cb = body?.Body?.stkCallback;
  if (!cb) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const txn = await prisma.mpesaTransaction.findFirst({
    where: { checkoutRequestId: cb.CheckoutRequestID },
  });
  if (!txn) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

  if (cb.ResultCode === 0) {
    const meta = Object.fromEntries((cb.CallbackMetadata?.Item || []).map((i) => [i.Name, i.Value]));
    await prisma.mpesaTransaction.update({
      where: { id: txn.id },
      data: {
        status: "confirmed",
        resultCode: String(cb.ResultCode),
        resultDesc: cb.ResultDesc,
        mpesaReceiptNumber: meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null,
        transactionCode: meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null,
        transactionDate: meta.TransactionDate ? parseMpesaDate(String(meta.TransactionDate)) : new Date(),
        confirmedAt: new Date(),
        responseData: body,
      },
    });
  } else {
    await prisma.mpesaTransaction.update({
      where: { id: txn.id },
      data: {
        status: "failed",
        resultCode: String(cb.ResultCode),
        resultDesc: cb.ResultDesc,
        failedAt: new Date(),
        errorMessage: cb.ResultDesc,
        responseData: body,
      },
    });
  }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

function parseMpesaDate(s) {
  // 20260711143025 → Date
  const [Y, M, D, h, m, sec] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8, 10), s.slice(10, 12), s.slice(12, 14)];
  return new Date(`${Y}-${M}-${D}T${h}:${m}:${sec}+03:00`);
}
