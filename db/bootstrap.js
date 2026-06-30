import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * เตรียมฐานข้อมูลให้พร้อมใช้งานอัตโนมัติเมื่อเซิร์ฟเวอร์เริ่มทำงาน:
 *  1) สร้างตารางถ้ายังไม่มี (idempotent)
 *  2) โหลดข้อสอบวิชาสื่อสารถ้ายังไม่มีข้อสอบในระบบ
 *  3) สร้างบัญชีผู้ใช้ตัวอย่างถ้ายังไม่มีผู้ใช้
 * รันซ้ำได้ปลอดภัย ไม่ทำให้ข้อมูลซ้ำ
 */
// รายชื่อไฟล์ข้อสอบที่จะโหลดอัตโนมัติ
const EXAM_FILES = [
  "exam1.json",         // วิชาสื่อสาร
  "exam_weapon.json",   // วิชาอาวุธ
  "exam_vehicle.json",  // วิชายานยนต์
  "exam_tactic.json",   // วิชายุทธวิธี
];

async function loadExamFile(file) {
  const exam = JSON.parse(await readFile(join(__dirname, file), "utf-8"));
  // ข้ามถ้ามีข้อสอบชื่อนี้อยู่แล้ว (กันซ้ำ/รองรับการเพิ่มวิชาใหม่ภายหลัง)
  const { rows: exist } = await pool.query(
    "SELECT id FROM exams WHERE title = $1",
    [exam.title]
  );
  if (exist.length) return false;

  const { rows } = await pool.query(
    `INSERT INTO exams (title, description, time_limit_min)
     VALUES ($1, $2, $3) RETURNING id`,
    [exam.title, exam.description, exam.time_limit_min]
  );
  const examId = rows[0].id;
  let pos = 0;
  for (const q of exam.questions) {
    await pool.query(
      `INSERT INTO questions (exam_id, body, choices, correct_index, image, points, position)
       VALUES ($1, $2, $3, $4, $5, 1, $6)`,
      [examId, q.body, JSON.stringify(q.choices), q.correct, q.image || null, pos++]
    );
  }
  console.log(`📝 โหลดข้อสอบ "${exam.title}" (${exam.questions.length} ข้อ)`);
  return true;
}

export async function bootstrap() {
  // 1) สร้างตาราง
  const schema = await readFile(join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);

  // 2) โหลดข้อสอบทุกวิชา (เฉพาะวิชาที่ยังไม่มีในระบบ)
  for (const file of EXAM_FILES) {
    try {
      await loadExamFile(file);
    } catch (e) {
      console.error(`⚠️  โหลด ${file} ไม่สำเร็จ:`, e.message);
    }
  }

  // 3) สร้างผู้ใช้ตัวอย่างถ้ายังไม่มีผู้ใช้เลย
  const { rows: userCount } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (userCount[0].n === 0) {
    const hash = await bcrypt.hash("123456", 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'student')`,
      ["student01", hash, "นักเรียนทดสอบ"]
    );
    console.log("👤 สร้างผู้ใช้ตัวอย่าง student01 / 123456 (แนะนำให้เปลี่ยนรหัสผ่าน)");
  }

  // 4) สร้างบัญชีผู้ดูแลระบบถ้ายังไม่มี admin เลย
  const { rows: adminCount } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'"
  );
  if (adminCount[0].n === 0) {
    const adminPass = process.env.ADMIN_PASSWORD || "admin123";
    const hash = await bcrypt.hash(adminPass, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username) DO UPDATE SET role = 'admin'`,
      ["admin", hash, "ผู้ดูแลระบบ"]
    );
    console.log(
      `🔑 สร้างบัญชีผู้ดูแลระบบ admin / ${adminPass} (แนะนำให้ตั้ง ADMIN_PASSWORD และเปลี่ยนรหัสผ่าน)`
    );
  }

  console.log("✅ ฐานข้อมูลพร้อมใช้งาน");
}
