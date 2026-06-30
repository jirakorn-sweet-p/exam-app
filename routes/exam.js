import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ทุก route ในไฟล์นี้ต้อง login ก่อน
router.use(requireAuth);

// รายการข้อสอบทั้งหมด
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, title, description, time_limit_min, group_no FROM exams ORDER BY group_no, id"
  );
  res.json({ exams: rows });
});

// ดึงข้อสอบ 1 ชุดพร้อมคำถาม (ไม่ส่ง correct_index ออกไปฝั่ง client)
router.get("/:id", async (req, res) => {
  const examId = Number(req.params.id);
  const { rows: examRows } = await pool.query(
    "SELECT id, title, description, time_limit_min, group_no FROM exams WHERE id = $1",
    [examId]
  );
  if (!examRows[0]) {
    return res.status(404).json({ error: "ไม่พบข้อสอบนี้" });
  }
  const { rows: questions } = await pool.query(
    `SELECT id, body, choices, points, image
     FROM questions WHERE exam_id = $1 ORDER BY position, id`,
    [examId]
  );
  res.json({ exam: examRows[0], questions });
});

// ส่งคำตอบและให้คะแนน
router.post("/:id/submit", async (req, res) => {
  const examId = Number(req.params.id);
  const answers = req.body?.answers || {}; // { question_id: chosen_index }

  const { rows: questions } = await pool.query(
    "SELECT id, correct_index, points FROM questions WHERE exam_id = $1",
    [examId]
  );
  if (questions.length === 0) {
    return res.status(404).json({ error: "ไม่พบข้อสอบนี้" });
  }

  let score = 0;
  let totalPoints = 0;
  const review = [];
  for (const q of questions) {
    totalPoints += q.points;
    const chosen = answers[q.id];
    const correct = chosen === q.correct_index;
    if (correct) score += q.points;
    review.push({
      question_id: q.id,
      chosen: chosen ?? null,
      correct_index: q.correct_index,
      is_correct: correct,
    });
  }

  // บันทึกผลการสอบ
  await pool.query(
    `INSERT INTO attempts (user_id, exam_id, score, total_points, answers)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.id, examId, score, totalPoints, JSON.stringify(answers)]
  );

  res.json({ score, total_points: totalPoints, review });
});

// ประวัติการสอบของผู้ใช้
router.get("/me/history", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.score, a.total_points, a.submitted_at, e.title
     FROM attempts a JOIN exams e ON e.id = a.exam_id
     WHERE a.user_id = $1 ORDER BY a.submitted_at DESC`,
    [req.user.id]
  );
  res.json({ attempts: rows });
});

export default router;
