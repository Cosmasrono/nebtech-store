"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const FEATURES = [
  { title: "Point of Sale", desc: "Fast checkout, cart & receipts" },
  { title: "Products & Inventory", desc: "Categories, stock transfers, purchase orders" },
  { title: "Sales & Invoices", desc: "Track every sale and generate invoices" },
  { title: "M-Pesa Payments", desc: "Accept and reconcile mobile money" },
  { title: "Suppliers & Expenses", desc: "Manage suppliers, expenses and loans" },
  { title: "Multi-Branch", desc: "Run several branches from one place" },
  { title: "Reports & AI Insights", desc: "Dashboards, analytics and AI summaries" },
  { title: "Users & Audit Logs", desc: "Roles, permissions and activity trail" },
];

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "Login failed.");
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: background image + POS summary */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-10 text-white bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(13,148,136,0.80), rgba(15,23,42,0.90)), url('https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1600&q=80')",
        }}
      >
        <div>
          <div className="text-3xl font-bold tracking-tight">NebTech Store</div>
          <p className="mt-2 text-teal-100/90 max-w-md">
            An all-in-one POS to run your retail business — sell, track stock,
            get paid and see what’s working.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-xl">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 p-4"
            >
              <div className="font-semibold text-white">{f.title}</div>
              <div className="text-xs text-teal-50/80 mt-1">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-teal-100/70">
          © {new Date().getFullYear()} NebTech Store
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex items-center justify-center p-6 bg-gradient-to-br from-teal-900 via-slate-900 to-slate-800 lg:bg-slate-50 lg:bg-none">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 text-center">
            <div className="text-2xl font-bold text-teal-700">NebTech Store</div>
            <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
          </div>
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            No account?{" "}
            <Link href="/register" className="text-teal-700 font-medium hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
