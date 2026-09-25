// Debt helpers, shared by the POS, the Debts page and the API.
// Debts are stored in the Loan table; users only see the word "debt". No interest is charged.

export const LOAN_PERMS = ["manage_loans", "view_all_sales"];

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Fields to save for a new debt of `amount` (no interest: the customer owes exactly this). */
export function debtAmounts(amount) {
  const a = round2(amount);
  return { principal: a, interestRate: null, interestAmount: 0, totalAmount: a };
}

export function loanBalance(loan) {
  return Math.max(0, round2((loan.totalAmount || 0) - (loan.amountPaid || 0)));
}

/** paid | overdue | active | defaulted */
export function loanDisplayStatus(loan, now = new Date()) {
  if (loan.status === "paid" || loanBalance(loan) <= 0) return "paid";
  if (loan.status === "defaulted") return "defaulted";
  if (loan.dueDate && new Date(loan.dueDate) < now) return "overdue";
  return "active";
}

export const DEBT_STATUS_COLORS = {
  active: "bg-sky-100 text-sky-700",
  overdue: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  defaulted: "bg-rose-100 text-rose-700",
};

/** Readable one-line summary of the products on a debt. */
export function describeItems(items) {
  return (items || []).map((it) => `${it.quantity}× ${it.name}`).join(", ").slice(0, 190);
}
