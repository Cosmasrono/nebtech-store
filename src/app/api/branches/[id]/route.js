import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const branch = await prisma.branch.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, sales: true, branchStocks: true, productBatches: true },
      },
    },
  });
  if (!branch) return Response.json({ message: "Not found." }, { status: 404 });
  if (branch.isMain)
    return Response.json({ message: "The main branch cannot be deleted." }, { status: 422 });

  const c = branch._count;
  if (c.users || c.sales || c.branchStocks || c.productBatches) {
    const parts = [];
    if (c.users) parts.push(`${c.users} user(s)`);
    if (c.sales) parts.push(`${c.sales} sale(s)`);
    if (c.branchStocks) parts.push(`${c.branchStocks} stock record(s)`);
    if (c.productBatches) parts.push(`${c.productBatches} batch(es)`);
    return Response.json(
      { message: `Cannot delete — branch still has ${parts.join(", ")}. Disable it instead.` },
      { status: 409 },
    );
  }

  await prisma.branch.delete({ where: { id } });
  return Response.json({ ok: true });
}

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const b = await req.json();

  let code;
  if (b.code !== undefined) {
    code = normalizeCode(b.code);
    if (!code) return Response.json({ message: "Branch code must contain letters or numbers." }, { status: 422 });
  }

  if (b.isMain) {
    await prisma.branch.updateMany({ where: { isMain: true, NOT: { id } }, data: { isMain: false } });
  }

  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(b.name && { name: b.name.trim() }),
        ...(code !== undefined && { code }),
        ...(b.address !== undefined && { address: b.address }),
        ...(b.phone !== undefined && { phone: b.phone }),
        ...(b.isMain !== undefined && { isMain: Boolean(b.isMain) }),
      },
    });
    return Response.json({ data: branch });
  } catch (e) {
    if (e.code === "P2002") {
      const field = e.meta?.target?.includes("name") ? "name" : "code";
      return Response.json({ message: `A branch with this ${field} already exists.` }, { status: 409 });
    }
    throw e;
  }
}
