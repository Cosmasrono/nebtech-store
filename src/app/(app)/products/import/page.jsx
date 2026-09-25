"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, fmt } from "@/components/ui";
import { MAX_IMPORT_ROWS, mapColumns, normalizeRow, parseCsv, templateCsv } from "@/lib/product-import";

const PREVIEW_ROWS = 200;

export default function ImportProductsPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [existing, setExisting] = useState("update");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null); // { rows, unknownColumns, missingColumns }
  const [server, setServer] = useState(null); // dry-run or import response
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch("/api/branches").then((r) => r.json()).then((d) => {
      const list = d.data || [];
      setBranches(list);
      setBranchId((list.find((b) => b.isMain) || list[0])?.id || "");
    }).catch(() => {});
  }, []);

  // Browser-side check, so problems show before anything is sent.
  const checked = useMemo(() => (parsed ? parsed.rows.map((r) => normalizeRow(r)) : []), [parsed]);
  const localErrors = checked.reduce((n, c) => n + c.errors.length, 0);

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "product-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    setMsg(null); setServer(null); setDone(null); setParsed(null);
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setMsg({ ok: false, text: "That's an Excel file. In Excel choose File → Save As → CSV (Comma delimited), then upload the .csv file." });
      return;
    }
    const table = parseCsv(await file.text());
    if (table.length < 2) return setMsg({ ok: false, text: "The file is empty or only has a header row." });
    const result = mapColumns(table);
    if (result.missingColumns.length) {
      return setMsg({ ok: false, text: `The file needs these columns: ${result.missingColumns.join(", ")}. Download the template to see the layout.` });
    }
    if (result.rows.length > MAX_IMPORT_ROWS) {
      return setMsg({ ok: false, text: `The file has ${result.rows.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.` });
    }
    setParsed(result);
  }

  async function send(dryRun) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed.rows, branchId, existing, dryRun }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res) return setMsg({ ok: false, text: "Couldn't reach the server. Check your connection." });
    if (!res.ok) { setServer(d); return setMsg({ ok: false, text: d.message || "Import failed." }); }
    if (dryRun) setServer(d);
    else { setDone(d.data); setParsed(null); setServer(null); setFileName(""); }
  }

  // Re-check with the server whenever the file or options change.
  useEffect(() => {
    if (parsed && !localErrors && branchId) send(true);
  }, [parsed, branchId, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const serverProblems = server?.problems || [];
  const preview = server?.data || server?.preview;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/products" className="text-sm text-teal-700 hover:underline">← Products</Link>
          <h1 className="text-xl font-bold">Import products</h1>
        </div>
        <button className="btn-secondary" onClick={downloadTemplate}>Download template (CSV)</button>
      </div>

      <div className="card p-4 space-y-3 text-sm text-slate-600">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Download the template and fill one product per row. Required columns: <b>name</b>, <b>category</b>, <b>selling_price</b>.</li>
          <li>Leave <b>sku</b> empty to have one created. If a SKU already exists, that product is updated and the quantity is added to its stock.</li>
          <li>New categories are created automatically. Dates can be 2027-06-30 or 30/06/2027.</li>
          <li>In Excel, save the file as <b>CSV (Comma delimited)</b> before uploading.</li>
        </ol>
      </div>

      <Alert msg={msg} />

      {done && (
        <div className="card p-4 bg-emerald-50 border-emerald-200 text-emerald-800 text-sm space-y-1">
          <div className="font-semibold">Import finished.</div>
          <div>{done.created} new product{done.created === 1 ? "" : "s"} added, {done.updated} updated{done.skipped ? `, ${done.skipped} skipped` : ""}. {done.units.toLocaleString()} units added to {done.branch}.</div>
          {done.newCategories?.length > 0 && <div>New categories: {done.newCategories.join(", ")}</div>}
          <Link href="/products" className="text-teal-700 font-medium hover:underline">View products</Link>
        </div>
      )}

      <div className="card p-4 grid md:grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="file">CSV file</label>
          <input id="file" type="file" accept=".csv,text/csv,.xlsx,.xls" className="input" onChange={onFile} />
          {fileName && <div className="text-xs text-slate-400 mt-1">{fileName}</div>}
        </div>
        <div>
          <label className="label" htmlFor="branch">Put the stock in</label>
          <select id="branch" className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isMain ? " (main)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="existing">If a SKU already exists</label>
          <select id="existing" className="input" value={existing} onChange={(e) => setExisting(e.target.value)}>
            <option value="update">Update it and add the quantity</option>
            <option value="skip">Skip that row</option>
          </select>
        </div>
      </div>

      {parsed && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-600">
              {parsed.rows.length} rows
              {preview && !localErrors && !serverProblems.length && (
                <> · <b>{preview.create}</b> new · <b>{preview.update}</b> to update{preview.skip ? <> · {preview.skip} skipped</> : null} · {preview.units.toLocaleString()} units into {preview.branch}
                  {preview.newCategories?.length > 0 && <> · new categories: {preview.newCategories.join(", ")}</>}</>
              )}
              {parsed.unknownColumns.length > 0 && <div className="text-xs text-amber-700">Ignored columns: {parsed.unknownColumns.join(", ")}</div>}
            </div>
            <button className="btn-primary" disabled={busy || localErrors > 0 || serverProblems.length > 0 || !preview}
              onClick={() => send(false)}>
              {busy ? "Working…" : `Import ${parsed.rows.length} products`}
            </button>
          </div>

          {(localErrors > 0 || serverProblems.length > 0) && (
            <div className="card p-3 bg-rose-50 border-rose-200 text-sm text-rose-700 space-y-1 max-h-60 overflow-y-auto">
              <div className="font-semibold">Fix these in the file, then upload it again:</div>
              {(serverProblems.length ? serverProblems : checked.flatMap((c, i) => c.errors.map((error) => ({ row: i + 2, name: c.value.name, error }))))
                .slice(0, 100)
                .map((p, i) => <div key={i}>Row {p.row}{p.name ? ` (${p.name})` : ""}: {p.error}</div>)}
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Row</th><th className="table-th">Name</th><th className="table-th">SKU</th>
                  <th className="table-th">Category</th><th className="table-th text-right">Cost</th>
                  <th className="table-th text-right">Price</th><th className="table-th text-right">Qty</th>
                  <th className="table-th">Batch / expiry</th><th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {checked.slice(0, PREVIEW_ROWS).map(({ value: r, errors }, i) => (
                  <tr key={i} className={errors.length ? "bg-rose-50" : ""}>
                    <td className="table-td text-slate-400">{i + 2}</td>
                    <td className="table-td font-medium">{r.name || "—"}</td>
                    <td className="table-td text-slate-500">{r.sku || <span className="text-slate-300">auto</span>}</td>
                    <td className="table-td">{r.category || "—"}</td>
                    <td className="table-td text-right">{r.costPrice != null ? fmt(r.costPrice) : "—"}</td>
                    <td className="table-td text-right">{Number.isFinite(r.sellingPrice) ? fmt(r.sellingPrice) : "—"}</td>
                    <td className="table-td text-right">{r.quantity}</td>
                    <td className="table-td text-xs text-slate-500">
                      {r.batchNumber || ""}{r.expiryDate ? ` · ${new Date(r.expiryDate).toLocaleDateString("en-KE")}` : ""}
                    </td>
                    <td className="table-td text-xs text-rose-700">{errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checked.length > PREVIEW_ROWS && (
              <div className="px-4 py-2 text-xs text-slate-400">Showing the first {PREVIEW_ROWS} of {checked.length} rows. All rows are checked and imported.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
