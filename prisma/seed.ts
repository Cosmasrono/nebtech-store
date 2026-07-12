import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STAFF: { username: string; name: string; role: string; password: string }[] =
  [
    { username: "admin", name: "Administrator", role: "admin", password: "admin123" },
    { username: "reception", name: "Front Desk", role: "receptionist", password: "reception123" },
    { username: "nurse", name: "Triage Nurse", role: "nurse", password: "nurse123" },
    { username: "lab", name: "Lab Tech", role: "lab", password: "lab123" },
    { username: "radiology", name: "Radiology Tech", role: "radiology", password: "radiology123" },
    { username: "pharmacy", name: "Pharmacist", role: "pharmacist", password: "pharmacy123" },
    { username: "otieno", name: "Dr. Otieno", role: "doctor", password: "doctor123" },
    { username: "achieng", name: "Dr. Achieng", role: "doctor", password: "doctor123" },
    { username: "kamau", name: "Dr. Kamau", role: "doctor", password: "doctor123" },
    { username: "wanjiru", name: "Dr. Wanjiru", role: "doctor", password: "doctor123" },
  ];


  
// Pharmacy catalog: common stock for a small Kenyan clinic (prices in KSh).
const MEDICINES: {
  name: string;
  strength: string;
  form: string;
  unitPrice: number;
  stock: number;
}[] = [
  { name: "Paracetamol", strength: "500mg", form: "tablet", unitPrice: 5, stock: 500 },
  { name: "Ibuprofen", strength: "400mg", form: "tablet", unitPrice: 10, stock: 300 },
  { name: "Amoxicillin", strength: "500mg", form: "capsule", unitPrice: 15, stock: 200 },
  { name: "Amoxicillin", strength: "125mg/5ml", form: "syrup", unitPrice: 250, stock: 40 },
  { name: "Artemether-Lumefantrine", strength: "20/120", form: "tablet", unitPrice: 30, stock: 150 },
  { name: "Metronidazole", strength: "400mg", form: "tablet", unitPrice: 8, stock: 250 },
  { name: "Ciprofloxacin", strength: "500mg", form: "tablet", unitPrice: 20, stock: 150 },
  { name: "Cetirizine", strength: "10mg", form: "tablet", unitPrice: 10, stock: 200 },
  { name: "Omeprazole", strength: "20mg", form: "capsule", unitPrice: 15, stock: 180 },
  { name: "ORS", strength: "20.5g", form: "sachet", unitPrice: 20, stock: 100 },
  { name: "Zinc sulphate", strength: "20mg", form: "tablet", unitPrice: 10, stock: 120 },
  { name: "Salbutamol", strength: "100mcg", form: "inhaler", unitPrice: 450, stock: 25 },
  { name: "Hydrocortisone", strength: "1%", form: "cream", unitPrice: 150, stock: 30 },
  { name: "Diclofenac", strength: "1%", form: "gel", unitPrice: 200, stock: 30 },
  { name: "Vitamin B complex", strength: "—", form: "tablet", unitPrice: 5, stock: 300 },
];

async function ensureMedicines() {
  if ((await prisma.medicine.count()) > 0) {
    console.log("Medicines already present — skipping catalog seed.");
    return;
  }
  await prisma.medicine.createMany({ data: MEDICINES });
  console.log(`Seeded ${MEDICINES.length} medicines.`);
}

async function ensureStaff() {
  for (const s of STAFF) {
    const existing = await prisma.user.findUnique({
      where: { username: s.username },
    });
    if (existing) continue;
    await prisma.user.create({
      data: {
        username: s.username,
        name: s.name,
        role: s.role,
        passwordHash: await bcrypt.hash(s.password, 10),
        active: true,
      },
    });
    console.log(`Created user '${s.username}' (${s.role}).`);
  }
}

async function seedDemoPatients() {
  const doctors = await prisma.user.findMany({
    where: { role: "doctor", active: true },
    orderBy: { name: "asc" },
  });
  const doc1 = doctors[0]?.id ?? null;
  const doc2 = doctors[1]?.id ?? doc1;

  const amina = await prisma.patient.create({
    data: {
      mrn: "P-0001",
      nationalId: "29871234",
      firstName: "Amina",
      lastName: "Yusuf",
      gender: "female",
      age: 29,
      phone: "0712 000111",
    },
  });
  await prisma.visit.create({
    data: {
      patientId: amina.id,
      vitals: { weight: "62", temperature: "38.4", bloodPressure: "118/76" },
      priority: "urgent",
      complaint: "",
      assignedDoctorId: doc1,
      status: "waiting",
    },
  });

  const john = await prisma.patient.create({
    data: {
      mrn: "P-0002",
      nationalId: "11203344",
      firstName: "John",
      lastName: "Mwangi",
      gender: "male",
      age: 45,
      phone: "0722 333444",
    },
  });
  await prisma.visit.create({
    data: {
      patientId: john.id,
      vitals: { weight: "", temperature: "", bloodPressure: "" },
      complaint: "",
      assignedDoctorId: doc2,
      status: "awaiting-triage",
    },
  });
  console.log("Seeded 2 demo patients.");
}

async function main() {
  await ensureStaff();
  await ensureMedicines();

  if (process.argv.includes("--reset-demo")) {
    await prisma.order.deleteMany();
    await prisma.visit.deleteMany();
    await prisma.patient.deleteMany();
    console.log("Cleared existing patients/visits/orders.");
  }

  if ((await prisma.patient.count()) === 0) {
    await seedDemoPatients();
  } else {
    console.log("Patients already present — skipping demo seed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
