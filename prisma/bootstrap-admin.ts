import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const weakPasswords = new Set(["password", "password123", "changeme", "admin123456", "letmein12345", "ecopanel1234"]);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const email = required("BOOTSTRAP_ADMIN_EMAIL").normalize("NFKC").toLowerCase();
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Workspace Owner";
  const organizationName = process.env.BOOTSTRAP_ORG_NAME?.trim() || "Nexora Labs";
  const organizationSlug = process.env.BOOTSTRAP_ORG_SLUG?.trim() || "nexora-labs";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) throw new Error("BOOTSTRAP_ORG_SLUG must be a lowercase slug.");
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  if (weakPasswords.has(password.toLowerCase())) throw new Error("Choose a non-default bootstrap password.");
  if (name.length < 2 || name.length > 120) throw new Error("BOOTSTRAP_ADMIN_NAME must be 2-120 characters.");

  const prisma = new PrismaClient();
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("A user with this email already exists. This script will not elevate or replace an existing account.");
    }

    let organization = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
    if (organization) {
      const memberCount = await prisma.membership.count({ where: { organizationId: organization.id } });
      if (memberCount > 0) {
        throw new Error("This organization already has members. Use an existing OWNER account to invite teammates; bootstrap will not add another owner.");
      }
    } else {
      organization = await prisma.organization.create({
        data: { name: organizationName, slug: organizationSlug }
      });
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async tx => {
      await tx.user.create({
        data: {
          id: userId,
          name,
          email,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: userId,
              providerId: "credential",
              password: passwordHash
            }
          },
          memberships: {
            create: {
              organizationId: organization!.id,
              role: "OWNER"
            }
          }
        }
      });
    });

    console.log("Bootstrap admin created.");
    console.log(`Name: ${name}`);
    console.log(`Email: ${email}`);
    console.log(`Organization: ${organization.name} (${organization.slug})`);
    console.log("Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now. The password was not logged.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("Admin bootstrap failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
