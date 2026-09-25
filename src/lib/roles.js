import prisma from "./prisma";
import { isTopAdmin, isTopRole } from "./auth";

/** Resolves the single role an admin picked and checks they're allowed to give it. */
export async function resolveAssignableRole(me, roleId) {
  if (!roleId) return { error: "Choose a role for this user." };
  const role = await prisma.role.findUnique({ where: { id: String(roleId) } });
  if (!role) return { error: "That role no longer exists." };
  if (isTopRole(role) && !isTopAdmin(me)) {
    return { error: `Only an owner or super admin can give the ${role.displayName || role.name} role.` };
  }
  return { role };
}

/** Non-owners with manage_users must not edit or deactivate owners / super admins. */
export function canManageUser(me, target) {
  if (isTopAdmin(me)) return true;
  return !(target.roles || []).some(isTopRole);
}
