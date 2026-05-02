/**
 * Applies idempotent schema DDL to the configured Neon database.
 * Used locally and in GitHub Actions (set DATABASE_URL).
 */
import "dotenv/config";
import { initDatabase } from "../src/store";

void (async () => {
  await initDatabase();
  console.log("Database schema synced.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
