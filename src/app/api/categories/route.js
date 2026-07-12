import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return Response.json({ data: categories });
}

export async function POST(req) {
  const { error } = await requireAuth("manage_products");
  if (error) return error;
  const { name, description } = await req.json();
  if (!name) return Response.json({ message: "Name is required." }, { status: 422 });
  try {
    const category = await prisma.category.create({ data: { name, description: description || null } });
    return Response.json({ data: category }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") return Response.json({ message: "Category already exists." }, { status: 422 });
    throw e;
  }
}
