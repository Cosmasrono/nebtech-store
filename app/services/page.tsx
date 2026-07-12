"use client";

import { useState } from "react";
import { completeServiceOrder, startServiceOrder, useClinic } from "@/lib/store";
import type { OrderType } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { openServiceOrders, patientName } from "@/lib/selectors";
import { useSession } from "@/components/SessionProvider";

type Filter = "all" | Exclude<OrderType, "prescription">;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lab", label: "Lab" },
  { key: "radiology", label: "Radiology" },
  { key: "procedure", label: "Procedures" },
];

export default function ServicesPage() {
  const data = useClinic();
  const session = useSession();
  // Technicians land on their own department; everyone can still switch tabs.
  const [filter, setFilter] = useState<Filter>(
    session?.role === "lab" || session?.role === "radiology"
      ? session.role
      : "all",
  );
  const items = openServiceOrders(
    data,
    filter === "all" ? undefined : filter,
  );

  return (
    <div>
      <PageHeader
        title="Lab / Radiology / Procedures"
        subtitle="Outstanding service orders. Enter a result to send the patient back to the doctor."
      />

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-teal-600 text-white"
                : "bg-white text-zinc-600 border border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState>No outstanding orders in this department.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(({ order, patient }) => (
            <ResultCard
              key={order.id}
              orderId={order.id}
              title={order.title}
              type={order.type}
              instructions={order.instructions}
              patient={patientName(patient)}
              status={order.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  orderId,
  title,
  type,
  instructions,
  patient,
  status,
}: {
  orderId: string;
  title: string;
  type: string;
  instructions?: string;
  patient: string;
  status: "requested" | "in-progress" | "completed";
}) {
  const [result, setResult] = useState("");

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-zinc-500">
            {patient} · <span className="capitalize">{type}</span>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      {instructions && (
        <p className="mt-2 text-xs text-zinc-500">Note: {instructions}</p>
      )}
      {status === "requested" && (
        <Button
          className="mt-3 w-full"
          variant="secondary"
          onClick={() => startServiceOrder(orderId)}
        >
          Start work
        </Button>
      )}
      <textarea
        className={`${inputClass} mt-3 h-20 w-full py-2`}
        placeholder="Enter result / findings…"
        value={result}
        onChange={(e) => setResult(e.target.value)}
        disabled={status === "requested"}
      />
      <Button
        className="mt-3 w-full"
        disabled={status === "requested" || !result.trim()}
        onClick={() => completeServiceOrder(orderId, result)}
      >
        {status === "requested"
          ? "Start work before saving result"
          : "Save result & return to doctor"}
      </Button>
    </Card>
  );
}
