import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, userHasRole, isAdminEmail } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ToastProvider from "@/components/ToastProvider";
import TopProgress from "@/components/TopProgress";
import OfflineSync from "@/components/OfflineSync";

export default async function AppLayout({ children }) {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");
  const isAdmin = isAdminEmail(authUser.email) || userHasRole(authUser, "owner", "super_admin");
  const session = {
    name: authUser.name,
    email: authUser.email,
    isAdmin,
    permissions: isAdmin
      ? ["*"]
      : [...new Set(authUser.roles.flatMap((r) => (r.permissions || []).map((p) => p.name)))],
  };

  return (
    <ToastProvider>
    <Suspense fallback={null}><TopProgress /></Suspense>
    <div className="min-h-screen">
      <Sidebar user={session} />
      <main className="pl-60 min-h-screen flex flex-col">
        <OfflineSync />
        <div className="p-6 max-w-7xl mx-auto w-full flex-1">{children}</div>
        <footer className="px-6 pb-6">
          <div className="max-w-7xl mx-auto text-center text-sm text-slate-500">
            Powered by{" "}
            <a href="https://nebtech.online" target="_blank" rel="noopener noreferrer" className="font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2">
              nebtech.online
            </a>
          </div>
        </footer>
      </main>
    </div>
    </ToastProvider>
  );
}
