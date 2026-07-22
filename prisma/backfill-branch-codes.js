// One-shot: prepare Branch rows for the new unique constraints.
//   1. Rename duplicate names (keep oldest, suffix newer ones with "-2", "-3", …)
//   2. Fill missing / duplicate codes with a unique uppercase code.
// Uses raw Mongo commands so it works even after the schema was updated to
// require `code` (Prisma's typed client would reject rows where code is null).
// Safe to re-run. Run before `prisma db push` (or after, to fix stragglers).
//   node prisma/backfill-branch-codes.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(name) {
  return (name || "BR")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "BR";
}

async function findAll() {
  const res = await prisma.$runCommandRaw({
    find: "Branch",
    filter: {},
    sort: { createdAt: 1 },
    batchSize: 1000,
  });
  return res?.cursor?.firstBatch || [];
}

async function updateOne(id, set) {
  await prisma.$runCommandRaw({
    update: "Branch",
    updates: [{ q: { _id: id }, u: { $set: set } }],
  });
}

async function main() {
  const branches = await findAll();
  console.log(`Found ${branches.length} branch(es).`);

  // ── 1. Deduplicate names ────────────────────────────────────────────────
  const nameSeen = new Map();
  let renamed = 0;
  for (const b of branches) {
    const key = String(b.name || "").trim().toLowerCase();
    const n = (nameSeen.get(key) || 0) + 1;
    nameSeen.set(key, n);
    if (n > 1) {
      const newName = `${b.name} -${n}`;
      await updateOne(b._id, { name: newName });
      console.log(`  RENAME  "${b.name}" -> "${newName}"`);
      b.name = newName;
      renamed++;
    }
  }

  // ── 2. Backfill / dedupe codes ─────────────────────────────────────────
  const codeSeen = new Set();
  let updated = 0;
  for (const b of branches) {
    const currentCode = b.code && String(b.code).trim() ? String(b.code).toUpperCase() : null;
    let base = currentCode ? slugify(currentCode) : (b.isMain ? "MAIN" : slugify(b.name));
    let code = currentCode || base;
    let n = 1;
    while (codeSeen.has(code)) code = `${base}${String(n++).padStart(2, "0")}`;
    codeSeen.add(code);
    if (code !== b.code) {
      await updateOne(b._id, { code });
      console.log(`  CODE    "${b.name}" -> ${code}`);
      updated++;
    }
  }

  console.log(`\nDone. Renamed ${renamed} branch(es), assigned ${updated} code(s).`);
  console.log(`Next: pnpm prisma db push  (safe to re-run; will now succeed)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
