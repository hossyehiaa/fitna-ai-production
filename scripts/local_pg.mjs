// =====================================================================
// Local embedded PostgreSQL for full-stack verification in the sandbox.
// Starts a real postgres server on :5433 with database `fitna`.
// Keep this process running while testing; stop with Ctrl-C (or kill).
// Run: node scripts/local_pg.mjs &
// =====================================================================
import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: process.env.PG_DATA_DIR || "/home/z/my-project/pgdata",
  user: "postgres",
  password: "postgres",
  port: Number(process.env.PG_PORT || 5433),
  persistent: true,
});

await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("fitna");
  console.log("local-postgres: database 'fitna' created");
} catch {
  console.log("local-postgres: database 'fitna' already exists");
}
console.log("local-postgres: READY on port 5433 (user=postgres)");

// Keep the node process (and with it the postgres child) alive.
setInterval(() => {}, 1 << 30);
