import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.EMBEDDED_PG_PORT ?? "5432");
const databaseDir = path.join(
  os.tmpdir(),
  `moja-kuchnia-embedded-pg-${port}`,
);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "moja_kuchnia",
  password: "moja_kuchnia_dev",
  port,
  persistent: true,
});

function looksInitialized(dir) {
  return (
    fs.existsSync(path.join(dir, "PG_VERSION")) ||
    fs.existsSync(path.join(dir, "postgresql.conf"))
  );
}

async function main() {
  if (!looksInitialized(databaseDir)) {
    if (fs.existsSync(databaseDir)) {
      fs.rmSync(databaseDir, { recursive: true, force: true });
    }
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("moja_kuchnia");
  } catch {
    // Baza mogła już istnieć przy ponownym starcie.
  }
  process.stdout.write("POSTGRES_READY\n");
  await new Promise(() => {
    /* keep alive until the parent process stops this script */
  });
}

process.on("SIGINT", () => {
  void pg.stop().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void pg.stop().finally(() => process.exit(0));
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
