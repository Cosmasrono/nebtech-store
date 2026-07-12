// Domain model for the clinic/hospital management system.
//
// These types are storage-agnostic on purpose. Today they are persisted in
// localStorage (see store.ts); later the exact same shapes map to Prisma
// models backed by MongoDB. Keeping the domain here means the UI never has to
// change when the storage engine does.

export type ID = string;

/** Where the patient physically is in their journey right now. */
export type VisitStatus =
  | "awaiting-triage" // registered, nurse to take vitals
  | "waiting" // triaged, waiting for the doctor
  | "with-doctor" // doctor is consulting
  | "awaiting-services" // doctor ordered lab/radiology/procedure
  | "back-to-doctor" // services done, doctor reviews results
  | "awaiting-pharmacy" // doctor finalized, meds to dispense
  | "completed"; // visit closed

/** Triage priority set by the nurse. Drives ordering of the doctor queue. */
export type Priority = "normal" | "urgent" | "emergency";

/** The kinds of work a doctor can order during a visit. */
export type OrderType = "lab" | "radiology" | "procedure" | "prescription";

export type OrderStatus = "requested" | "in-progress" | "completed";

export type Gender = "male" | "female" | "other";

/** One step of a visit's journey — when it entered each status. */
export interface StageEvent {
  status: VisitStatus;
  at: string;
}

export interface Patient {
  id: ID;
  mrn: string; // human-friendly medical record number, e.g. "P-0001"
  nationalId: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  phone: string;
  registeredById?: ID; // staff member who onboarded them
  createdAt: string;
}

/** Vitals are taken at reception and belong to the visit (they change every
 *  time the patient comes in). Stored as strings so fields can be left blank. */
export interface Vitals {
  weight: string; // kg
  temperature: string; // °C
  bloodPressure: string; // e.g. "120/80"
}

/** A member of staff in a department. Kept minimal for now (no login yet) —
 *  this grows into a full User with role + credentials later. */
export interface Doctor {
  id: ID;
  name: string;
}

export interface Visit {
  id: ID;
  patientId: ID;
  vitals: Vitals; // captured at the triage station
  priority?: Priority; // set at triage
  complaint: string; // recorded by the doctor during consultation
  assignedDoctorId?: ID; // which doctor this visit is routed to
  status: VisitStatus;
  timeline?: StageEvent[]; // timestamped status history, check-in → completed
  payment?: Payment; // set when the pharmacy POS closes the visit
  saleItems?: SaleItem[]; // what the pharmacy actually sold at checkout
  createdAt: string;
  updatedAt: string;
}

/** A single prescribed medicine line (what the doctor wrote). */
export interface Med {
  id: ID;
  name: string;
  dosage: string; // e.g. "500mg"
  frequency: string; // e.g. "twice daily"
  duration: string; // e.g. "5 days"
  dispensed: boolean;
}

/** A stocked product in the pharmacy catalog, searchable at the POS. */
export interface Medicine {
  id: ID;
  name: string;
  strength: string; // e.g. "500mg", "20/120"
  form: string; // tablet | capsule | syrup | inhaler | cream | sachet
  unitPrice: number;
  stock: number;
}

/** One line of a pharmacy sale. Name/price are copied from the catalog at
 *  checkout so history stays correct if the catalog changes later. */
export interface SaleItem {
  medicineId: ID;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type PaymentMethod = "cash" | "mpesa" | "card";

/** Recorded at the pharmacy POS when the visit is paid for and closed. */
export interface Payment {
  amount: number;
  method: PaymentMethod;
  reference?: string; // e.g. M-Pesa transaction code
  paidAt: string;
}

/**
 * An order is any actionable item the doctor creates on a visit. Service
 * orders (lab/radiology/procedure) carry a `result`; a prescription order
 * carries `meds`. Modelling all of them uniformly is what lets one visit fan
 * out to several departments at once and come back together.
 */
export interface Order {
  id: ID;
  visitId: ID;
  type: OrderType;
  title: string; // e.g. "Chest X-ray", "CBC", "Wound dressing"
  instructions?: string;
  status: OrderStatus;
  result?: string; // filled by lab/radiology/procedure
  meds?: Med[]; // only for type === "prescription"
  createdAt: string;
  completedAt?: string;
}

export interface ClinicData {
  doctors: Doctor[];
  patients: Patient[];
  visits: Visit[];
  orders: Order[];
  medicines: Medicine[];
}
