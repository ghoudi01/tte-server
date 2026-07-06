import "dotenv/config";
import { hashPassword } from "../src/store";
import { Pool } from "pg";

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const adminPassword = process.env.ADMIN_SEED_PASSWORD || "admin123";
  const adminHash = await hashPassword(adminPassword);

  await pool.query(
    `INSERT INTO users (id, email, password, role, email_verified)
     VALUES ('u_seed_admin', 'admin@tte.tn', $1, 'admin', 1)
     ON CONFLICT (email) DO UPDATE SET password = $1`,
    [adminHash]
  );

  console.log("Seed complete: admin@tte.tn /", adminPassword);
  await pool.end();
}

seed().catch(console.error);
