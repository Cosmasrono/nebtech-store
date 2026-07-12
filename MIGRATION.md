# NebTech Store — Laravel → Next.js Migration Guide

Full port of the Laravel POS to **Next.js 15 (App Router, JSX)** with **MongoDB + Prisma**.

## Quick start

```bash
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, M-Pesa keys
npm install
npx prisma generate
npx prisma db push          # creates collections + indexes
node prisma/seed.js         # roles, permissions, owner user, main branch, settings
npm run dev
```

Default owner login: `owner@nebtech.store` / `password` — change it immediately.

> **MongoDB requirement:** Prisma `$transaction` on MongoDB needs a **replica set**. MongoDB Atlas works out of the box. For local dev run `mongod --replSet rs0` and `rs.initiate()` once.

## Stack mapping

| Laravel | Next.js equivalent |
|---|---|
| Eloquent models + migrations | `prisma/schema.prisma` (MongoDB, ObjectId ids) |
| Controllers + `routes/web.php` | Route Handlers under `src/app/api/**/route.js` |
| Blade views | React client pages under `src/app/(app)/**` |
| `auth` middleware + sessions | `middleware.js` + JWT (`jose`) in `nebtech_session` httpOnly cookie (12 h) |
| spatie-style roles/permissions | `Role`/`Permission` collections + `requireAuth("permission")` guard in `src/lib/auth.js` |
| `SalesService::createSale` | `POST /api/sales` — same logic inside a Prisma `$transaction` |
| `ProductBatch::deductFefo` | `deductFefo()` in `src/lib/inventory.js` |
| `MpesaService` | `src/lib/mpesa.js` (Daraja OAuth + STK push) |
| Seeders | `prisma/seed.js` |
| Audit trait | `audit()` helper in `src/lib/audit.js` |

## What's ported

- **Auth & RBAC** — login/register/logout, 4 roles, 25 permissions, per-route guards, edge middleware.
- **Products & inventory** — CRUD, categories, per-branch stock (`ProductBranchStock`), batches with expiry, FEFO deduction, expired-stock sale blocking, stock movements, add-stock, low-stock alerts.
- **POS & sales** — product grid + barcode/SKU search, cart, promo codes, cash/M-Pesa/card payment, change calculation, receipts (printable), sale listing with date filters, trade-ins (creates `TI-` products), shift open/close with cash reconciliation and discrepancy.
- **M-Pesa** — STK push (`/api/mpesa/stk-push`), public callback (`/api/mpesa/callback`), status polling from the POS payment modal.
- **Purchasing** — suppliers CRUD, purchase orders with line items, partial/full receiving into main branch with batch + expiry, status recompute.
- **Finance** — expenses with approval workflow (pending → approved/rejected), expense categories, invoices with line items + payments + balance/status tracking, loans with repayments.
- **Multi-branch** — branches CRUD (single-main enforcement), enable/disable, branch-to-branch stock transfers (transactional).
- **Promotions** — percentage/fixed codes with min-spend and date windows, validated at POS.
- **Reporting** — daily sales, top products, COGS, P&L (revenue − COGS + other income − expenses).
- **Admin** — users with role assignment, audit log viewer (owner/super_admin/manager), owner-only system control (system_active / subscription_active / business name / tax rate).

## Not ported (intentionally, for a later phase)

- **AI inventory dashboards** (`AIInventoryController`, ~15 routes) — the `InventoryPrediction` / `PredictionLog` models exist in the schema, so wiring an Anthropic-powered route in later is straightforward.
- **Delivery orders** — model exists in schema; no API/UI yet.
- **Returns processing** — models exist (`Return`, `ReturnItem`); no API/UI yet.
- **Server-side cart persistence** (`CartItem`) — the POS cart is client-state; the model exists if you want cross-device carts.
- **Offline PWA sync** — the Laravel app didn't have it either; your WingPOS IndexedDB approach can be layered on.

## Conventions worth knowing

- **Money is `Float`** — the Prisma MongoDB connector has no `Decimal`. All money math already happened in floats in the PHP app too; if you want exactness later, switch to integer cents.
- **API responses**: success → `{ data }`, errors → `{ message }` with proper status codes. `/api/auth/me` returns `{ user }`.
- **Document numbers**: `RCP-YYYYMMDD-XXXX`, `PO-…`, `INV-…`, `LN-…` from `src/lib/numbers.js`.
- **Route protection**: every handler starts with `const { user, error } = await requireAuth("permission_name")`. Only `/api/mpesa/callback`, `/login`, `/register` and their APIs are public.

## Environment variables

```
DATABASE_URL=mongodb+srv://…/nebtech_store?retryWrites=true&w=majority
JWT_SECRET=<long random string>
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=…
MPESA_CONSUMER_SECRET=…
MPESA_PASSKEY=…
MPESA_SHORT_CODE=174379
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback
```
