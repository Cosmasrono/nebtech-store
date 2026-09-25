# Using the POS offline

1. Run the production app (`npm run build`, then `npm start`) on HTTPS or localhost. Development mode supports the local sales queue, but does not install the service worker needed to reload offline.
2. Sign in and open Point of Sale while connected. Wait for **Ready for offline sales** in the top bar before disconnecting.
3. Search the saved catalog, filter categories, and take cash payments offline. Card sales can be recorded after confirming payment on a separate card terminal; the POS does not authorize cards offline.
4. Keep the app open when reconnecting. Pending sales upload automatically, and the catalog refreshes after the queue is cleared. If the session expires, sign in again using the same cashier account.

M-Pesa, credit approval, promotions, and opening/closing shifts need a connection. Open a shift before disconnecting if you use shift reconciliation. Existing cached stock is only an estimate of availability on other devices; the server checks inventory when sales upload. Rejected sales remain visible under **need attention** for reconciliation.

Sales are stored in this browser on this device. They survive normal page reloads. Do not clear browser storage or sign out with pending sales. Normal offline reloads use the cached POS; a hard reload that bypasses the service worker cannot load without the network.

## Verification

Run `node tests/offline-browser.cjs` on Windows with Edge installed (or set `EDGE_PATH` to a Chromium executable). The test uses an isolated browser profile and a local fixture server. It checks real IndexedDB transactions, stock rollback, duplicate queue IDs, category filtering, upload retries, expired-session handling, service-worker caching, and offline reload persistence. It does not submit sales to the configured business database.
