import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ message: "Unauthenticated." }, { status: 401 });
  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      branchId: user.branchId,
      branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
      roles: user.roles.map((r) => r.name),
      permissions: [...new Set(user.roles.flatMap((r) => r.permissions.map((p) => p.name)))],
    },
  });
}
