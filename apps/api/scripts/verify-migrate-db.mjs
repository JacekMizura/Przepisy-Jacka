import pg from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia_migrate_verify";

const client = new pg.Client({ connectionString: url });
await client.connect();

const migrations = await client.query(
  "SELECT migration_name FROM _prisma_migrations ORDER BY started_at",
);
console.log(
  "MIGRATIONS",
  migrations.rows.map((row) => row.migration_name).join("|"),
);

const users = await client.query('SELECT count(*)::int AS n FROM "user"');
console.log("USER_COUNT", users.rows[0].n);

const tables = await client.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
);
console.log(
  "TABLES",
  tables.rows.map((row) => row.tablename).join(","),
);

await client.end();
