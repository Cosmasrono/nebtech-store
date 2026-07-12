"use client";

import { useState } from "react";
import { addMedicine, updateMedicine, useClinic } from "@/lib/store";
import type { Medicine } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";

const money = (n: number) =>
  `KSh ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

const FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "suspension",
  "injection",
  "inhaler",
  "cream",
  "ointment",
  "drops",
  "sachet",
];

const LOW_STOCK = 10;

const emptyForm = {
  name: "",
  strength: "",
  form: "tablet",
  unitPrice: "",
  stock: "",
};

export default function MedicinesPage() {
  const data = useClinic();
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const medicines = data.medicines.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.strength.toLowerCase().includes(q) ||
      m.form.toLowerCase().includes(q),
  );
  const lowCount = data.medicines.filter((m) => m.stock <= LOW_STOCK).length;

  return (
    <div>
      <PageHeader
        title="Medicines"
        subtitle="The pharmacy catalog. Add new medicines here; edit a price or stock directly in the list."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Catalog */}
        <div>
          <div className="mb-3 flex items-center gap-3">
            <input
              className={`${inputClass} flex-1`}
              placeholder="Search by name, strength or form…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {lowCount > 0 && (
              <span className="whitespace-nowrap rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {lowCount} low on stock
              </span>
            )}
          </div>

          {medicines.length === 0 ? (
            <EmptyState>
              {data.medicines.length === 0
                ? "The catalog is empty — add your first medicine."
                : "No medicines match your search."}
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Medicine</th>
                    <th className="px-4 py-2 font-medium">Form</th>
                    <th className="px-4 py-2 font-medium">Unit price</th>
                    <th className="px-4 py-2 font-medium">In stock</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((m) => (
                    <MedicineRow
                      key={`${m.id}-${m.unitPrice}-${m.stock}`}
                      med={m}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add */}
        <AddMedicineForm />
      </div>
    </div>
  );
}

/** One catalog row. Price and stock are edited in place and saved when the
 *  field loses focus (or on Enter) — no separate edit screen. */
function MedicineRow({ med }: { med: Medicine }) {
  const [price, setPrice] = useState(String(med.unitPrice));
  const [stock, setStock] = useState(String(med.stock));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const changes: { unitPrice?: number; stock?: number } = {};
    if (price.trim() !== String(med.unitPrice)) {
      changes.unitPrice = Number(price);
    }
    if (stock.trim() !== String(med.stock)) changes.stock = Number(stock);
    if (Object.keys(changes).length === 0) return;
    const err = await updateMedicine(med.id, changes);
    if (err) setError(err);
  };

  const onKey = (e: React.KeyboardEvent) =>
    e.key === "Enter" && (e.target as HTMLInputElement).blur();

  return (
    <tr className="border-t border-zinc-100">
      <td className="px-4 py-2">
        <span className="font-medium">{med.name}</span>
        {med.strength && (
          <span className="ml-1 text-zinc-500">{med.strength}</span>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-2 capitalize text-zinc-600">{med.form}</td>
      <td className="px-4 py-2">
        <input
          className={`${inputClass} h-8 w-28`}
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
          aria-label={`Unit price of ${med.name}`}
        />
        <p className="mt-1 text-xs text-zinc-400">{money(med.unitPrice)}</p>
      </td>
      <td className="px-4 py-2">
        <input
          className={`${inputClass} h-8 w-20 ${
            med.stock <= LOW_STOCK ? "border-amber-400 bg-amber-50" : ""
          }`}
          type="number"
          min="0"
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
          aria-label={`Stock of ${med.name}`}
        />
        {med.stock <= LOW_STOCK && (
          <p className="mt-1 text-xs font-medium text-amber-700">
            {med.stock === 0 ? "Out of stock" : "Low stock"}
          </p>
        )}
      </td>
    </tr>
  );
}

function AddMedicineForm() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set =
    (k: keyof typeof form) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const err = await addMedicine({
      name: form.name,
      strength: form.strength,
      form: form.form,
      unitPrice: Number(form.unitPrice),
      stock: Number(form.stock) || 0,
    });
    if (err) {
      setError(err);
      return;
    }
    setSaved(`${form.name.trim()} ${form.strength.trim()}`.trim());
    setForm(emptyForm);
  };

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-zinc-700">
        Add medicine
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. Paracetamol"
            required
          />
        </Field>
        <Field label="Strength">
          <input
            className={inputClass}
            value={form.strength}
            onChange={set("strength")}
            placeholder="e.g. 500mg"
          />
        </Field>
        <Field label="Form">
          <select
            className={inputClass}
            value={form.form}
            onChange={set("form")}
          >
            {FORMS.map((f) => (
              <option key={f} value={f} className="capitalize">
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit price (KSh)">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={form.unitPrice}
            onChange={set("unitPrice")}
            placeholder="e.g. 10"
            required
          />
        </Field>
        <Field label="Opening stock">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={set("stock")}
            placeholder="e.g. 100"
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {saved} added to the catalog.
          </p>
        )}
        <Button type="submit">Add to catalog</Button>
      </form>
    </Card>
  );
}
