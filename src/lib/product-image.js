// Product photo helpers, shared by the API routes, CSV import and seed scripts.

/** Image path for a product in the bundled cosmetics catalog (public/images/products). */
export const catalogImage = (sku) => `/images/products/${String(sku).toLowerCase()}.svg`;

/**
 * Accepts a site path ("/images/...") or an http(s) URL.
 * Returns the cleaned value, null when empty, or undefined when it isn't allowed.
 */
export function cleanImageUrl(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (v.length > 500) return undefined;
  if (/^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v)) return v;
  return undefined;
}

export const IMAGE_URL_ERROR = "Image must be a link starting with https:// or a path like /images/products/photo.jpg.";
