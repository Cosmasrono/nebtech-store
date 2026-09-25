// Cart pricing with discounts. Used by the POS (what the cashier sees) and the sales API
// (what's saved), so both always arrive at the same total.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * items:  [{ unitPrice, quantity, discountPerItem }]   discountPerItem = KSh off each unit
 * promo:  { type: "percentage" | "fixed", value, minSpend } | null
 * manual: { type: "percent" | "amount", value } | null  — discount on the whole sale
 *
 * Order: item discounts first, then the promo code, then the sale discount.
 */
export function priceCart({ items, promo = null, manual = null }) {
  const lines = items.map((i) => {
    const unitPrice = round2(i.unitPrice);
    const quantity = Number(i.quantity) || 0;
    const discountPerItem = round2(Math.min(unitPrice, Math.max(0, Number(i.discountPerItem) || 0)));
    return {
      ...i,
      unitPrice,
      quantity,
      discountPerItem,
      grossTotal: round2(unitPrice * quantity),
      lineTotal: round2((unitPrice - discountPerItem) * quantity), // after item discount
    };
  });

  const gross = round2(lines.reduce((s, l) => s + l.grossTotal, 0));
  const afterItems = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const itemDiscount = round2(gross - afterItems);

  let promoDiscount = 0;
  if (promo && afterItems >= (promo.minSpend || 0)) {
    promoDiscount = promo.type === "percentage"
      ? round2((afterItems * Math.min(100, Math.max(0, promo.value))) / 100)
      : round2(Math.min(Math.max(0, promo.value), afterItems));
  }

  const beforeManual = round2(afterItems - promoDiscount);
  let manualDiscount = 0;
  const v = Math.max(0, Number(manual?.value) || 0);
  if (v > 0) {
    manualDiscount = manual.type === "percent"
      ? round2((beforeManual * Math.min(100, v)) / 100)
      : round2(Math.min(v, beforeManual));
  }

  const discountAmount = round2(itemDiscount + promoDiscount + manualDiscount);
  return {
    lines,
    gross,            // before any discount (saved as Sale.subtotal)
    itemDiscount,
    promoDiscount,
    manualDiscount,
    discountAmount,   // everything taken off (saved as Sale.discountAmount)
    total: round2(Math.max(0, gross - discountAmount)),
  };
}
