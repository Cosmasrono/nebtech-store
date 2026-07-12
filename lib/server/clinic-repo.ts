

import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { mpesaConfigured } from "@/lib/server/mpesa";
import type {
  ClinicData,
  Doctor,
  Gender,
  ID,
  Med,
  Medicine,
  Order,
  OrderStatus,
  OrderType,
  Patient,
  Payment,
  PaymentMethod,
  Priority,
  Visit,
  VisitStatus,
  Vitals,
} from "@/lib/types";

// --- row → domain mappers --------------------------------------------------

type PatientRow = Awaited<ReturnType<typeof prisma.patient.findFirstOrThrow>>;
type VisitRow = Awaited<ReturnType<typeof prisma.visit.findFirstOrThrow>>;
type OrderRow = Awaited<ReturnType<typeof prisma.order.findFirstOrThrow>>;
type UserRow = Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>;
type MedicineRow = Awaited<ReturnType<typeof prisma.medicine.findFirstOrThrow>>;

// The "doctor roster" reception assigns to is just the active doctor users.
function mapDoctor(u: UserRow): Doctor {
  return { id: u.id, name: u.name };
}

function mapPatient(p: PatientRow): Patient {
  return {
    id: p.id,
    mrn: p.mrn,
    nationalId: p.nationalId,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender as Gender,
    age: p.age,
    phone: p.phone,
    registeredById: p.registeredById ?? undefined,
    createdAt: p.createdAt.toISOString(),
  };
}

function mapVisit(v: VisitRow): Visit {
  return {
    id: v.id,
    patientId: v.patientId,
    vitals: v.vitals as Vitals,
    priority: (v.priority ?? undefined) as Priority | undefined,
    complaint: v.complaint,
    assignedDoctorId: v.assignedDoctorId ?? undefined,
    status: v.status as VisitStatus,
    payment: v.payment
      ? {
          amount: v.payment.amount,
          method: v.payment.method as PaymentMethod,
          reference: v.payment.reference ?? undefined,
          paidAt: v.payment.paidAt.toISOString(),
        }
      : undefined,
    saleItems: v.saleItems.length > 0 ? v.saleItems : undefined,
    timeline: v.timeline.map((e) => ({
      status: e.status as VisitStatus,
      at: e.at.toISOString(),
    })),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

/** Prisma fragment: append "the visit just entered this status" to the
 *  timeline, so the journey from reception to completed is timestamped. */
function stage(status: VisitStatus) {
  return { push: { status, at: new Date() } };
}

function mapMedicine(m: MedicineRow): Medicine {
  return {
    id: m.id,
    name: m.name,
    strength: m.strength,
    form: m.form,
    unitPrice: m.unitPrice,
    stock: m.stock,
  };
}

function mapOrder(o: OrderRow): Order {
  return {
    id: o.id,
    visitId: o.visitId,
    type: o.type as OrderType,
    title: o.title,
    instructions: o.instructions ?? undefined,
    status: o.status as OrderStatus,
    result: o.result ?? undefined,
    meds: (o.meds as Med[] | undefined)?.length ? (o.meds as Med[]) : undefined,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.completedAt ? o.completedAt.toISOString() : undefined,
  };
}

// --- absences ----------------------------------------------------------------

/** UTC-midnight bounds of today's calendar date. Activity dates arrive as
 *  "YYYY-MM-DD" strings, so they are stored as UTC midnights of the picked
 *  day — compare against the same representation. */
function todayBounds() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Users with an approved absence in effect right now — a leave range that
 *  spans today, or an excuse whose leave→return window contains this moment.
 *  They vanish from the doctor roster and become active again automatically
 *  the moment the window lapses. */
async function absentUserIds(): Promise<Set<ID>> {
  const now = new Date();
  const { start, end } = todayBounds();
  const absences = await prisma.activityRequest.findMany({
    where: {
      status: "approved",
      OR: [
        { type: "leave", startDate: { lt: end }, endDate: { gte: start } },
        { type: "excuse", excuseDate: { gte: start, lt: end } },
      ],
    },
    select: { userId: true, type: true, excuseStart: true, excuseEnd: true },
  });

  const away = new Set<ID>();
  for (const a of absences) {
    if (a.type === "leave") {
      away.add(a.userId);
    } else if (a.excuseStart && a.excuseEnd) {
      // Timed excuse: away only between leaving and the return time.
      if (a.excuseStart <= now && now < a.excuseEnd) away.add(a.userId);
    } else {
      // Legacy excuse without a time: err on the side of the whole day.
      away.add(a.userId);
    }
  }
  return away;
}

/** Rejects routing a patient to a doctor who is away today. The roster
 *  already hides them; this guards against stale clients. */
async function doctorAbsentError(
  doctorId: ID | null | undefined,
): Promise<string | null> {
  if (!doctorId) return null;
  return (await absentUserIds()).has(doctorId)
    ? "That doctor is away today (approved leave or excuse). Please choose another doctor."
    : null;
}

// --- reads -----------------------------------------------------------------

/** Every staff member sees the whole clinic: all patients, their visit
 *  statuses and timings. (Who registered a patient is still recorded on the
 *  record, it just doesn't restrict visibility.) */
export async function getClinicData(): Promise<ClinicData> {
  const [allDoctors, absent, patients, visits, orders, medicines] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "doctor", active: true },
        orderBy: { name: "asc" },
      }),
      absentUserIds(),
      prisma.patient.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.visit.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.order.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.medicine.findMany({ orderBy: { name: "asc" } }),
    ]);

  // Staff away today (approved leave/excuse) are not offered for assignment.
  const doctors = allDoctors.filter((d) => !absent.has(d.id));

  return {
    doctors: doctors.map(mapDoctor),
    patients: patients.map(mapPatient),
    visits: visits.map(mapVisit),
    orders: orders.map(mapOrder),
    medicines: medicines.map(mapMedicine),
  };
}

// --- writes ----------------------------------------------------------------

const EMPTY_VITALS: Vitals = { weight: "", temperature: "", bloodPressure: "" };

// Doctors take an unlimited queue: reception allocates as many patients as it
// likes and each doctor works through their own queue in priority order, so
// there is no "doctor is busy" rejection on assignment.

export async function registerPatient(input: {
  nationalId: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  age: number;
  phone: string;
  assignedDoctorId?: ID;
  registeredById?: ID; // stamped from the session by the API route
}) {
  const away = await doctorAbsentError(input.assignedDoctorId);
  if (away) return { error: away };

  // Never create a second record for the same national ID — the client's
  // lookup runs against a snapshot that may be stale.
  const nationalId = input.nationalId.trim();
  const existing = await prisma.patient.findFirst({
    where: { nationalId: { equals: nationalId, mode: "insensitive" } },
  });
  if (existing) {
    return {
      error: `A patient with national ID ${nationalId} is already registered (${existing.mrn} · ${existing.firstName} ${existing.lastName}). Use Find to check them in instead.`,
    };
  }

  const count = await prisma.patient.count();
  const mrn = `P-${String(count + 1).padStart(4, "0")}`;
  const patient = await prisma.patient.create({
    data: {
      mrn,
      nationalId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      gender: input.gender,
      age: input.age,
      phone: input.phone.trim(),
      registeredById: input.registeredById || null,
    },
  });
  await prisma.visit.create({
    data: {
      patientId: patient.id,
      vitals: EMPTY_VITALS,
      complaint: "",
      assignedDoctorId: input.assignedDoctorId || null,
      status: "awaiting-triage",
      timeline: [{ status: "awaiting-triage", at: new Date() }],
    },
  });
}

export async function startVisit(input: {
  patientId: ID;
  assignedDoctorId?: ID;
}) {
  const away = await doctorAbsentError(input.assignedDoctorId);
  if (away) return { error: away };

  // One open visit per patient — guards against double-clicks and stale UIs.
  const open = await prisma.visit.findFirst({
    where: { patientId: input.patientId, status: { not: "completed" } },
  });
  if (open) {
    return { error: "This patient already has an active visit." };
  }

  await prisma.visit.create({
    data: {
      patientId: input.patientId,
      vitals: EMPTY_VITALS,
      complaint: "",
      assignedDoctorId: input.assignedDoctorId || null,
      status: "awaiting-triage",
      timeline: [{ status: "awaiting-triage", at: new Date() }],
    },
  });
}

export async function recordTriage(input: {
  visitId: ID;
  vitals: Vitals;
  priority: Priority;
}) {
  await prisma.visit.update({
    where: { id: input.visitId },
    data: {
      vitals: { set: input.vitals },
      priority: input.priority,
      status: "waiting",
      timeline: stage("waiting"),
    },
  });
}

export async function assignVisitDoctor(input: { visitId: ID; doctorId: ID }) {
  const away = await doctorAbsentError(input.doctorId);
  if (away) return { error: away };

  await prisma.visit.update({
    where: { id: input.visitId },
    data: { assignedDoctorId: input.doctorId },
  });
}

// --- user management (admin) ----------------------------------------------



export interface StaffUser {
  id: ID;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

function mapUser(u: UserRow): StaffUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as Role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function userCount(): Promise<number> {
  return prisma.user.count();
}

/** First-run setup: create the very first admin. Refuses once any user exists. */
export async function bootstrapAdmin(input: {
  name: string;
  username: string;
  password: string;
}): Promise<{ error: string } | { user: StaffUser }> {
  if ((await prisma.user.count()) > 0) {
    return { error: "Setup has already been completed." };
  }
  const username = input.username.trim().toLowerCase();
  if (!username || !input.name.trim() || !input.password) {
    return { error: "Name, username and password are all required." };
  }
  const user = await prisma.user.create({
    data: {
      username,
      name: input.name.trim(),
      role: "admin",
      passwordHash: await hashPassword(input.password),
      active: true,
    },
  });
  return { user: mapUser(user) };
}

export async function listUsers(): Promise<StaffUser[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(mapUser);
}

export async function createUser(input: {
  username: string;
  name: string;
  role: Role;
  password: string;
}): Promise<{ error: string } | { user: StaffUser }> {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.name.trim() || !input.password) {
    return { error: "Username, name and password are required." };
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: "That username is already taken." };

  const user = await prisma.user.create({
    data: {
      username,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.password),
      active: true,
    },
  });
  return { user: mapUser(user) };
}

export async function updateUser(input: {
  id: ID;
  role?: Role;
  active?: boolean;
  password?: string;
}): Promise<{ error: string } | { user: StaffUser }> {
  const data: {
    role?: string;
    active?: boolean;
    passwordHash?: string;
  } = {};
  if (input.role) data.role = input.role;
  if (typeof input.active === "boolean") data.active = input.active;
  if (input.password) data.passwordHash = await hashPassword(input.password);
  const user = await prisma.user.update({ where: { id: input.id }, data });
  return { user: mapUser(user) };
}

// --- medicine catalog (admin) -----------------------------------------------

export async function addMedicine(input: {
  name: string;
  strength: string;
  form: string;
  unitPrice: number;
  stock: number;
}): Promise<{ error: string } | void> {
  const name = input.name?.trim();
  const strength = input.strength?.trim() ?? "";
  const form = input.form?.trim();
  if (!name || !form) return { error: "Name and form are required." };

  const unitPrice = Number(input.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { error: "Enter a valid unit price." };
  }
  const stock = Math.max(0, Math.round(Number(input.stock) || 0));

  // One catalog entry per name+strength — restock the existing one instead.
  const existing = await prisma.medicine.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      strength: { equals: strength, mode: "insensitive" },
    },
  });
  if (existing) {
    return {
      error: `${existing.name} ${existing.strength} is already in the catalog — update its stock or price in the list instead.`,
    };
  }

  await prisma.medicine.create({
    data: { name, strength, form, unitPrice, stock },
  });
}

export async function updateMedicine(input: {
  id: ID;
  unitPrice?: number;
  stock?: number;
}): Promise<{ error: string } | void> {
  const data: { unitPrice?: number; stock?: number } = {};
  if (input.unitPrice !== undefined) {
    const unitPrice = Number(input.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: "Enter a valid unit price." };
    }
    data.unitPrice = unitPrice;
  }
  if (input.stock !== undefined) {
    const stock = Math.round(Number(input.stock));
    if (!Number.isFinite(stock) || stock < 0) {
      return { error: "Stock must be zero or more." };
    }
    data.stock = stock;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.medicine.update({ where: { id: input.id }, data });
}

export async function startConsult(input: { visitId: ID }) {
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { status: "with-doctor", timeline: stage("with-doctor") },
  });
}

export async function setVisitComplaint(input: {
  visitId: ID;
  complaint: string;
}) {
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { complaint: input.complaint },
  });
}

export async function addServiceOrder(input: {
  visitId: ID;
  type: Exclude<OrderType, "prescription">;
  title: string;
  instructions?: string;
}) {
  await prisma.order.create({
    data: {
      visitId: input.visitId,
      type: input.type,
      title: input.title.trim(),
      instructions: input.instructions?.trim() || null,
      status: "requested",
    },
  });
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { status: "awaiting-services", timeline: stage("awaiting-services") },
  });
}

export async function addPrescription(input: {
  visitId: ID;
  meds: Omit<Med, "id" | "dispensed">[];
}) {
  const meds: Med[] = input.meds.map((m) => ({
    ...m,
    id: crypto.randomUUID(),
    dispensed: false,
  }));
  await prisma.order.create({
    data: {
      visitId: input.visitId,
      type: "prescription",
      title: "Prescription",
      status: "requested",
      meds,
    },
  });
}

export async function startServiceOrder(input: { orderId: ID }) {
  await prisma.order.update({
    where: { id: input.orderId },
    data: { status: "in-progress" },
  });
}

export async function completeServiceOrder(input: {
  orderId: ID;
  result: string;
}) {
  const order = await prisma.order.update({
    where: { id: input.orderId },
    data: {
      status: "completed",
      result: input.result,
      completedAt: new Date(),
    },
  });
  // Return the patient to the doctor only once every ordered service is done.
  const stillPending = await prisma.order.count({
    where: {
      visitId: order.visitId,
      type: { not: "prescription" },
      status: { not: "completed" },
    },
  });
  if (stillPending === 0) {
    await prisma.visit.update({
      where: { id: order.visitId },
      data: { status: "back-to-doctor", timeline: stage("back-to-doctor") },
    });
  }
}

export async function sendToPharmacy(input: { visitId: ID }) {
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { status: "awaiting-pharmacy", timeline: stage("awaiting-pharmacy") },
  });
}

export async function toggleMedDispensed(input: {
  orderId: ID;
  medId: ID;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });
  if (!order?.meds) return;
  const meds = (order.meds as Med[]).map((m) =>
    m.id === input.medId ? { ...m, dispensed: !m.dispensed } : m,
  );
  await prisma.order.update({
    where: { id: input.orderId },
    data: { meds: { set: meds } },
  });
}

export async function dispenseAndClose(input: { visitId: ID }) {
  await prisma.order.updateMany({
    where: { visitId: input.visitId, type: "prescription" },
    data: { status: "completed", completedAt: new Date() },
  });
  await prisma.visit.update({
    where: { id: input.visitId },
    data: { status: "completed", timeline: stage("completed") },
  });
}

/** Pharmacy POS: sell the carted medicines from the catalog, take the payment,
 *  and close the visit. Prices come from the catalog (never the client) and
 *  stock is checked and decremented here. */
export async function checkoutVisit(input: {
  visitId: ID;
  method: PaymentMethod;
  reference?: string;
  items: { medicineId: ID; quantity: number }[];
}): Promise<{ error: string } | { payment: Payment }> {
  const items = (input.items ?? []).map((i) => ({
    medicineId: i.medicineId,
    quantity: Math.max(1, Math.round(i.quantity)),
  }));
  if (items.length === 0) {
    return { error: "The cart is empty — add at least one medicine." };
  }

  // A retried checkout (e.g. the response got lost after an M-Pesa success)
  // must not sell the cart twice: hand back the payment already recorded.
  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
  });
  if (!visit) return { error: "Visit not found." };
  if (visit.status === "completed") {
    if (visit.payment) {
      return {
        payment: {
          amount: visit.payment.amount,
          method: visit.payment.method as PaymentMethod,
          reference: visit.payment.reference ?? undefined,
          paidAt: visit.payment.paidAt.toISOString(),
        },
      };
    }
    return { error: "This visit is already closed." };
  }

  const medicines = await prisma.medicine.findMany({
    where: { id: { in: items.map((i) => i.medicineId) } },
  });
  const byId = new Map(medicines.map((m) => [m.id, m]));

  const saleItems: {
    medicineId: ID;
    name: string;
    quantity: number;
    unitPrice: number;
  }[] = [];
  for (const item of items) {
    const med = byId.get(item.medicineId);
    if (!med) return { error: "A carted medicine no longer exists." };
    if (med.stock < item.quantity) {
      return {
        error: `Not enough ${med.name} ${med.strength} in stock (${med.stock} left).`,
      };
    }
    saleItems.push({
      medicineId: med.id,
      name: `${med.name} ${med.strength}`.trim(),
      quantity: item.quantity,
      unitPrice: med.unitPrice,
    });
  }
  const total = saleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // With Daraja configured, an M-Pesa checkout must point at a transaction we
  // actually saw succeed, for the same amount. `reference` is the
  // CheckoutRequestID from the STK push; the receipt becomes the reference.
  let reference = input.reference?.trim() || undefined;
  if (input.method === "mpesa" && mpesaConfigured()) {
    const tx = reference
      ? await prisma.mpesaTransaction.findUnique({
          where: { checkoutRequestId: reference },
        })
      : null;
    if (!tx) {
      return { error: "Send the M-Pesa request and wait for it to confirm." };
    }
    if (tx.status !== "success") {
      return { error: "The M-Pesa payment has not been confirmed yet." };
    }
    if (tx.amount !== Math.max(1, Math.round(total))) {
      return {
        error:
          "The cart changed after the M-Pesa request. Send a new payment request.",
      };
    }
    if (tx.visitId && tx.visitId !== input.visitId) {
      return { error: "That M-Pesa payment was used for another visit." };
    }
    await prisma.mpesaTransaction.update({
      where: { checkoutRequestId: tx.checkoutRequestId },
      data: { visitId: input.visitId },
    });
    reference = tx.receipt ?? tx.checkoutRequestId;
  }

  // One transaction: a failure mid-way must not leave stock decremented
  // without the visit closed (or vice versa), or a retry would sell twice.
  const paidAt = new Date();
  await prisma.$transaction([
    ...items.map((item) =>
      prisma.medicine.update({
        where: { id: item.medicineId },
        data: { stock: { decrement: item.quantity } },
      }),
    ),
    prisma.order.updateMany({
      where: { visitId: input.visitId, type: "prescription" },
      data: { status: "completed", completedAt: new Date() },
    }),
    prisma.visit.update({
      where: { id: input.visitId },
      data: {
        status: "completed",
        timeline: stage("completed"),
        saleItems,
        payment: {
          set: {
            amount: total,
            method: input.method,
            reference: reference ?? null,
            paidAt,
          },
        },
      },
    }),
  ]);
  return {
    payment: {
      amount: total,
      method: input.method,
      reference,
      paidAt: paidAt.toISOString(),
    },
  };
}

 
