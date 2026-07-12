import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// Poll transaction status from the POS while waiting for the callback
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const txn = await prisma.mpesaTransaction.findUnique({ where: { id } });
  if (!txn) return Response.json({ message: "Not found." }, { status: 404 });
  return Response.json({ data: { id: txn.id, status: txn.status, mpesaReceiptNumber: txn.mpesaReceiptNumber, resultDesc: txn.resultDesc } });
}
