import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function init() {
  const sql = await readFile(join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("✅ สร้างตารางเรียบร้อยแล้ว");
  await pool.end();
}

init().catch((err) => {
  console.error("❌ สร้างตารางไม่สำเร็จ:", err);
  process.exit(1);
});
