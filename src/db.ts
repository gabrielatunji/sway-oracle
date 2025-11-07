import dotenv from "dotenv";
import { Pool } from "pg";
import { ResolutionLog } from "./types";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
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

export async function init(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resolution_logs (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      query TEXT NOT NULL,
      resolution TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      reasoning TEXT NOT NULL,
      sources TEXT[] NOT NULL,
      evidence JSONB NOT NULL
    );
  `);
}

export async function logResolution(entry: ResolutionLog): Promise<void> {
  const values = [
    entry.query,
    entry.resolution,
    entry.confidence,
    entry.reasoning,
    entry.sources,
    entry.evidence
  ];

  await pool.query(
    `INSERT INTO resolution_logs (query, resolution, confidence, reasoning, sources, evidence)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    values
  );
}

export default pool;
