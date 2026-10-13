"use client";

import { useState } from "react";

// Product photo with a coloured initial as the fallback when there is no image
// or it fails to load (e.g. an external link while the till is offline).
export default function ProductImage({ src, name = "", className = "w-10 h-10" }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local SVGs and arbitrary external URLs
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={`${className} object-contain rounded-lg bg-white shrink-0`}
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return (
    <div className={`${className} rounded-lg bg-rose-50 text-rose-400 font-semibold grid place-items-center shrink-0`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
