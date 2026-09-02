import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// If DB env vars are not set yet, try to load backend/.env relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DB_HOST || !process.env.DB_PORT || !process.env.DB_NAME || !process.env.DB_USER) {
  dotenv.config({ path: path.join(__dirname, ".env") });
}

const { Pool } = pg;

// Validate critical DB config and provide helpful messages when missing
const missing = [];
if (!process.env.DB_HOST) missing.push("DB_HOST");
if (!process.env.DB_PORT) missing.push("DB_PORT");
if (!process.env.DB_NAME) missing.push("DB_NAME");
if (!process.env.DB_USER) missing.push("DB_USER");

if (missing.length) {
  console.error(`Missing required DB env vars: ${missing.join(", ")}. Please set them in backend/.env or in the environment.`);
}

// Allow empty DB_PASSWORD for local DBs, but warn so it's intentional
if (!process.env.DB_PASSWORD) {
  console.warn("DB_PASSWORD is empty — assuming local DB without password. If your DB requires a password, set DB_PASSWORD in backend/.env.");
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined,
});

async function ensureAiStatusColumns() {
  try {
    await pool.query(`
      ALTER TABLE files
      ADD COLUMN IF NOT EXISTS ai_upload_status VARCHAR(20) DEFAULT 'pending'
    `);
    await pool.query(`
      ALTER TABLE files
      ADD COLUMN IF NOT EXISTS ai_solve_status VARCHAR(20)
    `);
    console.log("AI status columns ready");
  } catch (err) {
    console.error("Failed to ensure AI status columns:", err.message);
  }
}

async function ensureCheatsheetsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheatsheets (
        cheatsheet_id SERIAL PRIMARY KEY,
        course_dept VARCHAR(10) NOT NULL,
        course_num VARCHAR(10) NOT NULL,
        course_name VARCHAR(100),
        content JSONB,
        ai_status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_cheatsheet_course UNIQUE (course_dept, course_num)
      )
    `);
    console.log("Cheatsheets table ready");
  } catch (err) {
    console.error("Failed to ensure cheatsheets table:", err.message);
  }
}

void ensureAiStatusColumns();
void ensureCheatsheetsTable();
