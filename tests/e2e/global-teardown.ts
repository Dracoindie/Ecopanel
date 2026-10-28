import { rm } from "node:fs/promises";
import { E2E_AUTH_DIR } from "./global-setup";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { requireE2eEnv } from "./env";

export default async function globalTeardown() {
  const env = requireE2eEnv();
  const prisma = new PrismaClient({ datasources: { db: { url: env.E2E_DATABASE_URL } } });
  try {
    await prisma.organization.deleteMany({ where: { slug: { in: ["ecopanel-e2e", "ecopanel-e2e-other"] } } });
    await prisma.user.deleteMany({
      where: { email: { in: [env.E2E_OWNER_EMAIL.toLowerCase(), env.E2E_OTHER_EMAIL.toLowerCase()] } }
    });
  } finally {
    await prisma.$disconnect();
  }

  const storageRoot = path.resolve(process.cwd(), env.E2E_CV_STORAGE_DIR || "var/cv-storage-e2e");
  if (!storageRoot.includes("cv-storage-e2e")) {
    throw new Error("Refusing to remove a non-isolated E2E storage directory.");
  }
  await rm(storageRoot, { recursive: true, force: true });
  await rm(path.resolve(process.cwd(), E2E_AUTH_DIR), { recursive: true, force: true });
}
