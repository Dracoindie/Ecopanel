import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { request } from "@playwright/test";
import { requireE2eEnv } from "./env";

const OWNER_ORG_SLUG = "ecopanel-e2e";
const OTHER_ORG_SLUG = "ecopanel-e2e-other";
export const E2E_JOB_ID = "e2e-role";
export const E2E_AUTH_DIR = "tests/e2e/.e2e-auth";
export const E2E_OWNER_STATE = `${E2E_AUTH_DIR}/owner.json`;
export const E2E_OTHER_STATE = `${E2E_AUTH_DIR}/other.json`;

function safeStorageRoot(root: string) {
  const resolved = path.resolve(process.cwd(), root);
  if (!resolved.includes("cv-storage-e2e")) {
    throw new Error("E2E_CV_STORAGE_DIR must point to an isolated path containing cv-storage-e2e.");
  }
  return resolved;
}

export default async function globalSetup() {
  const env = requireE2eEnv();
  const prepared = spawnSync(process.execPath, ["scripts/prepare-e2e-db.mjs"], { stdio: "inherit", env: process.env });
  if (prepared.status !== 0) throw new Error("Could not prepare the E2E database.");

  const storageRoot = safeStorageRoot(env.E2E_CV_STORAGE_DIR || "var/cv-storage-e2e");
  await rm(storageRoot, { recursive: true, force: true });
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });

  const { hashPassword } = await import("better-auth/crypto");
  const prisma = new PrismaClient({ datasources: { db: { url: env.E2E_DATABASE_URL } } });
  try {
    const ownerEmail = env.E2E_OWNER_EMAIL.trim().toLowerCase();
    const otherEmail = env.E2E_OTHER_EMAIL.trim().toLowerCase();
    await prisma.rateLimitBucket.deleteMany({});
    await prisma.organization.deleteMany({ where: { slug: { in: [OWNER_ORG_SLUG, OTHER_ORG_SLUG] } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });

    const [ownerPassword, otherPassword] = await Promise.all([
      hashPassword(env.E2E_OWNER_PASSWORD),
      hashPassword(env.E2E_OTHER_PASSWORD)
    ]);

    await prisma.$transaction(async tx => {
      const ownerOrg = await tx.organization.create({
        data: { name: "E2E Hiring Team", slug: OWNER_ORG_SLUG }
      });
      const otherOrg = await tx.organization.create({
        data: { name: "E2E Other Team", slug: OTHER_ORG_SLUG }
      });

      const ownerId = randomUUID();
      await tx.user.create({
        data: {
          id: ownerId,
          name: env.E2E_OWNER_NAME?.trim() || "E2E Owner",
          email: ownerEmail,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: ownerId,
              providerId: "credential",
              password: ownerPassword
            }
          },
          memberships: { create: { organizationId: ownerOrg.id, role: "OWNER" } }
        }
      });

      const otherId = randomUUID();
      await tx.user.create({
        data: {
          id: otherId,
          name: env.E2E_OTHER_NAME?.trim() || "E2E Other",
          email: otherEmail,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: otherId,
              providerId: "credential",
              password: otherPassword
            }
          },
          memberships: { create: { organizationId: otherOrg.id, role: "OWNER" } }
        }
      });

      await tx.job.create({
        data: {
          id: E2E_JOB_ID,
          organizationId: ownerOrg.id,
          title: "E2E Product Engineer",
          department: "Engineering",
          location: "London",
          workplace: "Hybrid",
          employmentType: "Full-time",
          shortDescription: "A deterministic role used by browser E2E tests.",
          description: "Build and verify the recruitment workflow end to end.",
          responsibilities: ["Ship reliable software", "Collaborate with the hiring team"],
          qualifications: ["TypeScript experience", "Careful security judgement"],
          salaryRange: "Competitive",
          status: "Published",
          publicVisible: true,
          publishedAt: new Date()
        }
      });
    });
  } finally {
    await prisma.$disconnect();
  }

  const authDir = path.resolve(process.cwd(), E2E_AUTH_DIR);
  await rm(authDir, { recursive: true, force: true });
  await mkdir(authDir, { recursive: true });
  for (const account of [
    { email: env.E2E_OWNER_EMAIL, password: env.E2E_OWNER_PASSWORD, file: E2E_OWNER_STATE },
    { email: env.E2E_OTHER_EMAIL, password: env.E2E_OTHER_PASSWORD, file: E2E_OTHER_STATE }
  ]) {
    const api = await request.newContext({ baseURL: env.E2E_BASE_URL });
    try {
      const response = await api.post("/api/auth/sign-in/email", {
        data: { email: account.email, password: account.password, rememberMe: true }
      });
      if (!response.ok()) {
        throw new Error(`Could not create an E2E session for ${account.email}: HTTP ${response.status()}`);
      }
      await writeFile(path.resolve(process.cwd(), account.file), JSON.stringify(await api.storageState(), null, 2));
    } finally {
      await api.dispose();
    }
  }
}
