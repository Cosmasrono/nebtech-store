import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const customers = await prisma.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {},
    orderBy: { name: "asc" },
    take: 50,
  });
  return Response.json({ data: customers });
}

export async function POST(req) {
  const { error } = await requireAuth("process_sales");
  if (error) return error;
  const b = await req.json();
  if (!b.name) return Response.json({ message: "Name is required." }, { status: 422 });
  try {
    const customer = await prisma.customer.create({
      data: {
        name: b.name,
        phone: b.phone || null,
        email: b.email || null,
        address: b.address || null,
        customerType: b.customerType || "walk_in",
      },
    });
    return Response.json({ data: customer }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") return Response.json({ message: "A customer with that phone already exists." }, { status: 422 });
    throw e;
  }
}
