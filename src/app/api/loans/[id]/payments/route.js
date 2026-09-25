import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { LOAN_PERMS, loanBalance } from "@/lib/loans";
import { adjustCustomerCredit, applyLoanPayment, parseRepayment } from "@/lib/loans-server";

// POST — record a payment against one debt.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(LOAN_PERMS);
  if (error) return error;
  const { id } = await params;

  const p = parseRepayment(await req.json());
  if (p.error) return Response.json({ message: p.error }, { status: 422 });

  const loan = await prisma.loan.findUnique({ where: { id } });
  if (!loan) return Response.json({ message: "Debt not found." }, { status: 404 });
  const balance = loanBalance(loan);
  if (balance <= 0) return Response.json({ message: "This debt is already fully paid." }, { status: 422 });
  if (p.amount > balance + 0.009) {
    return Response.json({ message: `That's more than the balance of KSh ${balance.toLocaleString()}. Use "Record payment" on the customer to spread a payment across debts.` }, { status: 422 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const paid = await applyLoanPayment(tx, loan, p.amount, { ...p, userId: user.id });
      await adjustCustomerCredit(tx, loan.customerId, -paid);
    });
  } catch (e) {
    return Response.json({ message: e.message || "Payment failed." }, { status: 409 });
  }

  await audit({ userId: user.id, event: "loan_repayment", type: "Loan", auditableId: id, newValues: { amount: p.amount, method: p.paymentMethod }, req });
  const updated = await prisma.loan.findUnique({ where: { id } });
  return Response.json({ data: updated });
}
