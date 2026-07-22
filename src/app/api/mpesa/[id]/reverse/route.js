import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req, { params }) {
  const { user, error } = await requireAuth("view_financial_reports");
  if (error) return error;
  const { id } = await params;

  const txn = await prisma.mpesaTransaction.findUnique({ where: { id } });
  if (!txn) return Response.json({ message: "Transaction not found." }, { status: 404 });
  if (txn.status !== "confirmed") {
    return Response.json({ message: `Only confirmed payments can be reversed (this one is "${txn.status}").` }, { status: 422 });
  }

  const updated = await prisma.mpesaTransaction.update({
    where: { id },
    data: { status: "reversed", errorMessage: `Reversal recorded by ${user.name}` },
  });
  await audit({ userId: user.id, event: "mpesa_reversed", type: "MpesaTransaction", auditableId: id, oldValues: { status: txn.status }, newValues: { status: "reversed" }, req });
  return Response.json({ data: updated, message: "Payment marked as reversed. Reconciliation will now show the variance." });
}
