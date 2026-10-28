import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { loadE2eEnv, requireE2eEnv } from "./tests/e2e/env";

const fileEnv = loadE2eEnv();
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
const env = requireE2eEnv();

const appEnv = {
  ...process.env,
  APP_DATA_MODE: "database",
  DATABASE_URL: env.E2E_DATABASE_URL,
  AUTH_SECRET: env.AUTH_SECRET,
  NEXT_PUBLIC_APP_URL: env.E2E_BASE_URL,
  CV_STORAGE_DIR: env.E2E_CV_STORAGE_DIR,
  CV_SCANNER_PROVIDER: "http",
  CV_SCANNER_URL: env.CV_SCANNER_URL,
  CV_SCANNER_TIMEOUT_MS: env.CV_SCANNER_TIMEOUT_MS || "5000",
  EMAIL_PROVIDER: "disabled",
  EMAIL_MODE: "disabled",
  CALENDAR_PROVIDER: "disabled",
  NEXT_DIST_DIR: ".next-e2e",
  RATE_LIMIT_PUBLIC_APPLY_MAX: env.RATE_LIMIT_PUBLIC_APPLY_MAX || "100",
  RATE_LIMIT_AUTH_SIGNIN_MAX: env.RATE_LIMIT_AUTH_SIGNIN_MAX || "100",
  TRUSTED_PROXY_HEADERS: "true"
};

const workerEnv = {
  ...appEnv,
  CV_WORKER_SKIP_ENV_FILE: "true",
  CV_WORKER_POLL_MS: "250",
  CV_WORKER_HEALTH_PORT: "3312"
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: env.E2E_BASE_URL,
    storageState: path.resolve(process.cwd(), "tests/e2e/.e2e-auth/owner.json"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "node scripts/e2e-scanner.mjs",
      url: "http://127.0.0.1:3311/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, E2E_SCANNER_PORT: "3311" }
    },
    {
      command: "npm run build:e2e && npx next start -p 3201",
      url: env.E2E_BASE_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: appEnv
    },
    {
      command: "npx tsx scripts/cv-worker.ts",
      url: "http://127.0.0.1:3312/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: workerEnv
    }
  ]
});
