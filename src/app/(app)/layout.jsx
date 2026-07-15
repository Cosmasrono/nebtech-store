import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar user={session} />
      <main className="pl-60 min-h-screen flex flex-col">
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
  );
}
