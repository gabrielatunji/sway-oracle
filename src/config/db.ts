import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

pool.on("error", (error: Error) => {
  console.error("Unexpected PostgreSQL error", error);
});

export default pool;
