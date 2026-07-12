// Roles, the per-role navigation, and access rules. Pure data — safe to import
// on the client (no crypto / no server-only APIs).

export type Role =
  | "admin"
  | "receptionist"
  | "nurse"
  | "doctor"
  | "lab"
  | "radiology"
  | "pharmacist";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export const ROLES: Role[] = [
  "admin",
  "receptionist",
  "nurse",
  "doctor",
  "lab",
  "radiology",
  "pharmacist",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  receptionist: "Receptionist",
  nurse: "Nurse (Triage)",
  doctor: "Doctor",
  lab: "Lab technician",
  radiology: "Radiology technician",
  pharmacist: "Pharmacist",
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
}

// A station is visible to its role(s) and to admins. Reception/triage staff
// see only their own station (it has its own patient-status overview).
export const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "▦",
    // Admin-only: it shows a live overview of every station, so exposing it
    // to station staff would leak the other stations' work.
    roles: ["admin"],
  },
  {
    href: "/reception",
    label: "Reception & Triage",
    icon: "➕",
    roles: ["receptionist", "nurse", "admin"],
  },
  { href: "/doctor", label: "Doctor", icon: "🩺", roles: ["doctor", "admin"] },
  {
    href: "/services",
    label: "Lab / Radiology / Procedures",
    icon: "🔬",
    roles: ["lab", "radiology", "admin"],
  },
  {
    href: "/pharmacy",
    label: "Pharmacy",
    icon: "💊",
    roles: ["pharmacist", "admin"],
  },
  {
    // The live board: every staff member sees all patients' statuses and
    // times from reception to completion, long-stayers highlighted.
    href: "/flow",
    label: "Patient flow",
    icon: "⏱️",
    roles: ROLES,
  },
  {
    href: "/patients",
    label: "Patients",
    icon: "👥",
    roles: ["doctor", "admin"],
  },
  {
    // Every staff member files leave / short-excuse requests here; admins
    // also see the approval queue on the same page.
    href: "/activity",
    label: "Activity",
    icon: "🗓️",
    roles: ROLES,
  },
  {
    href: "/admin/medicines",
    label: "Medicines",
    icon: "📦",
    roles: ["pharmacist", "admin"],
  },
  { href: "/admin/users", label: "Users", icon: "⚙️", roles: ["admin"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}

const HOME: Record<Role, string> = {
  admin: "/dashboard",
  receptionist: "/reception",
  nurse: "/reception",
  doctor: "/doctor",
  lab: "/services",
  radiology: "/services",
  pharmacist: "/pharmacy",
};

export function homeForRole(role: Role): string {
  return HOME[role] ?? "/";
}

/** Can this role open this page path? Admins can open anything. */
export function canAccess(role: Role, pathname: string): boolean {
  if (role === "admin") return true;
  const item = NAV.find(
    (n) =>
      pathname === n.href ||
      (n.href !== "/" && pathname.startsWith(n.href + "/")),
  );
  if (!item) return false; // unknown protected path → deny
  return item.roles.includes(role);
}
