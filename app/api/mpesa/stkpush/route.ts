// POST: send an STK push for a pharmacy cart. The amount is computed from the
// medicine catalog server-side — the client only says what and how many.
// GET: tells the POS whether PayHero credentials are configured.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mpesaConfigured, normalizePhone, stkPush } from "@/lib/server/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: mpesaConfigured() });
}

export async function POST(req: Request) {
  try {
    if (!mpesaConfigured()) {
      return NextResponse.json(
        { error: "M-Pesa is not configured on this server." },
        { status: 501 },
      );
    }

    const body = (await req.json()) as {
      phone?: string;
      accountReference?: string;
      items?: { medicineId: string; quantity: number }[];
    };

    const phone = normalizePhone(body.phone ?? "");
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid Safaricom number, e.g. 0712 345678." },
        { status: 400 },
      );
    }

    const items = (body.items ?? []).map((i) => ({
      medicineId: i.medicineId,
      quantity: Math.max(1, Math.round(i.quantity)),
    }));
    if (items.length === 0) {
      return NextResponse.json({ error: "The cart is empty." }, { status: 400 });
    }
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: items.map((i) => i.medicineId) } },
    });
    const byId = new Map(medicines.map((m) => [m.id, m]));
    let amount = 0;
    for (const item of items) {
      const med = byId.get(item.medicineId);
      if (!med) {
        return NextResponse.json(
          { error: "A carted medicine no longer exists." },
          { status: 400 },
        );
      }
      amount += item.quantity * med.unitPrice;
    }
    amount = Math.max(1, Math.round(amount));

    // A push the POS gave up on can still settle late. If this phone already
    // paid this amount recently and the money was never tied to a visit,
    // reuse that payment instead of charging the customer twice.
    const settled = await prisma.mpesaTransaction.findFirst({
      where: {
        phone,
        amount,
        status: "success",
        visitId: null,
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (settled) {
      return NextResponse.json({
        checkoutRequestId: settled.checkoutRequestId,
        amount,
        reused: true,
      });
    }

    const push = await stkPush({
      phone,
      amount,
      accountReference: body.accountReference ?? "CareFlow",
      description: "Pharmacy",
    });
    if (!push.ok || !push.checkoutRequestId) {
      return NextResponse.json(
        { error: push.error ?? "M-Pesa request failed." },
        { status: 502 },
      );
    }

    await prisma.mpesaTransaction.create({
      data: {
        checkoutRequestId: push.checkoutRequestId,
        phone,
        amount,
        status: "pending",
        resultDesc: [
          push.payheroReference
            ? `PayHero reference: ${push.payheroReference}`
            : null,
          push.payheroCheckoutRequestId
            ? `CheckoutRequestID: ${push.payheroCheckoutRequestId}`
            : null,
        ]
          .filter(Boolean)
          .join("; "),
      },
    });
    return NextResponse.json({
      checkoutRequestId: push.checkoutRequestId,
      amount,
    });
  } catch (err) {
    console.error("POST /api/mpesa/stkpush failed", err);
    return NextResponse.json(
      { error: "M-Pesa request failed." },
      { status: 500 },
    );
  }
}
