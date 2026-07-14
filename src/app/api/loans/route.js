import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateLoanNumber } from "@/lib/numbers";
import { normalizePhone } from "@/lib/mpesa";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const loans = await prisma.loan.findMany({
    include: { customer: true, payments: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json({ data: loans });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const b = await req.json();

  let customerId = String(b.customerId || "").trim();
  const customerName = String(b.customerName || "").trim();
  const customerPhone = String(b.customerPhone || "").trim();
  const productDescription = String(b.productDescription || "").trim();
  const totalAmount = Number(b.totalAmount);
  const dueDate = new Date(b.dueDate);

  if ((!customerId && !customerName) || !productDescription || !Number.isFinite(totalAmount) || totalAmount <= 0 || Number.isNaN(dueDate.getTime())) {
    return Response.json({ message: "A customer (existing or new), productDescription, totalAmount and dueDate are required." }, { status: 422 });
  }

  if (!customerId) {
    const phone = customerPhone ? normalizePhone(customerPhone) : null;
    const customer = phone
      ? await prisma.customer.upsert({ where: { phone }, update: {}, create: { name: customerName, phone } })
      : await prisma.customer.create({ data: { name: customerName } });
    customerId = customer.id;
  }

  const loan = await prisma.loan.create({
    data: {
      customerId,
      userId: user.id,
      loanNumber: generateLoanNumber(),
      productDescription,
      totalAmount,
      interestRate: b.interestRate != null ? Number(b.interestRate) : null,
      loanDate: b.loanDate ? new Date(b.loanDate) : new Date(),
      dueDate,
      notes: b.notes || null,
    },
  });
  return Response.json({ data: loan }, { status: 201 });
}
