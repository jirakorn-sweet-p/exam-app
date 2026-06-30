import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Neon ต้องใช้ SSL เสมอ. ถ้ารันบน local กับ Postgres ปกติ ตั้ง PGSSL=false ได้
const useSSL = process.env.PGSSL !== "false";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

export async function query(text, params) {
  return pool.query(text, params);
}
