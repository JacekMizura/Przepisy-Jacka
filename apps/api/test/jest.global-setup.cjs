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

module.exports = async function globalSetup() {
  const port = 5432;
  if (!(await canConnect(port))) {
    const EmbeddedPostgres = require("embedded-postgres");
    const pg = new EmbeddedPostgres({
      databaseDir: path.join(os.tmpdir(), `moja-kuchnia-e2e-pg-${port}`),
      user: "moja_kuchnia",
      password: "moja_kuchnia_dev",
      port,
      persistent: true,
    });
    await pg.initialise();
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
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy nie powiodło się:\n${result.stdout}\n${result.stderr}`,
    );
  }
};
