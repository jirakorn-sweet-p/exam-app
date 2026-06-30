import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedExam1() {
  const raw = await readFile(join(__dirname, "exam1.json"), "utf-8");
  const exam = JSON.parse(raw);

  // ถ้ามีข้อสอบชื่อนี้อยู่แล้ว ให้ลบทิ้งก่อน (กันซ้ำเวลารันหลายครั้ง)
  await pool.query("DELETE FROM exams WHERE title = $1", [exam.title]);

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

  console.log(`✅ โหลดข้อสอบ "${exam.title}" จำนวน ${exam.questions.length} ข้อเรียบร้อย`);
  await pool.end();
}

seedExam1().catch((err) => {
  console.error("❌ โหลดข้อสอบไม่สำเร็จ:", err);
  process.exit(1);
});
