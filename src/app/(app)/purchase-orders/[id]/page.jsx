"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Alert, fmt } from "@/components/ui";

export default function PoDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [po, setPo] = useState(null);
  const [receive, setReceive] = useState({});
  const [msg, setMsg] = useState(null);

  const load = () => fetch(`/api/purchase-orders/${id}`).then((r) => r.json()).then((d) => setPo(d.data));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (!po) return <div className="text-slate-500">Loading…</div>;

  async function submitReceive() {
    const items = Object.entries(receive)
      .filter(([, v]) => Number(v.quantity) > 0)
      .map(([itemId, v]) => ({ itemId, quantityReceived: Number(v.quantity), expiryDate: v.expiryDate || null, batchNumber: v.batchNumber || null }));
    if (!items.length) return;
    const res = await fetch(`/api/purchase-orders/${id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
    });
    if (res.ok) { setReceive({}); setMsg({ ok: true, text: "Stock received." }); load(); }
    else setMsg({ ok: false, text: (await res.json()).message || "Receive failed." });
  }

  const canReceive = po.status === "pending" || po.status === "partially_received";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{po.poNumber} <span className="badge bg-slate-100 text-slate-600 ml-2">{po.status}</span></h1>
        <button className="btn-secondary" onClick={() => router.push("/purchase-orders")}>Back</button>
      </div>
      <Alert msg={msg} />
      <div className="card p-4 text-sm grid grid-cols-3 gap-4">
        <div><div className="text-slate-500">Supplier</div><div className="font-medium">{po.supplier?.name}</div></div>
        <div><div className="text-slate-500">Expected</div><div className="font-medium">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString("en-KE") : "—"}</div></div>
        <div><div className="text-slate-500">Total</div><div className="font-medium">{fmt(po.totalAmount)}</div></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr><th className="table-th">Product</th><th className="table-th text-right">Ordered</th><th className="table-th text-right">Received</th>
            <th className="table-th text-right">Unit cost</th>
            {canReceive && <><th className="table-th">Receive qty</th><th className="table-th">Batch</th><th className="table-th">Expiry</th></>}</tr>
          </thead>
          <tbody>
            {po.items.map((it) => {
              const outstanding = it.quantityOrdered - it.quantityReceived;
              return (
                <tr key={it.id}>
                  <td className="table-td font-medium">{it.product?.name}</td>
                  <td className="table-td text-right">{it.quantityOrdered}</td>
                  <td className="table-td text-right">{it.quantityReceived}</td>
                  <td className="table-td text-right">{fmt(it.unitCost)}</td>
                  {canReceive && (
                    <>
                      <td className="table-td">
                        <input type="number" min="0" max={outstanding} className="input !py-1 w-24" placeholder={`≤ ${outstanding}`}
                          value={receive[it.id]?.quantity || ""}
                          onChange={(e) => setReceive({ ...receive, [it.id]: { ...receive[it.id], quantity: e.target.value } })} />
                      </td>
                      <td className="table-td">
                        <input className="input !py-1 w-28" placeholder="Batch"
                          value={receive[it.id]?.batchNumber || ""}
                          onChange={(e) => setReceive({ ...receive, [it.id]: { ...receive[it.id], batchNumber: e.target.value } })} />
                      </td>
                      <td className="table-td">
                        <input type="date" className="input !py-1"
                          value={receive[it.id]?.expiryDate || ""}
                          onChange={(e) => setReceive({ ...receive, [it.id]: { ...receive[it.id], expiryDate: e.target.value } })} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canReceive && <button className="btn-primary" onClick={submitReceive}>Receive selected quantities</button>}
    </div>
  );
}
