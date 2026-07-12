import { destroySession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req) {
  const session = await getSession();
  if (session) await audit({ userId: session.userId, event: "logout", req });
  await destroySession();
  return Response.json({ message: "Logged out." });
}
