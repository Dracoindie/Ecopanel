import path from "node:path";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [path.join("node_modules", "next", "dist", "bin", "next"), "build"],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: ".next-e2e" }
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
