import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// The package root, so the database file never depends on the caller's cwd
// (npm workspaces, vitest and the CLI each start in a different directory).
const pkgRoot = path.resolve(here, "..");

function resolveUrl(raw = process.env.DATABASE_URL ?? "file:./dev.db"): string {
  if (!raw.startsWith("file:")) return raw;
  const file = raw.slice(5);
  return "file:" + (path.isAbsolute(file) ? file : path.join(pkgRoot, file));
}

export const databaseUrl = resolveUrl();

function createPrismaClient(): PrismaClient {
  if (databaseUrl.startsWith("postgres:") || databaseUrl.startsWith("postgresql:")) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  }

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
  });
}

export const prisma = createPrismaClient();

export async function connectDb() {
  await prisma.$connect();
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
