import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const settings = await prisma.setting.findMany();
  return Response.json({ data: Object.fromEntries(settings.map((s) => [s.key, s.value])) });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!userHasRole(user, "owner")) return Response.json({ message: "Forbidden." }, { status: 403 });
  const updates = await req.json(); // { key: value }
  for (const [key, value] of Object.entries(updates)) {
    await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
  return Response.json({ message: "Settings saved." });
}
