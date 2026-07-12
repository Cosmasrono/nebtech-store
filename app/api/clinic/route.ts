// REST boundary between the browser and MongoDB.
//   GET  /api/clinic        → the whole dataset (doctors, patients, visits, orders)
//   POST /api/clinic        → { action, payload }, performs the mutation and
//                             returns the fresh dataset so the client stays in sync.

import { NextResponse } from "next/server";
import * as repo from "@/lib/server/clinic-repo";
import { getSession } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";

// Prisma needs the Node.js runtime, and reads must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const data = await repo.getClinicData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/clinic failed", err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}

// Which roles may perform each mutation. Admins may perform any of them.
// Mirrors the station that owns the action, so a user at one station cannot
// drive another station's workflow through the API.
const ACTION_ROLES: Record<string, Role[]> = {
  registerPatient: ["receptionist", "nurse"],
  startVisit: ["receptionist", "nurse"],
  recordTriage: ["receptionist", "nurse"],
  assignVisitDoctor: ["receptionist", "nurse", "doctor"],
  startConsult: ["doctor"],
  setVisitComplaint: ["doctor"],
  addServiceOrder: ["doctor"],
  addPrescription: ["doctor"],
  startServiceOrder: ["lab", "radiology"],
  completeServiceOrder: ["lab", "radiology"],
  sendToPharmacy: ["doctor"],
  toggleMedDispensed: ["pharmacist"],
  dispenseAndClose: ["pharmacist"],
  checkoutVisit: ["pharmacist"],
  // Catalog management: pharmacists restock day-to-day; admins always can.
  addMedicine: ["pharmacist"],
  updateMedicine: ["pharmacist"],
};

// Map each action name to its repository handler.
const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {
  registerPatient: (p) => repo.registerPatient(p as never),
  startVisit: (p) => repo.startVisit(p as never),
  recordTriage: (p) => repo.recordTriage(p as never),
  assignVisitDoctor: (p) => repo.assignVisitDoctor(p as never),
  startConsult: (p) => repo.startConsult(p as never),
  setVisitComplaint: (p) => repo.setVisitComplaint(p as never),
  addServiceOrder: (p) => repo.addServiceOrder(p as never),
  addPrescription: (p) => repo.addPrescription(p as never),
  startServiceOrder: (p) => repo.startServiceOrder(p as never),
  completeServiceOrder: (p) => repo.completeServiceOrder(p as never),
  sendToPharmacy: (p) => repo.sendToPharmacy(p as never),
  toggleMedDispensed: (p) => repo.toggleMedDispensed(p as never),
  dispenseAndClose: (p) => repo.dispenseAndClose(p as never),
  checkoutVisit: (p) => repo.checkoutVisit(p as never),
  addMedicine: (p) => repo.addMedicine(p as never),
  updateMedicine: (p) => repo.updateMedicine(p as never),
};

export async function POST(req: Request) {
  try {
    const { action, payload } = await req.json();
    const handler = handlers[action];
    if (!handler) {
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 },
      );
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      session.role !== "admin" &&
      !ACTION_ROLES[action]?.includes(session.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Registrations are stamped with the logged-in user server-side, so a
    // client can never claim someone else onboarded the patient.
    const input =
      action === "registerPatient"
        ? { ...payload, registeredById: session.id }
        : payload;
    const result = await handler(input);
    // A rejected mutation (e.g. doctor already busy) reports { error }.
    if (result && typeof result === "object" && "error" in result) {
      return NextResponse.json(result, { status: 409 });
    }
    const data = await repo.getClinicData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("POST /api/clinic failed", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
