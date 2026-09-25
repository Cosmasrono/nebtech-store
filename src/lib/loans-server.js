// Server-side debt operations (stored in the Loan table; run inside a Prisma transaction).
import { loanBalance, round2 } from "./loans";

export const PAYMENT_METHODS = ["cash", "mpesa", "bank", "card"];

/**
 * Records `amount` against one loan. Guards against two people paying the same loan
 * at the same moment (optimistic check on amountPaid).
 */
export async function applyLoanPayment(tx, loan, amount, { userId, paymentMethod, referenceNumber, notes, paymentDate }) {
  const balance = loanBalance(loan);
  const pay = round2(Math.min(amount, balance));
  if (pay <= 0) return 0;

  const newPaid = round2((loan.amountPaid || 0) + pay);
  const res = await tx.loan.updateMany({
    where: { id: loan.id, amountPaid: loan.amountPaid },
    data: { amountPaid: newPaid, status: newPaid >= loan.totalAmount - 0.009 ? "paid" : loan.status === "defaulted" ? "defaulted" : "active" },
  });
  if (res.count !== 1) throw new Error("This debt was updated by someone else just now. Reload and try again.");

  await tx.loanPayment.create({
    data: {
      loanId: loan.id,
      amount: pay,
      paymentMethod,
      paymentDate: paymentDate || new Date(),
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      userId,
    },
  });
  return pay;
}

/** Keeps Customer.currentCreditBalance (used for credit limits) in step, never below zero. */
export async function adjustCustomerCredit(tx, customerId, delta) {
  if (!customerId || !delta) return;
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { currentCreditBalance: true } });
  if (!c) return;
  await tx.customer.update({
    where: { id: customerId },
    data: { currentCreditBalance: Math.max(0, round2((c.currentCreditBalance || 0) + delta)) },
  });
}

/** Validates the common repayment fields from a request body. */
export function parseRepayment(b) {
  const amount = round2(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a payment amount greater than zero." };
  const paymentMethod = PAYMENT_METHODS.includes(b.paymentMethod) ? b.paymentMethod : "cash";
  const paymentDate = b.paymentDate ? new Date(b.paymentDate) : new Date();
  if (Number.isNaN(paymentDate.getTime()) || paymentDate > new Date(Date.now() + 86400000)) {
    return { error: "Enter a valid payment date (not in the future)." };
  }
  return {
    amount,
    paymentMethod,
    paymentDate,
    referenceNumber: b.referenceNumber ? String(b.referenceNumber).slice(0, 60) : null,
    notes: b.notes ? String(b.notes).slice(0, 300) : null,
  };
}
