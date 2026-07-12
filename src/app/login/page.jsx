"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 via-slate-900 to-slate-800 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-teal-700">NebTech Store</div>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>
        {error && <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account? <Link href="/register" className="text-teal-700 font-medium hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
