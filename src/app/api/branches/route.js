import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

async function generateCode(base) {
  const slug = normalizeCode(base) || "BR";
  let code = slug;
  let n = 1;
  while (await prisma.branch.findUnique({ where: { code } })) {
    code = `${slug}${String(n++).padStart(2, "0")}`;
  }
  return code;
}

async function ensureMainBranch() {
  const main = await prisma.branch.findFirst({ where: { isMain: true } });
  if (main) return;
  try {
    await prisma.branch.create({
      data: {
        name: "Main Branch",
        code: "MAIN",
        isMain: true,
        isActive: true,
        stockDistributionPercentage: 100,
      },
    });
  } catch (e) {
    // Ignore race / already-exists (P2002); next GET will see it.
    if (e.code !== "P2002") throw e;
  }
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  await ensureMainBranch();
  const branches = await prisma.branch.findMany({
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  return Response.json({ data: branches });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner", "super_admin"))
    return Response.json({ message: "Forbidden." }, { status: 403 });

  const b = await req.json();
  if (!b.name?.trim()) return Response.json({ message: "Name is required." }, { status: 422 });

  const code = b.code ? normalizeCode(b.code) : await generateCode(b.isMain ? "MAIN" : b.name);
  if (!code) return Response.json({ message: "Branch code must contain letters or numbers." }, { status: 422 });

  if (b.isMain) {
    await prisma.branch.updateMany({ where: { isMain: true }, data: { isMain: false } });
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        name: b.name.trim(),
        code,
        address: b.address || b.location || null,
        phone: b.phone || null,
        isMain: Boolean(b.isMain),
        ownerId: user.id,
      },
    });
    return Response.json({ data: branch }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      const field = e.meta?.target?.includes("name") ? "name" : "code";
      return Response.json({ message: `A branch with this ${field} already exists.` }, { status: 409 });
    }
    throw e;
  }
}
