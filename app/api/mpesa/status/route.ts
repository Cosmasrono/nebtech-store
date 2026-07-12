// GET /api/mpesa/status?id=<CheckoutRequestID>
// The POS polls this while the customer types their PIN. Settled first by the
// PayHero callback (if it reached us), otherwise by querying PayHero directly.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stkQuery } from "@/lib/server/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An STK prompt only lives on the customer's phone for a minute or two. If
// PayHero still reports pending after this, settle the row as failed so the
// POS can stop polling. A late callback can still flip it back to success.
const PENDING_TTL_MS = 2 * 60_000;

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const tx = await prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId: id },
    });
    if (!tx) {
      return NextResponse.json({ error: "Unknown transaction" }, { status: 404 });
    }

    // Already settled (by the callback or an earlier poll).
    if (tx.status !== "pending") {
      return NextResponse.json({
        status: tx.status,
        receipt: tx.receipt ?? undefined,
        detail: tx.resultDesc ?? undefined,
      });
    }

    const result = await stkQuery(tx.resultDesc || id);
    if (result.status === "pending") {
      if (Date.now() - tx.createdAt.getTime() < PENDING_TTL_MS) {
        return NextResponse.json({ status: "pending" });
      }
      const expired = await prisma.mpesaTransaction.update({
        where: { checkoutRequestId: id },
        data: {
          status: "failed",
          resultDesc: "Timed out waiting for M-Pesa confirmation.",
        },
      });
      return NextResponse.json({
        status: "failed",
        detail: expired.resultDesc ?? undefined,
      });
    }
    const updated = await prisma.mpesaTransaction.update({
      where: { checkoutRequestId: id },
      data: {
        status: result.status,
        receipt: result.status === "success" ? result.receipt : undefined,
        resultDesc: result.status === "failed" ? result.detail : "Success",
      },
    });
    return NextResponse.json({
      status: updated.status,
      receipt: updated.receipt ?? undefined,
      detail: updated.resultDesc ?? undefined,
    });
  } catch (err) {
    console.error("GET /api/mpesa/status failed", err);
    // Treat transient errors as still-pending so the POS keeps polling.
    return NextResponse.json({ status: "pending" });
  }
}
