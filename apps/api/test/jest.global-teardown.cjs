module.exports = async function globalTeardown() {
  const pg = globalThis.__MOJA_KUCHNIA_EMBEDDED_PG__;
  if (pg && typeof pg.stop === "function") {
    await pg.stop();
  }
};
