import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { stkPush, normalizePhone, isValidPhone, mpesaConfigured } from "@/lib/mpesa";

export async function POST(req) {
  const { user, error } = await requireAuth("process_sales");
  if (error) return error;

  if (!mpesaConfigured()) {
    return Response.json({ message: "M-Pesa (PayHero) is not configured on the server." }, { status: 501 });
  }

  const { phone, amount, saleId, accountReference } = await req.json();
  if (!phone || !amount) return Response.json({ message: "phone and amount are required." }, { status: 422 });
  if (!isValidPhone(phone)) return Response.json({ message: "Enter a valid Kenyan Safaricom phone number." }, { status: 422 });

  try {
    const res = await stkPush({
      phone,
      amount,
      accountReference,   // optional caller-supplied; helper falls back to a unique POS-… id
      description: "POS Payment",
    });

    if (!res.ok) {
      // Persist the failure so it shows up in the M-Pesa transactions list
      const txn = await prisma.mpesaTransaction.create({
        data: {
          checkoutRequestId: res.externalReference || null,
          phoneNumber: normalizePhone(phone),
          amount: Number(amount),
          accountReference: res.externalReference || accountReference || null,
          transactionDesc: "POS Payment",
          status: "failed",
          resultDesc: res.error || "PayHero rejected the request.",
          saleId: saleId || null,
          userId: user.id,
          responseData: res.raw ?? null,
          failedAt: new Date(),
          errorMessage: res.error || null,
        },
      });
      return Response.json({ message: res.error || "STK push failed.", data: txn }, { status: 422 });
    }

    const txn = await prisma.mpesaTransaction.create({
      data: {
        // Correlation key we control (echoed back as ExternalReference in the callback)
        checkoutRequestId: res.externalReference,
        // PayHero's own IDs — used to query PayHero for status
        merchantRequestId: res.payheroReference || res.payheroCheckoutRequestId || null,
        phoneNumber: normalizePhone(phone),
        amount: Number(amount),
        accountReference: res.externalReference,
        transactionDesc: "POS Payment",
        status: "initiated",
        saleId: saleId || null,
        userId: user.id,
        responseData: res.raw ?? null,
      },
    });

    return Response.json({
      message: "STK push sent. Ask the customer to enter their M-Pesa PIN.",
      data: txn,
    });
  } catch (e) {
    console.error("[mpesa/stk-push]", e);
    return Response.json({ message: e?.message || "STK push failed unexpectedly." }, { status: 500 });
  }
}
