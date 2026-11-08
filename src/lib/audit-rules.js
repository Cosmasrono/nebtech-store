// Decides whether an audit entry looks suspicious. Pure logic (no database or framework imports),
// so the rules can be tested directly. audit.js supplies any history a rule needs through `context`.

export const THRESHOLDS = {
  priceCutMediumPct: 30,
  priceCutHighPct: 50,
  priceRiseMediumPct: 100,
  costChangeMediumPct: 50,
  priceFlipWindowHours: 24,
  stockCutHighUnits: 20,
  discountMediumPct: 20,
  discountHighPct: 50,
  repeatDiscountCount: 5,
  repeatDiscountWindowHours: 24,
  cashShortMedium: 100,
  cashShortHigh: 1000,
  cashOverMedium: 1000,
  failedLoginMedium: 5,
  failedLoginHigh: 10,
  failedLoginWindowMinutes: 15,
  // Nairobi time. Unusual hours run from nightStartHour until nightEndHour.
  nightStartHour: 22,
  nightEndHour: 6,
};

const RANK = { low: 1, medium: 2, high: 3 };
const TOP_ROLES = ["owner", "super_admin", "superadmin", "admin"];

const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const ksh = (n) => `KSh ${Number(n).toLocaleString("en-KE")}`;
const isTop = (name) => TOP_ROLES.includes(String(name || "").toLowerCase());

/** The new value if this update sets one, otherwise the existing value. */
const after = (oldValue, newValues, key) => (newValues?.[key] === undefined ? num(oldValue) : num(newValues[key]));

function productChanges(o, n) {
  const oldPrice = num(o?.sellingPrice);
  const newPrice = after(o?.sellingPrice, n, "sellingPrice");
  const oldCost = num(o?.costPrice);
  const newCost = after(o?.costPrice, n, "costPrice");
  const oldStock = num(o?.quantityInStock);
  const newStock = after(o?.quantityInStock, n, "quantityInStock");
  return {
    oldPrice, newPrice, oldCost, newCost, oldStock, newStock,
    priceChanged: newPrice !== null && oldPrice !== newPrice,
    costChanged: newCost !== null && oldCost !== newCost,
    stockChanged: newStock !== null && oldStock !== newStock,
  };
}

function productFlags({ oldValues: o, newValues: n }, context) {
  const c = productChanges(o, n);
  const name = o?.name || "A product";
  const flags = [];
  const T = THRESHOLDS;

  if (c.newCost > 0 && c.newPrice !== null && c.newPrice < c.newCost && (c.priceChanged || c.costChanged)) {
    flags.push({ code: "price_below_cost", severity: "high", message: `${name}: selling price ${ksh(c.newPrice)} is below cost ${ksh(c.newCost)}.` });
  }
  if (c.priceChanged && c.oldPrice > 0) {
    const change = ((c.newPrice - c.oldPrice) / c.oldPrice) * 100;
    if (change <= -T.priceCutMediumPct) {
      flags.push({
        code: "price_cut",
        severity: change <= -T.priceCutHighPct ? "high" : "medium",
        message: `${name}: price cut ${Math.round(-change)}%, from ${ksh(c.oldPrice)} to ${ksh(c.newPrice)}.`,
      });
    } else if (change >= T.priceRiseMediumPct) {
      flags.push({ code: "price_rise", severity: "medium", message: `${name}: price raised ${Math.round(change)}%, from ${ksh(c.oldPrice)} to ${ksh(c.newPrice)}.` });
    }
  }
  if (c.priceChanged) {
    const flipped = (context.priceHistory || []).some((p) => {
      const before = num(p.oldValues?.sellingPrice);
      const set = num(p.newValues?.sellingPrice);
      return before === c.newPrice && set !== null && set !== before;
    });
    if (flipped) {
      flags.push({ code: "price_flip", severity: "high", message: `${name}: price was changed and then put back to ${ksh(c.newPrice)} within ${T.priceFlipWindowHours} hours.` });
    }
  }
  if (c.costChanged && c.oldCost > 0) {
    const change = Math.abs((c.newCost - c.oldCost) / c.oldCost) * 100;
    if (change >= T.costChangeMediumPct) {
      flags.push({ code: "cost_change", severity: "medium", message: `${name}: cost price changed from ${ksh(c.oldCost)} to ${ksh(c.newCost)}.` });
    }
  }
  if (c.stockChanged) {
    const removed = (c.oldStock ?? 0) - c.newStock;
    const big = removed >= T.stockCutHighUnits || (removed >= 10 && removed >= (c.oldStock ?? 0) / 2);
    flags.push({
      code: "manual_stock_edit",
      severity: big ? "high" : "medium",
      message: `${name}: stock edited by hand from ${c.oldStock ?? 0} to ${c.newStock}, without a stock movement.`,
    });
  }
  return flags;
}

function saleFlags({ newValues: n }, context) {
  const discount = num(n?.discount);
  if (!discount || discount <= 0) return [];
  const T = THRESHOLDS;
  const receipt = n.receiptNumber || "A sale";
  const flags = [];
  const gross = (num(n.totalAmount) ?? 0) + discount;
  const pct = gross > 0 ? (discount / gross) * 100 : 0;
  if (pct >= T.discountMediumPct) {
    flags.push({
      code: "large_discount",
      severity: pct >= T.discountHighPct ? "high" : "medium",
      message: `${receipt}: ${Math.round(pct)}% discount (${ksh(discount)}) given by hand.${n.discountReason ? ` Reason: ${n.discountReason}` : " No reason given."}`,
    });
  }
  const total = (context.recentDiscountCount || 0) + 1;
  if (total % T.repeatDiscountCount === 0) {
    flags.push({ code: "repeat_discounts", severity: "medium", message: `${total} hand-given discounts by the same person in ${T.repeatDiscountWindowHours} hours.` });
  }
  return flags;
}

function shiftFlags({ newValues: n }) {
  const diff = num(n?.difference);
  if (diff === null) return [];
  const T = THRESHOLDS;
  if (diff <= -T.cashShortMedium) {
    return [{
      code: "cash_short",
      severity: diff <= -T.cashShortHigh ? "high" : "medium",
      message: `Shift closed ${ksh(-diff)} short: expected ${ksh(n.expected)}, counted ${ksh(n.counted)}.`,
    }];
  }
  if (diff >= T.cashOverMedium) {
    return [{ code: "cash_over", severity: "medium", message: `Shift closed ${ksh(diff)} over: expected ${ksh(n.expected)}, counted ${ksh(n.counted)}.` }];
  }
  return [];
}

function failedLoginFlags({ newValues: n }, context) {
  const T = THRESHOLDS;
  const total = (context.recentFailedLogins || 0) + 1;
  if (total !== T.failedLoginMedium && total !== T.failedLoginHigh) return [];
  return [{
    code: "failed_logins",
    severity: total === T.failedLoginHigh ? "high" : "medium",
    message: `${total} failed sign-ins for ${n?.email || "one account"} within ${T.failedLoginWindowMinutes} minutes.`,
  }];
}

function userFlags({ event, oldValues: o, newValues: n }) {
  if (event === "deleted") return [{ code: "user_deleted", severity: "medium", message: `User account deleted: ${o?.name || "unknown"} (${o?.email || "no email"}).` }];
  if (event === "created" && isTop(n?.role)) {
    return [{ code: "admin_granted", severity: "high", message: `New account ${n.email || ""} created with full-access role "${n.role}".` }];
  }
  if (event === "updated" && isTop(n?.roleName) && !o?.wasTopRole) {
    return [{ code: "admin_granted", severity: "high", message: `${o?.name || "A user"} was given full-access role "${n.roleName}".` }];
  }
  return [];
}

function isSensitiveChange(entry) {
  const { event, type, oldValues: o, newValues: n } = entry;
  if (type === "Product" && event === "updated") {
    const c = productChanges(o, n);
    return c.priceChanged || c.costChanged || c.stockChanged;
  }
  if (type === "User" && event === "updated") return n?.roleName !== undefined;
  return ["stock_added", "stock_transferred", "expense_approved", "mpesa_reversed", "settings_updated"].includes(event);
}

/** Hour of the day in Nairobi (UTC+3 all year). */
export function nairobiHour(date) {
  return (date.getUTCHours() + 3) % 24;
}

/** Which history, if any, audit.js should load before calling assessEvent. */
export function contextNeeded({ event, type, oldValues, newValues }) {
  if (type === "Product" && event === "updated" && productChanges(oldValues, newValues).priceChanged) return "priceHistory";
  if (type === "Sale" && event === "created" && num(newValues?.discount) > 0) return "recentDiscounts";
  if (event === "failed_login") return "failedLogins";
  return null;
}

/** Returns { severity, flags } for a suspicious entry, or null for a normal one. */
export function assessEvent(entry, context = {}) {
  const { event, type } = entry;
  let flags = [];
  if (type === "Product" && event === "updated") flags = productFlags(entry, context);
  else if (type === "Product" && event === "bulk_deleted") {
    flags = [{ code: "bulk_delete", severity: "high", message: `Bulk product removal: ${entry.newValues?.deleted ?? 0} deleted, ${entry.newValues?.deactivated ?? 0} deactivated.` }];
  } else if (type === "Sale" && event === "created") flags = saleFlags(entry, context);
  else if (event === "shift_closed") flags = shiftFlags(entry);
  else if (event === "mpesa_reversed") flags = [{ code: "mpesa_reversed", severity: "high", message: "An M-Pesa payment was reversed." }];
  else if (event === "failed_login") flags = failedLoginFlags(entry, context);
  else if (event === "pin_lockout") flags = [{ code: "pin_lockout", severity: "medium", message: "Signed out after 5 wrong PINs on a locked screen." }];
  else if (type === "User") flags = userFlags(entry);

  const at = entry.at || new Date();
  const hour = nairobiHour(at);
  if ((hour >= THRESHOLDS.nightStartHour || hour < THRESHOLDS.nightEndHour) && isSensitiveChange(entry)) {
    flags.push({ code: "unusual_hours", severity: "low", message: `Done at ${String(hour).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")} Nairobi time, outside normal hours.` });
  }

  if (!flags.length) return null;
  const severity = flags.reduce((top, f) => (RANK[f.severity] > RANK[top] ? f.severity : top), "low");
  return { severity, flags };
}
