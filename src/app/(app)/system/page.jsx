"use client";

import { useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";

export default function SystemPage() {
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetch("/api/system").then(async (r) => {
      const d = await r.json();
      if (r.ok) setSettings(d.data);
      else setError(d.message || "Only the owner can access system control.");
    });
  }, []);

  async function save() {
    const res = await fetch("/api/system", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    if (res.ok) setMsg({ ok: true, text: "Settings saved." });
    else setMsg({ ok: false, text: (await res.json()).message || "Save failed." });
  }

  async function seedPharmacy() {
    if (!confirm(
      "Load the Pharmacy catalog?\n\n" +
      "• 20 pharmacy products will be added and stock split across your active branches.\n" +
      "• Current products with no sales are removed; those with sale history are deactivated (history is kept)."
    )) return;

    setSeeding(true);
    setMsg(null);
    try {
      const res = await fetch("/api/system/seed-catalog", { method: "POST" });
      const data = await res.json();
      if (res.ok) setMsg({ ok: true, text: data.message });
      else setMsg({ ok: false, text: data.message || "Seeding failed." });
    } finally {
      setSeeding(false);
    }
  }

  if (error) return <div className="rounded-lg bg-amber-50 text-amber-800 px-4 py-3 text-sm">{error}</div>;
  if (!settings) return <Loading />;

  const set = (k) => (e) => setSettings({ ...settings, [k]: e.target.type === "checkbox" ? String(e.target.checked) : e.target.value });
  const isOn = (v) => v === "true" || v === true;

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-bold">System control</h1>
      <Alert msg={msg} />
      <div className="card p-6 space-y-4">
        <div><label className="label">Business name</label>
          <input className="input" value={settings.business_name || ""} onChange={set("business_name")} /></div>
        <div><label className="label">Tax rate (%)</label>
          <input type="number" step="0.01" className="input" value={settings.tax_rate || 0} onChange={set("tax_rate")} /></div>
        <ToggleRow label="System active" hint="When off, only the owner can sign in — use for emergency lockdown."
          checked={isOn(settings.system_active)} onChange={(v) => setSettings({ ...settings, system_active: String(v) })} />
        <ToggleRow label="Subscription active" hint="When off, staff see a subscription-expired notice."
          checked={isOn(settings.subscription_active)} onChange={(v) => setSettings({ ...settings, subscription_active: String(v) })} />
        <button className="btn-primary" onClick={save}>Save settings</button>
      </div>

      <div className="card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Pharmacy catalog</h2>
          <p className="text-xs text-slate-500 mt-1">
            Load 20 pharmacy products (medicines, first aid, devices). Stock is distributed
            evenly across all active branches. Existing products with sales history are
            deactivated (history is preserved); others are removed.
          </p>
        </div>
        <div>
          <button className="btn-primary" disabled={seeding} onClick={seedPharmacy}>
            {seeding ? "Loading pharmacy…" : "Load Pharmacy catalog"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-t border-slate-100">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-slate-400">{hint}</div>
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full relative transition ${checked ? "bg-teal-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
