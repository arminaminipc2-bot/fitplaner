import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const file = path.join(root, "test.db");
const prismaBin = path.resolve(root, "../../node_modules/prisma/build/index.js");

/**
 * Runs once per test process, before any worker starts. Deploying inside a
 * per-file hook made every file pay for the migration and the last one hit the
 * hook timeout; the schema is the same for all of them.
 */
export default function setup() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (existsSync(file + suffix)) rmSync(file + suffix);
  }

  const run = spawnSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${file}` },
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`prisma migrate deploy failed: ${run.stderr || run.stdout}`);
}
