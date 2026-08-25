import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadDotenv({ path: resolve(__dirname, ".env") });

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgresql://moja_kuchnia:moja_kuchnia_dev@localhost:5432/moja_kuchnia";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm exec ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
