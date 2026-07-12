import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { stkPush, normalizePhone } from "@/lib/mpesa";

export async function POST(req) {
  const { user, error } = await requireAuth("process_sales");
  if (error) return error;
  const { phone, amount, saleId, accountReference } = await req.json();
  if (!phone || !amount) return Response.json({ message: "phone and amount are required." }, { status: 422 });

  try {
    const res = await stkPush({ phone, amount, accountReference: accountReference || "NebTechStore" });

    const txn = await prisma.mpesaTransaction.create({
      data: {
        merchantRequestId: res.MerchantRequestID || null,
        checkoutRequestId: res.CheckoutRequestID || null,
        phoneNumber: normalizePhone(phone),
        amount: Number(amount),
        accountReference: accountReference || null,
        transactionDesc: "POS Payment",
        status: res.ResponseCode === "0" ? "initiated" : "failed",
        resultCode: res.ResponseCode ?? null,
        resultDesc: res.ResponseDescription || res.errorMessage || null,
        saleId: saleId || null,
        userId: user.id,
        responseData: res,
        ...(res.ResponseCode !== "0" && { failedAt: new Date(), errorMessage: res.errorMessage || res.ResponseDescription }),
      },
    });

    if (res.ResponseCode !== "0") {
      return Response.json({ message: res.errorMessage || "STK push failed.", data: txn }, { status: 422 });
    }
    return Response.json({ message: "STK push sent. Ask the customer to enter their M-Pesa PIN.", data: txn });
  } catch (e) {
    return Response.json({ message: e.message }, { status: 500 });
  }
}
