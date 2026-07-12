"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { homeForRole, type Role } from "@/lib/auth/roles";
import { notify } from "@/lib/toast";

type Mode = "loading" | "login" | "setup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("loading");

  // On first ever run (no accounts yet), show the admin setup form instead.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/bootstrap");
        const { needsSetup } = await res.json();
        if (alive) setMode(needsSetup ? "setup" : "login");
      } catch {
        if (alive) setMode("login");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      {/* Background photo with a teal wash so the card stays legible. */}
      <Image
        src="/images/team.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-teal-950/85 via-teal-950/70 to-teal-900/60" />
      <div className="relative w-full max-w-sm rounded-3xl border border-white/20 bg-white/95 p-8 shadow-2xl shadow-teal-950/40 backdrop-blur">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-lg text-white shadow-inner shadow-white/20">
            ✚
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight text-teal-950">
              CareFlow
            </p>
            <p className="text-xs text-zinc-500">Clinic Management</p>
          </div>
        </div>

        {mode === "loading" && (
          <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
        )}
        {mode === "setup" && <SetupForm />}
        {mode === "login" && <LoginForm />}

        <p className="mt-6 text-center text-xs text-zinc-400">
          Staff access only · CareFlow Clinic &amp; Diagnostics
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const message = body.error ?? "Login failed";
        setError(message);
        notify("error", message);
        setBusy(false);
        return;
      }
      notify("success", "Signed in successfully.");
      const { user } = (await res.json()) as { user: { role: Role } };
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") || homeForRole(user.role);
    } catch {
      setError("Network error");
      notify("error", "Network error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-semibold text-teal-950">
        Sign in
      </h1>
      <p className="mb-5 text-sm text-zinc-500">
        Enter the username and password your administrator gave you.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Username">
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </>
  );
}

function SetupForm() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const message = body.error ?? "Setup failed";
        setError(message);
        notify("error", message);
        setBusy(false);
        return;
      }
      notify("success", "Admin account created.");
      window.location.href = "/"; // admin lands on the dashboard
    } catch {
      setError("Network error");
      notify("error", "Network error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="mb-1 font-display text-xl font-semibold text-teal-950">
        Welcome — create your admin
      </h1>
      <p className="mb-5 text-sm text-zinc-500">
        This is the first time the system is opened. Create the administrator
        account. You&apos;ll use it to add the rest of your staff.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Your full name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Choose a username">
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. admin"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Choose a password">
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create admin & continue"}
        </Button>
      </form>
    </>
  );
}
