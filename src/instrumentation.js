// Runs once when the server starts. Opening the MongoDB Atlas connection here (DNS, TLS,
// auth: several seconds) means the first person to click doesn't wait for it.
export async function register() {
  // Keep the import inside this check so the Edge build leaves Prisma out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { default: prisma } = await import("./lib/prisma");
    prisma.$connect().catch((e) => console.error("Database warm-up failed:", e.message));
  }
}
