import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const rawLine of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return values;
}

const env = { ...loadEnvFile(".env.e2e.local"), ...process.env };
const e2eUrl = env.E2E_DATABASE_URL;

if (!e2eUrl) throw new Error("E2E_DATABASE_URL is required for browser E2E setup.");

let parsed;
try {
  parsed = new URL(e2eUrl);
} catch {
  throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL URL.");
}
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  throw new Error("E2E_DATABASE_URL must use the postgresql:// or postgres:// protocol.");
}
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!/^[a-z0-9_]+$/.test(databaseName) || !databaseName.endsWith("_e2e")) {
  throw new Error("E2E_DATABASE_URL must target a dedicated database whose name ends with _e2e.");
}
if (/prod/i.test(databaseName)) {
  throw new Error("Refusing to use a database whose name looks production-related.");
}

const host = parsed.hostname.toLowerCase();
const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!localHost && env.ALLOW_REMOTE_E2E_DB !== "true") {
  throw new Error("E2E_DATABASE_URL must point at localhost unless ALLOW_REMOTE_E2E_DB=true.");
}

const adminUrl = new URL(parsed.toString());
adminUrl.pathname = "/postgres";
if (env.E2E_DB_ADMIN_URL) {
  try {
    new URL(env.E2E_DB_ADMIN_URL);
  } catch {
    throw new Error("E2E_DB_ADMIN_URL must be a valid PostgreSQL URL.");
  }
}

const admin = new PrismaClient({
  datasources: { db: { url: env.E2E_DB_ADMIN_URL || adminUrl.toString() } }
});

try {
  await admin.$queryRaw`SELECT 1`;
  const existing = await admin.$queryRaw(
    Prisma.sql`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`
  );
  if (existing.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created isolated E2E database ${databaseName}.`);
  } else {
    console.log(`Reusing isolated E2E database ${databaseName}.`);
  }
} catch (error) {
  throw new Error(
    `Could not prepare the E2E database. Check the PostgreSQL service and credentials. ${error instanceof Error ? error.message : ""}`.trim()
  );
} finally {
  await admin.$disconnect();
}

const migrate = spawnSync(
  process.execPath,
  [path.join("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, ...env, DATABASE_URL: e2eUrl }
  }
);
if (migrate.status !== 0) throw new Error("Prisma migrations failed for the E2E database.");

console.log("E2E database is ready.");
