"use client";

import { useState } from "react";
import {
  addPrescription,
  addServiceOrder,
  assignVisitDoctor,
  sendToPharmacy,
  setVisitComplaint,
  startConsult,
  useClinic,
} from "@/lib/store";
import type { Med, OrderType } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  LocationBadge,
  PageHeader,
  PriorityBadge,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import {
  byPriorityThenArrival,
  doctorMap,
  doctorName,
  doctorQueueCounts,
  ordersForVisit,
  patientMap,
  patientName,
  visitLocation,
  visitsByStatus,
} from "@/lib/selectors";

export default function DoctorPage() {
  const data = useClinic();
  const pmap = patientMap(data);
  const dmap = doctorMap(data);
  const active = visitsByStatus(data, "waiting", "with-doctor", "back-to-doctor");

  // Which doctor's queue we're looking at. "all" = whole department,
  // "unassigned" = patients reception didn't route yet.
  const [view, setView] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queue = active
    .filter((v) =>
      view === "all"
        ? true
        : view === "unassigned"
          ? !v.assignedDoctorId
          : v.assignedDoctorId === view,
    )
    .sort(byPriorityThenArrival);
  const selected = active.find((v) => v.id === selectedId) ?? null;

  const countFor = (id: string) =>
    id === "unassigned"
      ? active.filter((v) => !v.assignedDoctorId).length
      : active.filter((v) => v.assignedDoctorId === id).length;

  return (
    <div>
      <PageHeader
        title="Doctor"
        subtitle="Each doctor has their own queue. Reception routes patients here."
      />

      {/* Per-doctor view tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        <QueueTab
          label={`All (${active.length})`}
          active={view === "all"}
          onClick={() => setView("all")}
        />
        {data.doctors.map((d) => (
          <QueueTab
            key={d.id}
            label={`${d.name} (${countFor(d.id)})`}
            active={view === d.id}
            onClick={() => setView(d.id)}
          />
        ))}
        {countFor("unassigned") > 0 && (
          <QueueTab
            label={`Unassigned (${countFor("unassigned")})`}
            active={view === "unassigned"}
            onClick={() => setView("unassigned")}
            warn
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Queue */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-700">
            Queue ({queue.length})
          </h2>
          {queue.length === 0 ? (
            <EmptyState>No patients in this queue.</EmptyState>
          ) : (
            queue.map((v) => {
              const p = pmap.get(v.patientId);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selectedId === v.id
                      ? "border-teal-500 bg-teal-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {patientName(p)}
                    </span>
                    <div className="flex items-center gap-1">
                      {v.priority && v.priority !== "normal" && (
                        <PriorityBadge priority={v.priority} />
                      )}
                      <LocationBadge location={visitLocation(data, v)} />
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {p?.mrn} · {v.complaint || "Awaiting consultation"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-teal-700">
                    {doctorName(
                      v.assignedDoctorId
                        ? dmap.get(v.assignedDoctorId)
                        : undefined,
                    )}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Consult panel */}
        <div>
          {selected ? (
            <ConsultPanel key={selected.id} visitId={selected.id} />
          ) : (
            <EmptyState>Select a patient from the queue to begin.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueTab({
  label,
  active,
  onClick,
  warn,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-teal-600 text-white"
          : warn
            ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  );
}

function ConsultPanel({ visitId }: { visitId: string }) {
  const data = useClinic();
  const [assignError, setAssignError] = useState<string | null>(null);
  const visit = data.visits.find((v) => v.id === visitId);
  const patient = visit && patientMap(data).get(visit.patientId);
  const orders = ordersForVisit(data, visitId);

  // The doctor either sends the patient for tests or prescribes — never both
  // forms at once. Returning patients (results in) default to prescribing.
  const [mode, setMode] = useState<"services" | "prescribe">(() =>
    visit?.status === "back-to-doctor" ||
    orders.some((o) => o.type === "prescription")
      ? "prescribe"
      : "services",
  );

  if (!visit || !patient) return null;

  // Queue depth per doctor (this visit excluded) so reassignment shows load.
  const queueCounts = doctorQueueCounts(data, visitId);

  const pendingServices = orders.filter(
    (o) => o.type !== "prescription" && o.status !== "completed",
  );
  const hasPrescription = orders.some((o) => o.type === "prescription");
  const canFinalize = pendingServices.length === 0;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{patientName(patient)}</h2>
          <p className="text-sm text-zinc-500">
            {patient.mrn} · {patient.gender}, {patient.age}y · {patient.phone}
          </p>
        </div>
        <LocationBadge location={visitLocation(data, visit)} />
      </div>

      {/* Vitals taken at reception */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Weight", value: visit.vitals?.weight, unit: "kg" },
          { label: "Temp", value: visit.vitals?.temperature, unit: "°C" },
          { label: "BP", value: visit.vitals?.bloodPressure, unit: "" },
        ].map((vital) => (
          <div key={vital.label} className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">{vital.label}</p>
            <p className="font-medium text-zinc-800">
              {vital.value ? `${vital.value} ${vital.unit}`.trim() : "—"}
            </p>
          </div>
        ))}
      </div>

      {/* Assignment / routing */}
      <div className="mt-3">
        <Field label="Assigned doctor">
          <select
            className={inputClass}
            value={visit.assignedDoctorId ?? ""}
            onChange={async (e) => {
              setAssignError(null);
              const err = await assignVisitDoctor(visitId, e.target.value);
              if (err) setAssignError(err);
            }}
          >
            <option value="" disabled>
              Unassigned — choose a doctor…
            </option>
            {data.doctors.map((d) => {
              const n = queueCounts.get(d.id) ?? 0;
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {n > 0 ? ` — ${n} waiting` : ""}
                </option>
              );
            })}
          </select>
        </Field>
        {assignError && (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
            {assignError}
          </p>
        )}
      </div>

      {visit.status === "waiting" && (
        <Button className="mt-4" onClick={() => startConsult(visitId)}>
          Start consultation
        </Button>
      )}

      {visit.status !== "waiting" && visit.status !== "completed" && (
        <div className="mt-4">
          <ComplaintEditor
            visitId={visitId}
            initial={visit.complaint}
            key={visit.complaint}
          />
        </div>
      )}

      {/* Existing orders + results */}
      {orders.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">
            Orders & results
          </h3>
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-zinc-200 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">
                    {o.type === "prescription" ? "Prescription" : o.title}
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      {o.type}
                    </span>
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                {o.result && (
                  <p className="mt-2 rounded bg-green-50 p-2 text-xs text-green-800">
                    Result: {o.result}
                  </p>
                )}
                {o.meds && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
                    {o.meds.map((m) => (
                      <li key={m.id}>
                        {m.name} — {m.dosage}, {m.frequency}, {m.duration}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visit.status !== "waiting" && visit.status !== "completed" && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">
            Next step
          </h3>
          <div className="mb-4 flex gap-2">
            <QueueTab
              label="Send for tests"
              active={mode === "services"}
              onClick={() => setMode("services")}
            />
            <QueueTab
              label="Prescribe medicine"
              active={mode === "prescribe"}
              onClick={() => setMode("prescribe")}
            />
          </div>

          {mode === "services" ? (
            <ServiceOrderForm visitId={visitId} />
          ) : (
            <>
              <PrescriptionForm visitId={visitId} />
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <Button
                  disabled={!canFinalize || !hasPrescription}
                  onClick={() => sendToPharmacy(visitId)}
                  className="w-full"
                >
                  {hasPrescription
                    ? canFinalize
                      ? "Finalize & send to pharmacy"
                      : "Waiting for service results…"
                    : "Add a prescription first"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function ComplaintEditor({
  visitId,
  initial,
}: {
  visitId: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const dirty = text.trim() !== initial.trim();

  // Persist whenever the doctor is done with the field (blur), not only on an
  // explicit Save — otherwise the complaint is lost when they type it and go
  // straight to ordering a lab/procedure.
  const save = () => {
    if (dirty) setVisitComplaint(visitId, text.trim());
  };

  return (
    <Field label="Complaint / history (recorded by doctor)">
      <div className="flex gap-2">
        <input
          className={`${inputClass} flex-1`}
          placeholder="e.g. Fever and headache for 3 days"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <Button variant="secondary" disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </Field>
  );
}

function ServiceOrderForm({ visitId }: { visitId: string }) {
  const [type, setType] = useState<Exclude<OrderType, "prescription">>("lab");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addServiceOrder(visitId, type, title, instructions);
    setTitle("");
    setInstructions("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-zinc-700">Order a service</h3>
      <Field label="Department">
        <select
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="lab">Lab</option>
          <option value="radiology">Radiology</option>
          <option value="procedure">Procedure</option>
        </select>
      </Field>
      <Field label="Test / procedure">
        <input
          className={inputClass}
          placeholder="e.g. CBC, Chest X-ray, Wound dressing"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Instructions (optional)">
        <input
          className={inputClass}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="secondary">
        Add order
      </Button>
    </form>
  );
}

type MedDraft = Omit<Med, "id" | "dispensed">;
const blankMed: MedDraft = {
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
};

function PrescriptionForm({ visitId }: { visitId: string }) {
  const [meds, setMeds] = useState<MedDraft[]>([{ ...blankMed }]);

  const update = (i: number, k: keyof MedDraft, value: string) =>
    setMeds((list) =>
      list.map((m, idx) => (idx === i ? { ...m, [k]: value } : m)),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = meds.filter((m) => m.name.trim());
    if (valid.length === 0) return;
    addPrescription(visitId, valid);
    setMeds([{ ...blankMed }]);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-zinc-700">Prescribe</h3>
      {meds.map((m, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input
            className={inputClass}
            placeholder="Medicine"
            value={m.name}
            onChange={(e) => update(i, "name", e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Dosage"
            value={m.dosage}
            onChange={(e) => update(i, "dosage", e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Frequency"
            value={m.frequency}
            onChange={(e) => update(i, "frequency", e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Duration"
            value={m.duration}
            onChange={(e) => update(i, "duration", e.target.value)}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMeds((l) => [...l, { ...blankMed }])}
        >
          + Add medicine
        </Button>
        <Button type="submit" variant="secondary" size="sm">
          Save prescription
        </Button>
      </div>
    </form>
  );
}
