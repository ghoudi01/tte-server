/**
 * Wipes all tables in the `public` schema and reapplies DDL via resetDatabase().
 * Requires ALLOW_DB_RESET=1 (see GitHub workflow server-db-reset.yml).
 */
import "dotenv/config";
import { resetDatabase } from "../src/store";

void (async () => {
  if (process.env.ALLOW_DB_RESET !== "1") {
    console.error(
      "Refusing to reset: set ALLOW_DB_RESET=1 (destroys all tables in public)."
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  await resetDatabase();
  console.log("Database reset complete; tables regenerated.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
