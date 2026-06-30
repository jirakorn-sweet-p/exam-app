import { readFile, readdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * เตรียมฐานข้อมูลให้พร้อมใช้งานอัตโนมัติเมื่อเซิร์ฟเวอร์เริ่มทำงาน:
 *  1) สร้างตารางถ้ายังไม่มี (idempotent)
 *  1.1) อัปเกรดตารางเดิมให้มีคอลัมน์ group_no
 *  2) โหลดข้อสอบทุกไฟล์ exam*.json ในโฟลเดอร์นี้ (เพิ่มชุดใหม่ = แค่วางไฟล์)
 *  3) สร้างบัญชีผู้ใช้ตัวอย่างถ้ายังไม่มีผู้ใช้
 *  4) สร้างบัญชีผู้ดูแลระบบถ้ายังไม่มี admin
 * รันซ้ำได้ปลอดภัย ไม่ทำให้ข้อมูลซ้ำ
 *
 * วิธีเพิ่มชุดข้อสอบใหม่:
 *   - สร้างไฟล์ db/exam_xxxx.json (ชื่อขึ้นต้นด้วย "exam" และนามสกุล .json)
 *   - ใส่ฟิลด์: title, description, time_limit_min, group_no (1/2/3), questions[]
 *   - ถ้าไม่ระบุ group_no จะถือว่าเป็น "กลุ่มที่ 3" โดยอัตโนมัติ
 */

// ค้นหาไฟล์ข้อสอบทั้งหมดในโฟลเดอร์ db (ไม่ต้องแก้โค้ดเวลาเพิ่มชุดใหม่)
async function listExamFiles() {
  const entries = await readdir(__dirname);
  return entries.filter((f) => /^exam.*\.json$/i.test(f)).sort();
}

async function loadExamFile(file) {
  const exam = JSON.parse(await readFile(join(__dirname, file), "utf-8"));
  // group_no ไม่ระบุ = กลุ่มที่ 3 (รองรับไฟล์เดิมที่ยังไม่มีฟิลด์นี้)
  const groupNo = Number.isInteger(exam.group_no) ? exam.group_no : 3;

  // ถ้ามีข้อสอบชื่อนี้อยู่แล้ว: อัปเดตเฉพาะกลุ่ม (เผื่อย้ายกลุ่มภายหลัง) แล้วข้าม (กันนำเข้าคำถามซ้ำ)
  const { rows: exist } = await pool.query(
    "SELECT id, group_no FROM exams WHERE title = $1",
    [exam.title]
  );
  if (exist.length) {
    if (exist[0].group_no !== groupNo) {
      await pool.query("UPDATE exams SET group_no = $1 WHERE id = $2", [
        groupNo,
        exist[0].id,
      ]);
      console.log(`↔️  ปรับกลุ่มข้อสอบ "${exam.title}" → กลุ่มที่ ${groupNo}`);
    }
    return false;
  }

  const { rows } = await pool.query(
    `INSERT INTO exams (title, description, time_limit_min, group_no)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [exam.title, exam.description, exam.time_limit_min, groupNo]
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
  console.log(
    `📝 โหลดข้อสอบ "${exam.title}" (กลุ่มที่ ${groupNo}, ${exam.questions.length} ข้อ)`
  );
  return true;
}

export async function bootstrap() {
  // 1) สร้างตาราง
  const schema = await readFile(join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);

  // 1.1) อัปเกรดฐานข้อมูลเดิมให้มีคอลัมน์ group_no (ปลอดภัยถ้ามีอยู่แล้ว)
  await pool.query(
    "ALTER TABLE exams ADD COLUMN IF NOT EXISTS group_no INT NOT NULL DEFAULT 3"
  );

  // 2) โหลดข้อสอบทุกไฟล์ exam*.json อัตโนมัติ (เฉพาะชุดที่ยังไม่มีในระบบ)
  const files = await listExamFiles();
  for (const file of files) {
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
