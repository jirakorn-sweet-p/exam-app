import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

async function seed() {
  // ----- ผู้ใช้ตัวอย่าง -----
  // username: student01 / password: 123456
  const passHash = await bcrypt.hash("123456", 10);
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'student')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    ["student01", passHash, "นักเรียนทดสอบ"]
  );
  console.log("👤 ผู้ใช้ตัวอย่าง: student01 / 123456");

  // ----- ข้อสอบตัวอย่าง -----
  const { rows: examRows } = await pool.query(
    `INSERT INTO exams (title, description, time_limit_min)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      "ข้อสอบความรู้ทั่วไป",
      "แบบทดสอบตัวอย่างจำนวน 5 ข้อ",
      10,
    ]
  );
  const examId = examRows[0].id;

  const questions = [
    {
      body: "เมืองหลวงของประเทศไทยคือข้อใด",
      choices: ["เชียงใหม่", "กรุงเทพมหานคร", "ภูเก็ต", "ขอนแก่น"],
      correct_index: 1,
    },
    {
      body: "1 + 1 มีค่าเท่ากับเท่าไร",
      choices: ["1", "2", "3", "11"],
      correct_index: 1,
    },
    {
      body: "ดาวเคราะห์ที่อยู่ใกล้ดวงอาทิตย์ที่สุดคือข้อใด",
      choices: ["โลก", "ดาวอังคาร", "ดาวพุธ", "ดาวศุกร์"],
      correct_index: 2,
    },
    {
      body: "ภาษาใดที่ใช้สร้างหน้าเว็บเป็นหลัก (โครงสร้าง)",
      choices: ["Python", "HTML", "C++", "SQL"],
      correct_index: 1,
    },
    {
      body: "น้ำมีสูตรทางเคมีว่าอย่างไร",
      choices: ["CO2", "O2", "H2O", "NaCl"],
      correct_index: 2,
    },
  ];

  // ลบคำถามเก่าของข้อสอบนี้ก่อน (กันซ้ำเวลารัน seed หลายครั้ง)
  await pool.query("DELETE FROM questions WHERE exam_id = $1", [examId]);

  let pos = 0;
  for (const q of questions) {
    await pool.query(
      `INSERT INTO questions (exam_id, body, choices, correct_index, points, position)
       VALUES ($1, $2, $3, $4, 1, $5)`,
      [examId, q.body, JSON.stringify(q.choices), q.correct_index, pos++]
    );
  }

  console.log(`📝 สร้างข้อสอบ "ข้อสอบความรู้ทั่วไป" (${questions.length} ข้อ) เรียบร้อย`);
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ seed ไม่สำเร็จ:", err);
  process.exit(1);
});
