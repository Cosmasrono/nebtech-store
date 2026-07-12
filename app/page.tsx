// Public landing page — the only page reachable without a session. Staff sign
// in via the header button; everything else stays behind the middleware.

import Image from "next/image";
import Link from "next/link";

const SERVICES = [
  {
    title: "Consultation & Diagnosis",
    text: "Experienced doctors review your history, examine you and walk you through every result on screen.",
    img: "/images/consultation.jpg",
    alt: "Doctor discussing scan results with a patient",
  },
  {
    title: "Laboratory",
    text: "An on-site lab runs your samples the same day, so treatment starts without the wait.",
    img: "/images/lab.jpg",
    alt: "Laboratory technician pipetting samples",
  },
  {
    title: "Procedures & Theatre",
    text: "A fully equipped modern theatre for minor and day-case procedures, with careful follow-up.",
    img: "/images/theatre.jpg",
    alt: "Modern operating theatre",
  },
  {
    title: "Pharmacy",
    text: "Prescriptions are dispensed in-house the moment your doctor signs them off.",
    img: "/images/pharmacy.jpg",
    alt: "Prescription medication at the pharmacy",
  },
  {
    title: "Inpatient Ward",
    text: "Clean, calm recovery beds for patients who need observation or a longer stay.",
    img: "/images/ward.jpg",
    alt: "Bright hospital ward with beds",
  },
  {
    title: "Surgical Team",
    text: "Surgeons, anaesthetists and theatre nurses who have worked together for years.",
    img: "/images/operation.jpg",
    alt: "Surgeons performing an operation",
  },
];

const FLOW = [
  { step: "1", label: "Reception", text: "Register and get triaged by a nurse" },
  { step: "2", label: "Doctor", text: "Consultation, exams and orders" },
  { step: "3", label: "Lab / Radiology", text: "Tests and imaging done on site" },
  { step: "4", label: "Pharmacy", text: "Collect your medication and go home" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-teal-950/5 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-lg text-white shadow-inner shadow-white/20">
              ✚
            </span>
            <div>
              <p className="font-display text-base font-semibold leading-tight text-teal-950">
                CareFlow
              </p>
              <p className="text-xs text-zinc-500">Clinic &amp; Diagnostics</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-600 sm:flex">
            <a href="#services" className="transition-colors hover:text-teal-700">
              Services
            </a>
            <a href="#visit" className="transition-colors hover:text-teal-700">
              Your visit
            </a>
            <a href="#contact" className="transition-colors hover:text-teal-700">
              Contact
            </a>
          </nav>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white shadow-sm shadow-teal-950/20 transition-colors hover:bg-teal-800"
          >
            Staff sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-10%,#ccfbf1_0%,transparent_60%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800 ring-1 ring-inset ring-teal-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
              Walk-ins welcome, every day
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-teal-950 sm:text-[3.4rem] sm:leading-[1.08]">
              Care that moves with you, from reception to pharmacy
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-600">
              CareFlow is a full-service outpatient clinic. One visit covers your
              consultation, lab work, imaging and medication — no referrals, no
              second trips, no losing your file between departments.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#services"
                className="inline-flex h-11 items-center rounded-full bg-teal-700 px-6 text-sm font-medium text-white shadow-sm shadow-teal-950/20 transition-colors hover:bg-teal-800"
              >
                Explore our services
              </a>
              <a
                href="#contact"
                className="inline-flex h-11 items-center rounded-full border border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-teal-700/30 hover:bg-teal-50/60 hover:text-teal-900"
              >
                Contact us
              </a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-center">
              {[
                ["7", "days a week"],
                ["6", "departments"],
                ["1", "patient record"],
              ].map(([n, label]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-teal-950/[0.07] bg-white p-3 shadow-[0_1px_2px_rgb(4_47_43/0.04),0_12px_32px_-16px_rgb(4_47_43/0.16)]"
                >
                  <dt className="font-display text-3xl font-semibold text-teal-700">
                    {n}
                  </dt>
                  <dd className="mt-1 text-xs text-zinc-500">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-3xl shadow-xl shadow-teal-950/15 ring-1 ring-teal-950/10">
              <Image
                src="/images/hero-doctor.jpg"
                alt="Doctor in a white coat using a phone"
                width={1600}
                height={1067}
                priority
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden w-44 overflow-hidden rounded-2xl border-4 border-white shadow-lg shadow-teal-950/15 sm:block">
              <Image
                src="/images/team.jpg"
                alt="Surgical team looking down in a circle"
                width={400}
                height={400}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="border-t border-teal-950/5 bg-[#f3f8f7]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-teal-950 sm:text-4xl">
            Everything under one roof
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Each department hands your visit to the next one automatically, so
            you never carry paperwork around the building.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article
                key={s.title}
                className="group overflow-hidden rounded-3xl border border-teal-950/[0.07] bg-white shadow-[0_1px_2px_rgb(4_47_43/0.04),0_12px_32px_-16px_rgb(4_47_43/0.16)] transition-shadow hover:shadow-[0_2px_4px_rgb(4_47_43/0.06),0_20px_44px_-16px_rgb(4_47_43/0.24)]"
              >
                <div className="relative h-44 overflow-hidden">
                  <Image
                    src={s.img}
                    alt={s.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold text-teal-950">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {s.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Visit flow */}
      <section id="visit" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-teal-950 sm:text-4xl">
          Your visit, step by step
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f) => (
            <div
              key={f.step}
              className="rounded-2xl border border-teal-950/[0.07] bg-white p-5 shadow-[0_1px_2px_rgb(4_47_43/0.04),0_12px_32px_-16px_rgb(4_47_43/0.16)]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 font-display text-sm font-semibold text-white shadow-inner shadow-white/20">
                {f.step}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-teal-950">
                {f.label}
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section
        id="contact"
        className="border-t border-teal-950/5 bg-gradient-to-br from-teal-800 to-teal-950"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white">
              Need to see a doctor today?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-teal-100">
              No appointment needed — walk in and reception will register you in
              minutes. For enquiries call{" "}
              <a href="tel:+254700000000" className="font-medium text-white underline">
                +254 700 000 000
              </a>{" "}
              or email{" "}
              <a
                href="mailto:hello@careflow.clinic"
                className="font-medium text-white underline"
              >
                hello@careflow.clinic
              </a>
              .
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-white px-6 text-sm font-medium text-teal-800 shadow-sm transition-colors hover:bg-teal-50"
          >
            Staff portal
          </Link>
        </div>
      </section>

      <footer className="bg-teal-950 py-6 text-center text-xs text-teal-300/70">
        © {new Date().getFullYear()} CareFlow Clinic. Photos courtesy of{" "}
        <a
          href="https://unsplash.com"
          className="underline"
          rel="noreferrer"
          target="_blank"
        >
          Unsplash
        </a>
        .
      </footer>
    </div>
  );
}
