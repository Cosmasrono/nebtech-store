"use client";

import { useSyncExternalStore } from "react";
import type {
  ClinicData,
  Gender,
  ID,
  Med,
  OrderType,
  Patient,
  PaymentMethod,
  Priority,
  Visit,
  Vitals,
} from "./types";
import { notify } from "./toast";

const EMPTY: ClinicData = {
  doctors: [],
  patients: [],
  visits: [],
  orders: [],
  medicines: [],
};

let state: ClinicData = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function setData(next: ClinicData) {
  state = next;
  listeners.forEach((l) => l());
}

async function hydrate() {
  try {
    const res = await fetch("/api/clinic");
    if (res.ok) setData(await res.json());
  } catch (err) {
    console.error("Failed to load clinic data", err);
  }
}

type ActResult = { data: ClinicData | null; error: string | null };

const ACTION_SUCCESS_MESSAGES: Record<string, string> = {
  registerPatient: "Patient registered and checked in.",
  startVisit: "Patient checked in.",
  recordTriage: "Triage saved and patient sent to doctor.",
  assignVisitDoctor: "Doctor assignment updated.",
  startConsult: "Consultation started.",
  setVisitComplaint: "Complaint saved.",
  addServiceOrder: "Service order added.",
  addPrescription: "Prescription saved.",
  startServiceOrder: "Service order marked in progress.",
  completeServiceOrder: "Result saved and patient returned to doctor.",
  sendToPharmacy: "Patient sent to pharmacy.",
  toggleMedDispensed: "Medicine status updated.",
  dispenseAndClose: "Visit closed.",
  checkoutVisit: "Payment recorded and visit closed.",
  addMedicine: "Medicine added to catalog.",
  updateMedicine: "Medicine updated.",
};

/** Send a mutation, adopt the fresh dataset, and return it so callers can pick
 *  up server-generated values (e.g. a new visit's id) or a rejection message
 *  (e.g. the chosen doctor is already busy → HTTP 409). */
async function act(action: string, payload?: unknown): Promise<ActResult> {
  try {
    const res = await fetch("/api/clinic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const error = body.error ?? "Action rejected";
      notify("error", error);
      return { data: null, error };
    }
    if (!res.ok) {
      console.error(`Action ${action} failed`, await res.text());
      notify("error", "Action failed.");
      return { data: null, error: "Action failed" };
    }
    const data: ClinicData = await res.json();
    setData(data);
    const message = ACTION_SUCCESS_MESSAGES[action];
    if (message) notify("success", message);
    return { data, error: null };
  } catch (err) {
    console.error(`Action ${action} failed`, err);
    notify("error", "Network error. Please try again.");
    return { data: null, error: "Network error" };
  }
}

// --- React binding ---------------------------------------------------------

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!loaded) {
    loaded = true;
    void hydrate();
  }
  return () => listeners.delete(cb);
}

export function useClinic(): ClinicData {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

export function refresh() {
  return hydrate();
}

// Pick the most recently created open visit for a patient out of a dataset.
function latestOpenVisit(data: ClinicData, patientId: ID): Visit | undefined {
  return [...data.visits]
    .reverse()
    .find((v) => v.patientId === patientId && v.status !== "completed");
}

// ---------------------------------------------------------------------------
// ACTIONS
// ---------------------------------------------------------------------------

/** Returns the patient & visit the server created, so reception can chain a
 *  triage write against the new visit. */
export async function registerPatient(input: {
  nationalId: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  phone: string;
  assignedDoctorId?: ID;
}): Promise<
  { error: string } | { patient: Patient; visit: Visit | undefined }
> {
  const { data, error } = await act("registerPatient", input);
  if (error) return { error };
  if (!data) return { error: "Registration failed" };
  const patient = [...data.patients]
    .reverse()
    .find((p) => p.nationalId === input.nationalId);
  if (!patient) return { error: "Registration failed" };
  return { patient, visit: latestOpenVisit(data, patient.id) };
}

/** Returns the newly created visit so reception can record triage against it. */
export async function startVisit(
  patientId: ID,
  assignedDoctorId?: ID,
): Promise<{ error: string } | { visit: Visit | undefined }> {
  const { data, error } = await act("startVisit", {
    patientId,
    assignedDoctorId,
  });
  if (error) return { error };
  if (!data) return { error: "Check-in failed" };
  return { visit: latestOpenVisit(data, patientId) };
}

export function recordTriage(visitId: ID, vitals: Vitals, priority: Priority) {
  return act("recordTriage", { visitId, vitals, priority });
}

/** Returns an error message if the doctor is already busy, else null. */
export async function assignVisitDoctor(visitId: ID, doctorId: ID) {
  const { error } = await act("assignVisitDoctor", { visitId, doctorId });
  return error;
}

export function startConsult(visitId: ID) {
  return act("startConsult", { visitId });
}

export function setVisitComplaint(visitId: ID, complaint: string) {
  return act("setVisitComplaint", { visitId, complaint });
}

export function addServiceOrder(
  visitId: ID,
  type: Exclude<OrderType, "prescription">,
  title: string,
  instructions?: string,
) {
  return act("addServiceOrder", { visitId, type, title, instructions });
}

export function addPrescription(
  visitId: ID,
  meds: Omit<Med, "id" | "dispensed">[],
) {
  return act("addPrescription", { visitId, meds });
}

export function completeServiceOrder(orderId: ID, result: string) {
  return act("completeServiceOrder", { orderId, result });
}

export function startServiceOrder(orderId: ID) {
  return act("startServiceOrder", { orderId });
}

export function sendToPharmacy(visitId: ID) {
  return act("sendToPharmacy", { visitId });
}

export function toggleMedDispensed(orderId: ID, medId: ID) {
  return act("toggleMedDispensed", { orderId, medId });
}

export function dispenseAndClose(visitId: ID) {
  return act("dispenseAndClose", { visitId });
}

/** Add a medicine to the pharmacy catalog. Returns an error message on
 *  rejection (e.g. duplicate name+strength), else null. */
export async function addMedicine(input: {
  name: string;
  strength: string;
  form: string;
  unitPrice: number;
  stock: number;
}) {
  const { error } = await act("addMedicine", input);
  return error;
}

/** Update a catalog medicine's price and/or stock. Returns an error message
 *  on rejection, else null. */
export async function updateMedicine(
  id: ID,
  changes: { unitPrice?: number; stock?: number },
) {
  const { error } = await act("updateMedicine", { id, ...changes });
  return error;
}

/** Pharmacy POS: sell the carted medicines, take payment, close the visit.
 *  Returns an error message on rejection (e.g. out of stock), else null. */
export async function checkoutVisit(
  visitId: ID,
  method: PaymentMethod,
  reference: string,
  items: { medicineId: ID; quantity: number }[],
) {
  const { error } = await act("checkoutVisit", {
    visitId,
    method,
    reference,
    items,
  });
  return error;
}
