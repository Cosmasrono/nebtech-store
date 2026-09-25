// Bulk product import: CSV parsing and row validation.
// Used in the browser (preview) and on the server (the real check), so it must stay dependency-free.

export const MAX_IMPORT_ROWS = 2000;

export const DOSAGE_FORMS = [
  "tablet", "capsule", "syrup", "suspension", "injection", "cream",
  "ointment", "drops", "inhaler", "sachet", "suppository", "other",
];

// Column name in the file (lower-case, spaces/underscores ignored) → field.
const ALIASES = {
  name: ["name", "product", "productname", "item", "itemname"],
  sku: ["sku", "code", "productcode", "itemcode"],
  barcode: ["barcode", "ean", "upc"],
  category: ["category", "categoryname"],
  costPrice: ["cost", "costprice", "buyingprice", "buying", "unitcost"],
  sellingPrice: ["price", "sellingprice", "retailprice", "saleprice", "unitprice"],
  quantity: ["quantity", "qty", "stock", "openingstock", "quantityinstock"],
  reorderLevel: ["reorderlevel", "reorder", "minstock", "minimumstock"],
  description: ["description", "details"],
  genericName: ["genericname", "generic"],
  brandName: ["brandname", "brand"],
  strength: ["strength"],
  dosageForm: ["dosageform", "form"],
  packSize: ["packsize", "pack"],
  manufacturer: ["manufacturer", "maker"],
  prescriptionRequired: ["prescriptionrequired", "prescription", "pom", "rx"],
  batchNumber: ["batchnumber", "batch", "batchno", "lot"],
  expiryDate: ["expirydate", "expiry", "exp", "expires"],
};

export const TEMPLATE_HEADERS = [
  "name", "sku", "barcode", "category", "cost_price", "selling_price", "quantity", "reorder_level",
  "description", "generic_name", "brand_name", "strength", "dosage_form", "pack_size",
  "manufacturer", "prescription_required", "batch_number", "expiry_date",
];

export const TEMPLATE_EXAMPLE = [
  ["Panadol Extra 500mg", "PAN-500", "5000158062115", "Pharmacy", "8", "15", "200", "20",
    "", "Paracetamol", "Panadol", "500mg", "tablet", "10x10", "GSK", "no", "B2291", "2027-06-30"],
  ["DAP Fertilizer 50kg", "", "", "Fertilizers", "5200", "6100", "12", "3",
    "", "", "", "", "", "", "", "", "", ""],
];

const key = (h) => String(h || "").toLowerCase().replace(/[\s_\-.]/g, "");

/** Parses CSV text (quoted fields, commas/semicolons, CRLF, Excel's BOM). Returns string[][]. */
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  // Excel in some regions saves with semicolons.
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

/** Turns parsed CSV into objects keyed by field name. Returns { rows, unknownColumns, missingColumns }. */
export function mapColumns(table) {
  const [header = [], ...body] = table;
  const fieldForColumn = header.map((h) => {
    const k = key(h);
    return Object.keys(ALIASES).find((f) => ALIASES[f].includes(k)) || null;
  });
  const unknownColumns = header.filter((h, i) => !fieldForColumn[i] && String(h).trim());
  const found = new Set(fieldForColumn.filter(Boolean));
  const missingColumns = ["name", "category", "sellingPrice"].filter((f) => !found.has(f));
  const rows = body.map((cells) => {
    const obj = {};
    fieldForColumn.forEach((f, i) => { if (f) obj[f] = String(cells[i] ?? "").trim(); });
    return obj;
  });
  return { rows, unknownColumns, missingColumns };
}

function parseNumber(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/ksh|kes|,|\s/gi, ""));
  return Number.isFinite(n) ? n : NaN;
}

// Rejects impossible dates like 2026-13-40 instead of letting them roll over.
function utcDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : "invalid";
}

function parseDate(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);                 // 2027-06-30
  if (m) return utcDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);           // 30/06/2027 (day first)
  if (m) return utcDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);                          // 06/2027 → end of month
  if (m && +m[1] >= 1 && +m[1] <= 12) return new Date(Date.UTC(+m[2], +m[1], 0));
  return "invalid";
}

const YES = ["yes", "y", "true", "1", "pom", "rx"];
const NO = ["no", "n", "false", "0", "otc", ""];

/**
 * Validates and cleans one row. Returns { value, errors }.
 * `value` holds typed fields ready to save; `errors` is a list of readable problems.
 */
export function normalizeRow(raw) {
  const errors = [];
  const text = (f, max = 200) => (raw[f] ? String(raw[f]).trim().slice(0, max) : null);

  const name = text("name", 150);
  if (!name) errors.push("Name is missing");
  const category = text("category", 80);
  if (!category) errors.push("Category is missing");

  const sellingPrice = parseNumber(raw.sellingPrice);
  if (sellingPrice === null) errors.push("Selling price is missing");
  else if (Number.isNaN(sellingPrice) || sellingPrice <= 0) errors.push("Selling price must be a number above 0");

  const costPrice = parseNumber(raw.costPrice);
  if (Number.isNaN(costPrice) || (costPrice !== null && costPrice < 0)) errors.push("Cost price must be a number");

  const quantity = parseNumber(raw.quantity);
  if (Number.isNaN(quantity) || (quantity !== null && (quantity < 0 || !Number.isInteger(quantity)))) {
    errors.push("Quantity must be a whole number (0 or more)");
  }

  const reorderLevel = parseNumber(raw.reorderLevel);
  if (Number.isNaN(reorderLevel) || (reorderLevel !== null && reorderLevel < 0)) errors.push("Reorder level must be a number");

  let dosageForm = text("dosageForm", 30)?.toLowerCase() || null;
  if (dosageForm && !DOSAGE_FORMS.includes(dosageForm)) {
    errors.push(`Dosage form must be one of: ${DOSAGE_FORMS.join(", ")}`);
    dosageForm = null;
  }

  const rx = String(raw.prescriptionRequired || "").trim().toLowerCase();
  if (!YES.includes(rx) && !NO.includes(rx)) errors.push("Prescription required must be yes or no");

  const expiry = parseDate(raw.expiryDate);
  if (expiry === "invalid") errors.push("Expiry date must look like 2027-06-30 or 30/06/2027");

  const sku = text("sku", 60);
  if (sku && !/^[\w\-./ ]+$/.test(sku)) errors.push("SKU can only use letters, numbers, - _ . /");

  return {
    errors,
    value: {
      name,
      sku: sku ? sku.toUpperCase() : null,
      barcode: text("barcode", 60),
      category,
      costPrice: costPrice ?? null,
      sellingPrice,
      quantity: quantity ?? 0,
      reorderLevel: reorderLevel ?? 10,
      description: text("description", 500),
      genericName: text("genericName", 120),
      brandName: text("brandName", 120),
      strength: text("strength", 60),
      dosageForm,
      packSize: text("packSize", 60),
      manufacturer: text("manufacturer", 120),
      prescriptionRequired: YES.includes(rx),
      batchNumber: text("batchNumber", 60),
      expiryDate: expiry instanceof Date ? expiry.toISOString() : null,
    },
  };
}

/** Builds the downloadable template as CSV text. */
export function templateCsv() {
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE].map((r) => r.map(esc).join(",")).join("\r\n");
}
