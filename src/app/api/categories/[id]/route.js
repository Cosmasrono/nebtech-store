import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PUT(req, { params }) {
  const { error } = await requireAuth("manage_products");
  if (error) return error;
  const { id } = await params;
  const { name, description } = await req.json();
  const category = await prisma.category.update({ where: { id }, data: { name, description } });
  return Response.json({ data: category });
}

export async function DELETE(req, { params }) {
  const { error } = await requireAuth("manage_products");
  if (error) return error;
  const { id } = await params;
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) return Response.json({ message: "Cannot delete a category with products." }, { status: 422 });
  await prisma.category.delete({ where: { id } });
  return Response.json({ message: "Deleted." });
}
