"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setLoading(false);
    setMsg({ ok: Boolean(res?.ok), text: d?.message || "Couldn't reach the server. Check your connection." });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 via-slate-900 to-slate-800 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-teal-700">NebTech Store</div>
          <p className="text-sm text-slate-500 mt-1">Reset your password</p>
        </div>
        {msg && (
          <div className={`mb-4 rounded-lg text-sm px-3 py-2 border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Your account email</label>
            <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>{loading ? "Sending…" : "Email me a reset link"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/login" className="text-teal-700 font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
