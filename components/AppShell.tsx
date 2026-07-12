"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";
import { useSession } from "./SessionProvider";
import { navForRole, ROLE_LABELS } from "@/lib/auth/roles";

const PAGE_BG: { prefix: string; img: string }[] = [
  { prefix: "/dashboard", img: "/images/ward.jpg" },
  { prefix: "/reception", img: "/images/consultation.jpg" },
  { prefix: "/doctor", img: "/images/hero-doctor.jpg" },
  { prefix: "/services", img: "/images/lab.jpg" },
  { prefix: "/pharmacy", img: "/images/medication.jpg" },
  { prefix: "/patients", img: "/images/ward.jpg" },
  { prefix: "/admin", img: "/images/team.jpg" },
];

function backgroundFor(pathname: string): string | undefined {
  return PAGE_BG.find((b) => pathname.startsWith(b.prefix))?.img;
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-inner shadow-white/20",
        size === "md" ? "h-9 w-9 text-lg" : "h-8 w-8 text-base",
      )}
    >
      ✚
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();

  if (pathname === "/" || pathname === "/login" || !session) {
    return <>{children}</>;
  }

  const nav = navForRole(session.role);
  const bg = backgroundFor(pathname);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen bg-[#f3f8f7] text-zinc-900">
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-teal-950 to-teal-900 p-4 text-teal-50 sm:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <BrandMark />
          <div>
            <p className="font-display text-base font-semibold leading-tight text-white">
              CareFlow
            </p>
            <p className="text-xs text-teal-300/80">Clinic Management</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white shadow-inner shadow-white/5 ring-1 ring-inset ring-white/10"
                    : "text-teal-200/75 hover:bg-white/5 hover:text-white",
                )}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <UserBox
          name={session.name}
          roleLabel={ROLE_LABELS[session.role]}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between bg-teal-950 px-4 py-3 text-white sm:hidden">
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span className="font-display font-semibold">CareFlow</span>
          </div>
          <button
            onClick={logout}
            className="text-sm font-medium text-teal-300 hover:text-white"
          >
            Sign out
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto bg-teal-950 px-2 pb-2 sm:hidden">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-white/15 text-white ring-1 ring-inset ring-white/10"
                    : "text-teal-200/75 hover:bg-white/5 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="relative flex-1">
          {bg && (
            <>
              <div
                aria-hidden
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${bg})` }}
              />
              <div className="absolute inset-0 bg-[#f3f8f7]/[0.93] backdrop-blur-[2px]" />
            </>
          )}
          <div className="relative mx-auto w-full max-w-5xl p-4 sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function UserBox({
  name,
  roleLabel,
  onLogout,
}: {
  name: string;
  roleLabel: string;
  onLogout: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
      <p className="px-1 text-sm font-medium text-white">{name}</p>
      <p className="px-1 text-xs text-teal-300/80">{roleLabel}</p>
      <button
        onClick={onLogout}
        className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-teal-200/75 transition-colors hover:bg-white/5 hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
