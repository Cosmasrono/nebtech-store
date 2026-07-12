import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar user={session} />
      <main className="pl-60">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
