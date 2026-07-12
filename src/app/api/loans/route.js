import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateLoanNumber } from "@/lib/numbers";

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
  if (!b.customerId || !b.totalAmount || !b.productDescription || !b.dueDate) {
    return Response.json({ message: "customerId, productDescription, totalAmount and dueDate are required." }, { status: 422 });
  }
  const loan = await prisma.loan.create({
    data: {
      customerId: b.customerId,
      userId: user.id,
      loanNumber: generateLoanNumber(),
      productDescription: b.productDescription,
      totalAmount: Number(b.totalAmount),
      interestRate: b.interestRate != null ? Number(b.interestRate) : null,
      loanDate: b.loanDate ? new Date(b.loanDate) : new Date(),
      dueDate: new Date(b.dueDate),
      notes: b.notes || null,
    },
  });
  return Response.json({ data: loan }, { status: 201 });
}
