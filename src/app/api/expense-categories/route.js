import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const cats = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  return Response.json({ data: cats });
}

export async function POST(req) {
  const { error } = await requireAuth("record_expense");
  if (error) return error;
  const { name, description } = await req.json();
  if (!name) return Response.json({ message: "Name is required." }, { status: 422 });
  const cat = await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name, description: description || null } });
  return Response.json({ data: cat }, { status: 201 });
}
