import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { normalizePhone } from "@/lib/mpesa";

export async function GET(req) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const customers = await prisma.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {},
    orderBy: { name: "asc" },
    // Dropdowns in the POS and Loans pages list customers, so return enough of them.
    take: q ? 50 : 2000,
    select: {
      id: true, name: true, phone: true, email: true, customerType: true,
      canBuyOnCredit: true, creditLimit: true, currentCreditBalance: true,
    },
  });
  return Response.json({ data: customers });
}

export async function POST(req) {
  const { error } = await requireAuth("process_sales");
  if (error) return error;
  const b = await req.json();
  if (!b.name) return Response.json({ message: "Name is required." }, { status: 422 });
  // Phone is unique; in MongoDB that allows only one customer without a phone, so require it.
  const phone = b.phone ? normalizePhone(b.phone) : "";
  if (!/^254[17]\d{8}$/.test(phone)) {
    return Response.json({ message: "Enter the customer's phone number (07XX XXX XXX)." }, { status: 422 });
  }
  try {
    const customer = await prisma.customer.create({
      data: {
        name: b.name,
        phone,
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
