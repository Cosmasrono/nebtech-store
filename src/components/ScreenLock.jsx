"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/sign-out";
import {
  CHANGE_PIN_EVENT, IDLE_MS, LOCKED_KEY, PIN_PATTERN, canCheckPinOffline, checkPinOffline, forgetOfflinePin,
  idleFor, isMarkedLocked, markLocked, markUnlocked, recordActivity, rememberPinForOffline, resetScreenLock,
} from "@/lib/screen-lock";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
const CHECK_EVERY_MS = 5_000;
const WRITE_ACTIVITY_EVERY_MS = 5_000;

const goToLogin = () => { resetScreenLock(); window.location.assign("/login"); };

export default function ScreenLock({ user, children }) {
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(null); // null = not known yet (or offline)
  const [changing, setChanging] = useState(false);
  const pausedRef = useRef(false); // no lock timing while the lock or PIN form is showing
  const needsSetup = hasPin === false;
  pausedRef.current = locked || needsSetup || changing;

  useEffect(() => {
    fetch("/api/auth/pin", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setHasPin(d.data.hasPin); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Nobody can unlock without a PIN, so set one first.
    if (hasPin === false) { markUnlocked(); setLocked(false); }
  }, [hasPin]);

  const lockIfIdle = useCallback(() => {
    if (pausedRef.current || idleFor() < IDLE_MS) return;
    if (!navigator.onLine && !canCheckPinOffline(user.id)) { recordActivity(); return; }
    markLocked();
    setLocked(true);
  }, [user.id]);

  useEffect(() => {
    if (isMarkedLocked()) setLocked(true);
    else if (idleFor() >= IDLE_MS) lockIfIdle();
    else recordActivity();

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (pausedRef.current || now - lastWrite < WRITE_ACTIVITY_EVERY_MS) return;
      // After the computer sleeps, the first touch must not count as activity.
      if (idleFor(now) >= IDLE_MS) return lockIfIdle();
      lastWrite = now;
      recordActivity(now);
    };
    const onStorage = (e) => { if (e.key === LOCKED_KEY) setLocked(e.newValue === "1"); };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { capture: true, passive: true }));
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", lockIfIdle);
    document.addEventListener("visibilitychange", lockIfIdle);
    const timer = setInterval(lockIfIdle, CHECK_EVERY_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", lockIfIdle);
      document.removeEventListener("visibilitychange", lockIfIdle);
      clearInterval(timer);
    };
  }, [lockIfIdle]);

  useEffect(() => {
    const open = () => setChanging(true);
    window.addEventListener(CHANGE_PIN_EVENT, open);
    return () => window.removeEventListener(CHANGE_PIN_EVENT, open);
  }, []);

  function unlock() {
    markUnlocked();
    recordActivity();
    setLocked(false);
  }

  function pinSaved() {
    setHasPin(true);
    setChanging(false);
    recordActivity();
  }

  const showSetup = needsSetup || changing;
  return (
    <>
      {/* Hidden from clicks and the keyboard, but kept mounted so a cart in progress isn't lost. */}
      <div inert={locked || showSetup}>{children}</div>
      {locked && !needsSetup && <LockScreen user={user} onUnlock={unlock} />}
      {showSetup && !locked && <PinForm user={user} required={needsSetup} onSaved={pinSaved} onCancel={() => setChanging(false)} />}
    </>
  );
}

function Backdrop({ children }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900 p-4 overflow-y-auto">
      <div className="card w-full max-w-sm p-6">{children}</div>
    </div>
  );
}

function LockScreen({ user, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function verifyOffline(value) {
    const result = await checkPinOffline(user.id, value);
    if (result === "ok") return onUnlock();
    if (result === "wrong") return setError("Wrong PIN. Try again.");
    if (result === "blocked") return setError("Too many wrong PINs. Reconnect to the internet to unlock.");
    setError("Reconnect to the internet to unlock.");
  }

  async function submit(value) {
    setBusy(true);
    setError("");
    try {
      let res;
      try {
        res = await fetch("/api/auth/pin/verify", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: value }),
        });
      } catch {
        return await verifyOffline(value);
      }
      if (res.status === 401) return goToLogin();
      if (res.ok) {
        await rememberPinForOffline(user.id, value);
        return onUnlock();
      }
      const body = await res.json().catch(() => ({}));
      setError(body.message || "Couldn't check your PIN. Try again.");
    } finally {
      setBusy(false);
      setPin("");
      inputRef.current?.focus();
    }
  }

  function onChange(e) {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(value);
    if (PIN_PATTERN.test(value)) submit(value);
  }

  async function forgot() {
    if (await signOut()) goToLogin();
  }

  return (
    <Backdrop>
      <div className="text-center space-y-4">
        <div>
          <h2 className="text-lg font-bold">Screen locked</h2>
          <p className="text-sm text-slate-500 mt-1">{user.name}, enter your 4-digit PIN to continue.</p>
        </div>
        <input ref={inputRef} autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength={4} aria-label="4-digit PIN"
          className="input text-center text-2xl tracking-[0.5em]" value={pin} disabled={busy} onChange={onChange} />
        {error && <div role="alert" className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <button type="button" className="text-sm text-slate-500 hover:underline" onClick={forgot}>Forgot PIN? Sign out</button>
      </div>
    </Backdrop>
  );
}

function PinForm({ user, required, onSaved, onCancel }) {
  const [form, setForm] = useState({ password: "", pin: "", confirm: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const setDigits = (key) => (e) => setForm({ ...form, [key]: e.target.value.replace(/\D/g, "").slice(0, 4) });

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!PIN_PATTERN.test(form.pin)) return setError("Your PIN must be exactly 4 digits.");
    if (form.pin !== form.confirm) return setError("The two PINs don't match.");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.password, pin: form.pin }),
      });
      if (res.status === 401) return goToLogin();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.message || "Couldn't save your PIN.");
      forgetOfflinePin(user.id);
      await rememberPinForOffline(user.id, form.pin);
      onSaved();
    } catch {
      setError("You need to be online to set a PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Backdrop>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">{required ? "Set your PIN" : "Change your PIN"}</h2>
          <p className="text-sm text-slate-500 mt-1">The screen locks after 10 minutes without activity. You'll use this 4-digit PIN to unlock it.</p>
        </div>
        {error && <div role="alert" className="text-sm rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</div>}
        <div><label className="label" htmlFor="pin-password">Account password</label>
          <input id="pin-password" type="password" className="input" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div><label className="label" htmlFor="pin-new">New PIN</label>
          <input id="pin-new" type="password" inputMode="numeric" autoComplete="off" maxLength={4} className="input" required value={form.pin} onChange={setDigits("pin")} /></div>
        <div><label className="label" htmlFor="pin-confirm">Confirm PIN</label>
          <input id="pin-confirm" type="password" inputMode="numeric" autoComplete="off" maxLength={4} className="input" required value={form.confirm} onChange={setDigits("confirm")} /></div>
        <div className="flex gap-2">
          {!required && <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>}
          <button className="btn-primary flex-1" disabled={saving}>{saving ? "Saving…" : "Save PIN"}</button>
        </div>
      </form>
    </Backdrop>
  );
}
