import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type E2eEnv = Record<string, string>;

const E2E_KEYS = [
  "APP_DATA_MODE",
  "NEXT_PUBLIC_APP_URL",
  "AUTH_SECRET",
  "E2E_BASE_URL",
  "E2E_DATABASE_URL",
  "E2E_DB_ADMIN_URL",
  "E2E_CV_STORAGE_DIR",
  "E2E_OWNER_EMAIL",
  "E2E_OWNER_PASSWORD",
  "E2E_OWNER_NAME",
  "E2E_OTHER_EMAIL",
  "E2E_OTHER_PASSWORD",
  "E2E_OTHER_NAME",
  "CV_SCANNER_PROVIDER",
  "CV_SCANNER_URL",
  "CV_SCANNER_TIMEOUT_MS",
  "RATE_LIMIT_PUBLIC_APPLY_MAX",
  "RATE_LIMIT_AUTH_SIGNIN_MAX"
];

export function loadE2eEnv(): E2eEnv {
  const values: E2eEnv = {};
  const file = path.join(process.cwd(), ".env.e2e.local");
  if (existsSync(file)) {
    for (const rawLine of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  }
  for (const key of E2E_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") values[key] = value;
  }
  return values;
}

export function requireE2eEnv() {
  const env = loadE2eEnv();
  for (const key of [
    "E2E_BASE_URL",
    "E2E_DATABASE_URL",
    "E2E_CV_STORAGE_DIR",
    "AUTH_SECRET",
    "E2E_OWNER_EMAIL",
    "E2E_OWNER_PASSWORD",
    "E2E_OTHER_EMAIL",
    "E2E_OTHER_PASSWORD"
  ]) {
    if (!env[key]) throw new Error(`${key} is required in .env.e2e.local or the environment.`);
  }
  return env;
}
