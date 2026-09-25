"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPassword />
    </Suspense>
  );
}

function SetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [info, setInfo] = useState(null); // { name, email, purpose }
  const [invalid, setInvalid] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid("This link is missing its code. Open the link from your email again."); return; }
    fetch(`/api/auth/password/set?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) setInfo(d.data);
        else setInvalid(d.message || "This link is invalid or has expired.");
      })
      .catch(() => setInvalid("Couldn't check the link. Check your connection and reload the page."));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    const res = await fetch("/api/auth/password/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } else setError(d.message || "Couldn't save the password.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 via-slate-900 to-slate-800 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-teal-700">NebTech Store</div>
          <p className="text-sm text-slate-500 mt-1">
            {info?.purpose === "invite" ? "Set up your account" : "Choose a new password"}
          </p>
        </div>

        {invalid && (
          <div className="space-y-4">
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{invalid}</div>
            <Link href="/forgot-password" className="btn-primary w-full text-center block">Request a new link</Link>
          </div>
        )}

        {done && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
            Password saved. Taking you to sign in…
          </div>
        )}

        {info && !done && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Hi <b>{info.name}</b>. {info.purpose === "invite" ? "Set a password for" : "Set a new password for"} <b>{info.email}</b>.
            </p>
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">{error}</div>}
            <div>
              <label className="label" htmlFor="pw">New password</label>
              <input id="pw" type="password" className="input" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">At least 8 characters.</p>
            </div>
            <div>
              <label className="label" htmlFor="pw2">Confirm password</label>
              <input id="pw2" type="password" className="input" autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Saving…" : "Save password"}</button>
          </form>
        )}

        {!info && !invalid && <p className="text-sm text-slate-500 text-center">Checking your link…</p>}
      </div>
    </div>
  );
}
