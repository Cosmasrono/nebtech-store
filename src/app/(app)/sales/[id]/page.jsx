"use client";

import { useEffect, useState, use } from "react";
import { Loading } from "@/components/ui";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function SaleDetailPage({ params }) {
  const { id } = use(params);
  const [sale, setSale] = useState(null);

  useEffect(() => {
    fetch(`/api/sales/${id}`).then((r) => r.json()).then((d) => setSale(d.data));
  }, [id]);

  useEffect(() => {
    if (sale && new URLSearchParams(window.location.search).get("print") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [sale]);

  if (!sale) return <Loading />;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">Sale {sale.receiptNumber}</h1>
        <button className="btn-secondary" onClick={() => window.print()}>Print receipt</button>
      </div>

      <div className="card p-6" id="receipt">
        <div className="text-center mb-4">
          <div className="font-bold text-lg">NebTech Agrovet Supplies</div>
          <div className="text-xs text-slate-500">{sale.branch?.name || "Main Agrovet Store"}</div>
          <div className="text-xs text-slate-500 mt-1">{new Date(sale.createdAt).toLocaleString("en-KE")}</div>
          <div className="text-sm font-mono mt-1">{sale.receiptNumber}</div>
          {sale.customer && (
            <div className="mt-2 text-xs bg-slate-50 rounded p-1.5 border border-slate-200 inline-block text-left">
              <span className="font-semibold text-slate-700">Farmer: </span>{sale.customer.name}
              {sale.customer.phone && <span className="text-slate-500"> ({sale.customer.phone})</span>}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dashed border-slate-300">
              <th className="text-left py-1">Item</th><th className="text-right py-1">Qty</th>
              <th className="text-right py-1">Price</th><th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100/50">
                <td className="py-1.5">
                  <div className="font-medium">{i.product?.name}</div>
                  {(i.product?.genericName || i.product?.packSize) && (
                    <div className="text-[11px] text-slate-500">
                      {[i.product.genericName, i.product.packSize].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="py-1.5 text-right">{i.quantity}</td>
                <td className="py-1.5 text-right">{fmt(i.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium">{fmt(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-dashed border-slate-300 mt-3 pt-3 space-y-1 text-sm">
          <Row label="Subtotal" value={fmt(sale.subtotal)} />
          {sale.discountAmount > 0 && <Row label="Discount" value={`− ${fmt(sale.discountAmount)}`} />}
          {sale.tradeInAmount > 0 && <Row label="Trade-in credit" value={`− ${fmt(sale.tradeInAmount)}`} />}
          <Row label="Total" value={fmt(sale.totalAmount)} bold />
          <Row
            label={`Payment method`}
            value={sale.primaryPaymentMethod === "credit" ? "Debt (pay later)" : sale.primaryPaymentMethod.toUpperCase()}
            className={sale.primaryPaymentMethod === "credit" ? "text-amber-700 font-semibold" : ""}
          />
          {sale.primaryPaymentMethod !== "credit" && (
            <Row label="Amount tendered" value={fmt(sale.cashPaid + sale.mpesaPaid + sale.cardPaid)} />
          )}
          {sale.changeAmount > 0 && <Row label="Change" value={fmt(sale.changeAmount)} />}
        </div>
        <div className="text-center text-xs text-slate-400 mt-4">Served by {sale.cashier?.name} · Quality Agrovet Inputs Guaranteed</div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
