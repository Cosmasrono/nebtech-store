// Browser side of the inactivity lock: shared timing across tabs, and a PIN check for when the
// shop's internet is down so a cashier is never stranded. The server remains the real check online.

export const IDLE_MS = 10 * 60_000;
export const PIN_PATTERN = /^\d{4}$/;
export const CHANGE_PIN_EVENT = "nebtech:change-pin";
export const LOCKED_KEY = "nebtech_screen_locked";

const LAST_ACTIVITY_KEY = "nebtech_last_activity";
const OFFLINE_MAX_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 150_000;
const offlineKey = (userId) => `nebtech_pin_check:${userId}`;

// Storage can throw in private windows; the lock still works for the open tab without it.
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const remove = (key) => { try { localStorage.removeItem(key); } catch {} };

export const isMarkedLocked = () => read(LOCKED_KEY) === "1";
export const markLocked = () => write(LOCKED_KEY, "1");
export const markUnlocked = () => remove(LOCKED_KEY);
export const recordActivity = (now = Date.now()) => write(LAST_ACTIVITY_KEY, String(now));

/** Milliseconds since anyone touched the app in any tab. 0 if nothing is recorded yet. */
export function idleFor(now = Date.now()) {
  const last = Number(read(LAST_ACTIVITY_KEY));
  return last > 0 ? now - last : 0;
}

/** Called at sign-in, so yesterday's last activity doesn't lock a fresh session. */
export function resetScreenLock() {
  remove(LOCKED_KEY);
  remove(LAST_ACTIVITY_KEY);
}

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return toBase64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256));
}

function readOfflineCheck(userId) {
  try {
    return JSON.parse(read(offlineKey(userId)));
  } catch {
    return null;
  }
}

export const canCheckPinOffline = (userId) => Boolean(readOfflineCheck(userId));
export const forgetOfflinePin = (userId) => remove(offlineKey(userId));

/** Saves a salted hash after the server has accepted this PIN. */
export async function rememberPinForOffline(userId, pin) {
  if (!globalThis.crypto?.subtle) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(offlineKey(userId), JSON.stringify({ salt: toBase64(salt), hash: await derive(pin, salt), failed: 0 }));
}

/** Returns "ok", "wrong", "blocked" (too many tries) or "unavailable". */
export async function checkPinOffline(userId, pin) {
  const saved = readOfflineCheck(userId);
  if (!saved || !globalThis.crypto?.subtle) return "unavailable";
  if (saved.failed >= OFFLINE_MAX_ATTEMPTS) return "blocked";
  const matches = (await derive(pin, fromBase64(saved.salt))) === saved.hash;
  const failed = matches ? 0 : saved.failed + 1;
  write(offlineKey(userId), JSON.stringify({ ...saved, failed }));
  if (matches) return "ok";
  return failed >= OFFLINE_MAX_ATTEMPTS ? "blocked" : "wrong";
}
