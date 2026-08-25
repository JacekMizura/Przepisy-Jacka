const { spawnSync } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function assertSafeDatabaseUrl(url) {
  const lower = url.toLowerCase();
  if (
    lower.includes("railway") ||
    lower.includes("rlwy.net") ||
    lower.includes("vercel-storage")
  ) {
    throw new Error(
      "DATABASE_URL wskazuje na zdalną/produkcyjną bazę. Testy e2e mogą używać wyłącznie lokalnej lub CI bazy.",
    );
  }
}

module.exports = async function globalSetup() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia";
  assertSafeDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.ALLOW_DEMO_SEED = "false";

  const port = 5432;
  const inCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  if (!(await canConnect(port))) {
    if (inCi) {
      throw new Error(
        "PostgreSQL CI nie nasłuchuje na 5432. Usługa workflow musi być healthy przed e2e.",
      );
    }
    const EmbeddedPostgres = require("embedded-postgres");
    const databaseDir = path.join(os.tmpdir(), `moja-kuchnia-e2e-pg-${port}`);
    const pg = new EmbeddedPostgres({
      databaseDir,
      user: "moja_kuchnia",
      password: "moja_kuchnia_dev",
      port,
      persistent: true,
    });
    const fs = require("node:fs");
    const initialized =
      fs.existsSync(path.join(databaseDir, "PG_VERSION")) ||
      fs.existsSync(path.join(databaseDir, "postgresql.conf"));
    if (!initialized) {
      if (fs.existsSync(databaseDir)) {
        fs.rmSync(databaseDir, { recursive: true, force: true });
      }
      await pg.initialise();
    }
    await pg.start();
    try {
      await pg.createDatabase("moja_kuchnia");
    } catch {
      // Baza mogła już istnieć.
    }
    globalThis.__MOJA_KUCHNIA_EMBEDDED_PG__ = pg;
  }

  const result = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy"],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      shell: true,
      env: { ...process.env, DATABASE_URL: databaseUrl, ALLOW_DEMO_SEED: "false" },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy nie powiodło się:\n${result.stdout}\n${result.stderr}`,
    );
  }
};
