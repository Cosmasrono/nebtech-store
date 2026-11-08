import prisma from "@/lib/prisma";
import { requireAuth, userHasRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Audit logs are visible to managers; owner-only secrets must not end up there.
const shown = (key, value) => (/key|secret|password|token/i.test(key) ? "(hidden)" : value);

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
  const before = await prisma.setting.findMany({ where: { key: { in: Object.keys(updates) } } });
  for (const [key, value] of Object.entries(updates)) {
    await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
  await audit({
    userId: user.id, event: "settings_updated", type: "Setting", req,
    oldValues: Object.fromEntries(before.map((s) => [s.key, shown(s.key, s.value)])),
    newValues: Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, shown(k, String(v))])),
  });
  return Response.json({ message: "Settings saved." });
}
