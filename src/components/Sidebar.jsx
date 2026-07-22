"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { section: "Operations", items: [
    { href: "/dashboard", label: "Dashboard", icon: "▦" },
    { href: "/pos", label: "Point of Sale", icon: "🛒", perm: "process_sales" },
    { href: "/sales", label: "Sales", icon: "🧾", perm: ["view_own_sales", "view_all_sales"] },
    { href: "/invoices", label: "Invoices", icon: "📄", perm: "view_all_sales" },
    { href: "/loans", label: "Loans", icon: "🤝", perm: "view_all_sales" },
  ]},
  { section: "Inventory", items: [
    { href: "/products", label: "Products", icon: "📦", perm: "manage_products" },
    { href: "/categories", label: "Categories", icon: "🏷️", perm: "manage_products" },
    { href: "/stock-transfers", label: "Stock Transfers", icon: "🔁", perm: "adjust_stock" },
    { href: "/suppliers", label: "Suppliers", icon: "🚚", perm: "manage_suppliers" },
    { href: "/purchase-orders", label: "Purchase Orders", icon: "📋", perm: "create_purchase_order" },
    { href: "/ai-insights", label: "AI Insights", icon: "✨", perm: "view_inventory_reports" },
  ]},
  { section: "Finance", items: [
    { href: "/expenses", label: "Expenses", icon: "💸", perm: "record_expense" },
    { href: "/promotions", label: "Promotions", icon: "🎯", perm: "give_discounts" },
    { href: "/reports", label: "Reports", icon: "📈", perm: "view_financial_reports" },
    { href: "/reconciliation", label: "Reconciliation", icon: "⚖️", perm: "view_financial_reports" },
    { href: "/mpesa-payments", label: "M-Pesa Payments", icon: "📱", perm: "view_financial_reports" },
  ]},
  { section: "Administration", items: [
    { href: "/users", label: "Users", icon: "👥", perm: "manage_users" },
    { href: "/branches", label: "Branches", icon: "🏬", admin: true },
    { href: "/audit-logs", label: "Audit Logs", icon: "🕵️", admin: true },
    { href: "/system", label: "System Control", icon: "⚙️", perm: "change_settings" },
  ]},
];

export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  const canSee = (item) => {
    if (user?.isAdmin) return true;
    if (item.admin) return false;
    if (!item.perm) return true;
    const perms = user?.permissions || [];
    return [].concat(item.perm).some((p) => perms.includes(p));
  };
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-slate-900 text-slate-300 flex flex-col z-30">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="text-lg font-bold text-white">NebTech <span className="text-amber-400">Store</span></div>
        <div className="text-xs text-slate-500 truncate">{user?.name}</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {nav.map((group) => (
          <div key={group.section} className="mb-3">
            <div className="px-5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{group.section}</div>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-5 py-2 text-sm transition ${
                    active ? "bg-teal-800/60 text-white border-r-2 border-amber-400" : "hover:bg-slate-800 hover:text-white"
                  }`}>
                  <span className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <button onClick={logout} className="m-4 btn-secondary !bg-slate-800 !border-slate-700 !text-slate-300 hover:!bg-slate-700">
        Sign out
      </button>
    </aside>
  );
}
