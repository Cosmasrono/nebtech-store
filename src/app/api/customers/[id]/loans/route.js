import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { LOAN_PERMS, loanBalance, loanDisplayStatus, round2 } from "@/lib/loans";
import { adjustCustomerCredit, applyLoanPayment, parseRepayment } from "@/lib/loans-server";

// GET — every debt for one customer, newest first, with repayments and the products taken.
export async function GET(req, { params }) {
  const { error } = await requireAuth(LOAN_PERMS);
  if (error) return error;
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true, email: true, creditLimit: true, canBuyOnCredit: true },
  });
  if (!customer) return Response.json({ message: "Customer not found." }, { status: 404 });

  const loans = await prisma.loan.findMany({
    where: { customerId: id },
    include: {
      payments: { orderBy: { paymentDate: "desc" }, include: { user: { select: { name: true } } } },
      user: { select: { name: true } },
      sale: { select: { id: true, receiptNumber: true } },
    },
    orderBy: { loanDate: "desc" },
  });

  const now = new Date();
  const data = loans.map((l) => ({
    ...l,
    balance: loanBalance(l),
    displayStatus: loanDisplayStatus(l, now),
  }));

  return Response.json({
    data: {
      customer,
      loans: data,
      totals: {
        borrowed: round2(data.reduce((s, l) => s + l.totalAmount, 0)),
        paid: round2(data.reduce((s, l) => s + (l.amountPaid || 0), 0)),
        balance: round2(data.reduce((s, l) => s + l.balance, 0)),
      },
    },
  });
}

// POST — one payment from the customer, applied to their unpaid debts soonest-due first.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(LOAN_PERMS);
  if (error) return error;
  const { id } = await params;

  const p = parseRepayment(await req.json());
  if (p.error) return Response.json({ message: p.error }, { status: 422 });

  const open = (await prisma.loan.findMany({ where: { customerId: id, status: { not: "paid" } }, orderBy: { dueDate: "asc" } }))
    .filter((l) => loanBalance(l) > 0);
  const owed = round2(open.reduce((s, l) => s + loanBalance(l), 0));
  if (!open.length) return Response.json({ message: "This customer has no unpaid debts." }, { status: 422 });
  if (p.amount > owed + 0.009) {
    return Response.json({ message: `That's more than the total owed (KSh ${owed.toLocaleString()}).` }, { status: 422 });
  }

  const applied = [];
  try {
    await prisma.$transaction(async (tx) => {
      let remaining = p.amount;
      for (const loan of open) {
        if (remaining <= 0.009) break;
        const paid = await applyLoanPayment(tx, loan, remaining, { ...p, userId: user.id });
        remaining = round2(remaining - paid);
        applied.push({ loanNumber: loan.loanNumber, amount: paid });
      }
      await adjustCustomerCredit(tx, id, -p.amount);
    });
  } catch (e) {
    return Response.json({ message: e.message || "Payment failed." }, { status: 409 });
  }

  await audit({ userId: user.id, event: "loan_repayment", type: "Customer", auditableId: id, newValues: { amount: p.amount, method: p.paymentMethod, applied }, req });
  return Response.json({ data: { applied } });
}
