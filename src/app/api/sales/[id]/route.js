import prisma from "@/lib/prisma";
import { requireAuth, userCan } from "@/lib/auth";

export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      cashier: { select: { id: true, name: true } },
      customer: true,
      branch: true,
      mpesaPayments: true,
      tradeIns: true,
    },
  });
  if (!sale) return Response.json({ message: "Not found." }, { status: 404 });
  if (!userCan(user, "view_all_sales") && sale.cashierId !== user.id) {
    return Response.json({ message: "Forbidden." }, { status: 403 });
  }
  return Response.json({ data: sale });
}
