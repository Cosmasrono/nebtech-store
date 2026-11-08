import { clearOfflineData, getQueuedSales, syncQueuedSales } from "@/lib/offline";
import { resetScreenLock } from "@/lib/screen-lock";

/** Signs the user out of this device. Returns false if they cancelled or are offline. */
export async function signOut() {
  // Offline sales are uploaded under whoever is signed in, so flush them first.
  await syncQueuedSales().catch(() => {});
  const left = await getQueuedSales().catch(() => []);
  if (left.length && !confirm(
    `${left.length} offline sale(s) on this device have not been uploaded. Signing out will delete them. Sign out anyway?`
  )) return false;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    alert("You're offline. Reconnect to sign out.");
    return false;
  }
  await clearOfflineData().catch(() => {});
  navigator.serviceWorker?.controller?.postMessage("clear-caches");
  resetScreenLock();
  return true;
}
