import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateLoanNumber } from "@/lib/numbers";
import { normalizePhone } from "@/lib/mpesa";
import { LOAN_PERMS, debtAmounts, loanBalance, loanDisplayStatus, round2 } from "@/lib/loans";
import { adjustCustomerCredit } from "@/lib/loans-server";

// GET — one row per customer with their debt totals (open a customer to see each debt).
export async function GET(req) {
  const { error } = await requireAuth(LOAN_PERMS);
  if (error) return error;

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  let where = {};
  if (q) {
    const matches = await prisma.customer.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] },
      select: { id: true },
      take: 200,
    });
    where = { customerId: { in: matches.map((c) => c.id) } };
  }

  const loans = await prisma.loan.findMany({
    where,
    select: { customerId: true, totalAmount: true, amountPaid: true, status: true, dueDate: true, loanDate: true },
  });

  const now = new Date();
  const byCustomer = new Map();
  for (const l of loans) {
    const row = byCustomer.get(l.customerId) || {
      customerId: l.customerId, loanCount: 0, openCount: 0, overdueCount: 0,
      totalBorrowed: 0, totalPaid: 0, balance: 0, overdueBalance: 0, nextDueDate: null, lastLoanDate: null,
    };
    const status = loanDisplayStatus(l, now);
    const bal = loanBalance(l);
    row.loanCount += 1;
    row.totalBorrowed += l.totalAmount || 0;
    row.totalPaid += l.amountPaid || 0;
    row.balance += bal;
    if (bal > 0 && status !== "defaulted") {
      row.openCount += 1;
      if (!row.nextDueDate || l.dueDate < row.nextDueDate) row.nextDueDate = l.dueDate;
    }
    if (status === "overdue") { row.overdueCount += 1; row.overdueBalance += bal; }
    if (!row.lastLoanDate || l.loanDate > row.lastLoanDate) row.lastLoanDate = l.loanDate;
    byCustomer.set(l.customerId, row);
  }

  const customers = await prisma.customer.findMany({
    where: { id: { in: [...byCustomer.keys()] } },
    select: { id: true, name: true, phone: true, creditLimit: true },
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const rows = [...byCustomer.values()]
    .map((r) => ({
      ...r,
      totalBorrowed: round2(r.totalBorrowed),
      totalPaid: round2(r.totalPaid),
      balance: round2(r.balance),
      overdueBalance: round2(r.overdueBalance),
      status: r.overdueCount ? "overdue" : r.balance > 0 ? "active" : "paid",
      customer: customerById.get(r.customerId) || { id: r.customerId, name: "Deleted customer" },
    }))
    .sort((a, b) => b.balance - a.balance || new Date(b.lastLoanDate) - new Date(a.lastLoanDate));

  const summary = {
    outstanding: round2(rows.reduce((s, r) => s + r.balance, 0)),
    overdue: round2(rows.reduce((s, r) => s + r.overdueBalance, 0)),
    customersOwing: rows.filter((r) => r.balance > 0).length,
  };
  return Response.json({ data: rows, summary });
}

// POST — record a debt by hand (debts for products sold at the POS are created by the sale itself).
export async function POST(req) {
  const { user, error } = await requireAuth(LOAN_PERMS);
  if (error) return error;
  const b = await req.json();

  let customerId = String(b.customerId || "").trim();
  const customerName = String(b.customerName || "").trim();
  const customerPhone = String(b.customerPhone || "").trim();
  const productDescription = String(b.productDescription || "").trim().slice(0, 190);
  const principal = Number(b.principal ?? b.totalAmount);
  const loanDate = b.loanDate ? new Date(b.loanDate) : new Date();
  const dueDate = new Date(b.dueDate);

  if ((!customerId && !customerName) || !productDescription || !Number.isFinite(principal) || principal <= 0 || Number.isNaN(dueDate.getTime())) {
    return Response.json({ message: "Choose a customer, and enter what the debt is for, the amount and the due date." }, { status: 422 });
  }
  if (Number.isNaN(loanDate.getTime()) || dueDate < new Date(loanDate.toDateString())) {
    return Response.json({ message: "The due date can't be before the loan date." }, { status: 422 });
  }

  if (!customerId) {
    const phone = customerPhone ? normalizePhone(customerPhone) : "";
    if (!/^254[17]\d{8}$/.test(phone)) {
      return Response.json({ message: "Enter the new customer's phone number (07XX XXX XXX)." }, { status: 422 });
    }
    const customer = await prisma.customer.upsert({ where: { phone }, update: {}, create: { name: customerName, phone, customerType: "registered" } });
    customerId = customer.id;
  } else if (!(await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
    return Response.json({ message: "Customer not found." }, { status: 422 });
  }

  const totals = debtAmounts(principal);
  const loan = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        customerId,
        userId: user.id,
        loanNumber: generateLoanNumber(),
        productDescription,
        ...totals,
        loanDate,
        dueDate,
        notes: b.notes ? String(b.notes).slice(0, 500) : null,
      },
    });
    await adjustCustomerCredit(tx, customerId, totals.totalAmount);
    return loan;
  });

  await audit({ userId: user.id, event: "created", type: "Loan", auditableId: loan.id, newValues: { loanNumber: loan.loanNumber, ...totals }, req });
  return Response.json({ data: loan }, { status: 201 });
}
