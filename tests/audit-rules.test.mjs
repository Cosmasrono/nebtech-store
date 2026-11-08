// Run with: node --test tests/audit-rules.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { assessEvent, nairobiHour } from "../src/lib/audit-rules.js";
import { parseAiReview } from "../src/lib/audit-ai.js";

const noon = new Date("2026-11-08T09:00:00Z"); // 12:00 Nairobi
const night = new Date("2026-11-08T21:30:00Z"); // 00:30 Nairobi
const product = { name: "Panadol", sellingPrice: 100, costPrice: 60, quantityInStock: 40 };
const edit = (newValues, extra = {}) => ({ event: "updated", type: "Product", oldValues: product, newValues, at: noon, ...extra });
const codes = (r) => r.flags.map((f) => f.code);

test("a normal price change is not flagged", () => {
  assert.equal(assessEvent(edit({ sellingPrice: 110 })), null);
});

test("resaving a product with identical values is not flagged", () => {
  assert.equal(assessEvent(edit({ sellingPrice: 100, costPrice: 60, quantityInStock: 40 })), null);
});

test("price cuts are graded by size", () => {
  assert.equal(assessEvent(edit({ sellingPrice: 65 })).severity, "medium");
  const big = assessEvent(edit({ sellingPrice: 45 }));
  assert.equal(big.severity, "high");
  assert.ok(codes(big).includes("price_below_cost"));
});

test("price below cost is high even for a small cut", () => {
  const r = assessEvent({ ...edit({ sellingPrice: 95 }), oldValues: { ...product, costPrice: 98 } });
  assert.deepEqual(codes(r), ["price_below_cost"]);
  assert.equal(r.severity, "high");
});

test("price changed and put back within the window is high", () => {
  const history = [{ oldValues: { sellingPrice: 110 }, newValues: { sellingPrice: 100 } }];
  const r = assessEvent(edit({ sellingPrice: 110 }), { priceHistory: history });
  assert.deepEqual(codes(r), ["price_flip"]);
  assert.equal(r.severity, "high");
});

test("hand stock edits are flagged and large removals are high", () => {
  assert.equal(assessEvent(edit({ quantityInStock: 45 })).severity, "medium");
  assert.equal(assessEvent(edit({ quantityInStock: 10 })).severity, "high");
});

test("discounts are graded and repeats are caught", () => {
  const sale = (discount, totalAmount) => ({ event: "created", type: "Sale", newValues: { receiptNumber: "R1", discount, totalAmount }, at: noon });
  assert.equal(assessEvent(sale(5, 95)), null);
  assert.equal(assessEvent(sale(30, 70)).severity, "medium");
  assert.equal(assessEvent(sale(60, 40)).severity, "high");
  assert.deepEqual(codes(assessEvent(sale(5, 95), { recentDiscountCount: 4 })), ["repeat_discounts"]);
  assert.equal(assessEvent({ event: "created", type: "Sale", newValues: { totalAmount: 100 }, at: noon }), null);
});

test("shift cash differences", () => {
  const shift = (difference) => ({ event: "shift_closed", type: "Shift", newValues: { difference, expected: 5000, counted: 5000 + difference }, at: noon });
  assert.equal(assessEvent(shift(-50)), null);
  assert.equal(assessEvent(shift(-200)).severity, "medium");
  assert.equal(assessEvent(shift(-1500)).severity, "high");
  assert.equal(assessEvent(shift(1500)).severity, "medium");
});

test("failed logins alert at the thresholds only", () => {
  const fail = { event: "failed_login", newValues: { email: "a@b.c" }, at: noon };
  assert.equal(assessEvent(fail, { recentFailedLogins: 3 }), null);
  assert.equal(assessEvent(fail, { recentFailedLogins: 4 }).severity, "medium");
  assert.equal(assessEvent(fail, { recentFailedLogins: 5 }), null);
  assert.equal(assessEvent(fail, { recentFailedLogins: 9 }).severity, "high");
});

test("granting a full-access role is high, keeping one is not", () => {
  const user = (oldValues, newValues) => ({ event: "updated", type: "User", oldValues, newValues, at: noon });
  assert.equal(assessEvent(user({ wasTopRole: false }, { roleName: "owner" })).severity, "high");
  assert.equal(assessEvent(user({ wasTopRole: true }, { roleName: "owner" })), null);
  assert.equal(assessEvent(user({ wasTopRole: false }, { roleName: "cashier" })), null);
  assert.equal(assessEvent({ event: "created", type: "User", newValues: { email: "x@y.z", role: "admin" }, at: noon }).severity, "high");
});

test("night-time rule only applies to sensitive changes", () => {
  assert.equal(nairobiHour(night), 0);
  assert.deepEqual(codes(assessEvent(edit({ sellingPrice: 110 }, { at: night }))), []
    .concat("unusual_hours"));
  assert.equal(assessEvent(edit({ description: "new text" }, { at: night })), null);
  assert.equal(assessEvent({ event: "login", at: night }), null);
});

test("the highest flag sets the severity", () => {
  assert.equal(assessEvent(edit({ sellingPrice: 45 }, { at: night })).severity, "high");
});

test("mpesa reversals and bulk deletes are high", () => {
  assert.equal(assessEvent({ event: "mpesa_reversed", type: "MpesaTransaction", at: noon }).severity, "high");
  assert.equal(assessEvent({ event: "bulk_deleted", type: "Product", newValues: { deleted: 3 }, at: noon }).severity, "high");
});

test("repeated wrong PINs are flagged", () => {
  assert.equal(assessEvent({ event: "pin_lockout", type: "User", at: noon }).severity, "medium");
  assert.equal(assessEvent({ event: "pin_set", type: "User", at: noon }), null);
});

test("AI replies are validated", () => {
  const ids = new Set(["a"]);
  assert.equal(parseAiReview("not json", ids), null);
  assert.equal(parseAiReview(JSON.stringify({ summary: "x" }), ids), null);
  const r = parseAiReview(JSON.stringify({
    summary: "s",
    alerts: [
      { id: "a", risk: "high", explanation: "e", recommendedAction: "r" },
      { id: "invented", risk: "high", explanation: "e" },
      { id: "a", risk: "certain", explanation: "e" },
    ],
  }), ids);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].id, "a");
});
