import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { generateExamPdf } from "../lib/examPdf.js";

const router = Router();

// ทุก route ในไฟล์นี้ต้องเป็น admin
router.use(requireAdmin);

// ----- ภาพรวม (สถิติรวม) -----
router.get("/stats", async (req, res) => {
  const [users, exams, attempts, avg] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'student'"),
    pool.query("SELECT COUNT(*)::int AS n FROM exams"),
    pool.query("SELECT COUNT(*)::int AS n FROM attempts"),
    pool.query(
      `SELECT COALESCE(AVG(score::numeric / NULLIF(total_points,0)), 0) AS avg_ratio
       FROM attempts`
    ),
  ]);
  res.json({
    students: users.rows[0].n,
    exams: exams.rows[0].n,
    attempts: attempts.rows[0].n,
    avg_percent: Math.round(Number(avg.rows[0].avg_ratio) * 100),
  });
});

// ----- รายชื่อผู้ใช้ พร้อมจำนวนครั้งที่สอบ -----
router.get("/users", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.created_at,
            COUNT(a.id)::int AS attempts,
            MAX(a.submitted_at) AS last_attempt,
            COALESCE(ROUND(AVG(a.score::numeric / NULLIF(a.total_points,0)) * 100), 0)::int AS avg_percent
     FROM users u
     LEFT JOIN attempts a ON a.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json({ users: rows });
});

// ----- ประวัติการสอบทั้งหมด (กรองตามข้อสอบ/ผู้ใช้ได้) -----
router.get("/attempts", async (req, res) => {
  const conds = [];
  const params = [];
  if (req.query.exam_id) {
    params.push(Number(req.query.exam_id));
    conds.push(`a.exam_id = $${params.length}`);
  }
  if (req.query.user_id) {
    params.push(Number(req.query.user_id));
    conds.push(`a.user_id = $${params.length}`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const { rows } = await pool.query(
    `SELECT a.id, a.score, a.total_points, a.submitted_at,
            u.username, u.full_name, e.title AS exam_title
     FROM attempts a
     JOIN users u ON u.id = a.user_id
     JOIN exams e ON e.id = a.exam_id
     ${where}
     ORDER BY a.submitted_at DESC
     LIMIT 500`,
    params
  );
  res.json({ attempts: rows });
});

// ----- รายละเอียดการสอบ 1 ครั้ง (คำตอบรายข้อเทียบเฉลย) -----
router.get("/attempts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { rows: aRows } = await pool.query(
    `SELECT a.*, u.username, u.full_name, e.title AS exam_title
     FROM attempts a
     JOIN users u ON u.id = a.user_id
     JOIN exams e ON e.id = a.exam_id
     WHERE a.id = $1`,
    [id]
  );
  const attempt = aRows[0];
  if (!attempt) return res.status(404).json({ error: "ไม่พบรายการนี้" });

  const { rows: questions } = await pool.query(
    `SELECT id, body, choices, correct_index, position
     FROM questions WHERE exam_id = $1 ORDER BY position, id`,
    [attempt.exam_id]
  );

  const answers = attempt.answers || {};
  const review = questions.map((q) => {
    const chosen = answers[q.id];
    return {
      body: q.body,
      choices: q.choices,
      chosen: chosen ?? null,
      correct_index: q.correct_index,
      is_correct: chosen === q.correct_index,
    };
  });

  res.json({
    attempt: {
      id: attempt.id,
      username: attempt.username,
      full_name: attempt.full_name,
      exam_title: attempt.exam_title,
      score: attempt.score,
      total_points: attempt.total_points,
      submitted_at: attempt.submitted_at,
    },
    review,
  });
});

// ----- รายการข้อสอบ (สำหรับ dropdown และวิเคราะห์) -----
router.get("/exams", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.title,
            COUNT(DISTINCT q.id)::int AS questions,
            COUNT(DISTINCT a.id)::int AS attempts
     FROM exams e
     LEFT JOIN questions q ON q.exam_id = e.id
     LEFT JOIN attempts a ON a.exam_id = e.id
     GROUP BY e.id
     ORDER BY e.id`
  );
  res.json({ exams: rows });
});

// ----- วิเคราะห์ข้อสอบรายข้อ (ข้อไหนคนตอบถูก/ผิดมากน้อย) -----
router.get("/exams/:id/analysis", async (req, res) => {
  const examId = Number(req.params.id);
  const { rows: questions } = await pool.query(
    `SELECT id, body, choices, correct_index, position
     FROM questions WHERE exam_id = $1 ORDER BY position, id`,
    [examId]
  );
  const { rows: attempts } = await pool.query(
    "SELECT answers FROM attempts WHERE exam_id = $1",
    [examId]
  );

  const analysis = questions.map((q, i) => {
    let answered = 0;
    let correct = 0;
    const choiceCounts = new Array(q.choices.length).fill(0);
    for (const a of attempts) {
      const chosen = a.answers?.[q.id];
      if (chosen === undefined || chosen === null) continue;
      answered++;
      if (chosen >= 0 && chosen < choiceCounts.length) choiceCounts[chosen]++;
      if (chosen === q.correct_index) correct++;
    }
    return {
      n: i + 1,
      body: q.body,
      choices: q.choices,
      correct_index: q.correct_index,
      answered,
      correct,
      correct_percent: answered ? Math.round((correct / answered) * 100) : null,
      choice_counts: choiceCounts,
    };
  });

  res.json({ total_attempts: attempts.length, analysis });
});

// ----- ดาวน์โหลดข้อสอบเป็น PDF ขาวดำ (ไม่มีเฉลย; ?withKey=1 เพื่อแนบเฉลยท้ายเล่ม) -----
router.get("/exams/:id/pdf", async (req, res) => {
  const examId = Number(req.params.id);
  const { rows: examRows } = await pool.query(
    "SELECT id, title, description FROM exams WHERE id = $1",
    [examId]
  );
  const exam = examRows[0];
  if (!exam) return res.status(404).json({ error: "ไม่พบข้อสอบนี้" });

  const { rows: questions } = await pool.query(
    `SELECT body, choices, image, correct_index
     FROM questions WHERE exam_id = $1 ORDER BY position, id`,
    [examId]
  );

  const withKey = req.query.withKey === "1";
  const answerKey = withKey ? questions.map((q) => q.correct_index) : null;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="exam-${examId}.pdf"; filename*=UTF-8''${encodeURIComponent(exam.title)}.pdf`
  );

  // ไม่ส่ง correct_index ลงใน PDF (ยกเว้นหน้าเฉลยที่สั่งแยก)
  const safeQuestions = questions.map((q) => ({ body: q.body, choices: q.choices, image: q.image }));
  generateExamPdf(res, exam, safeQuestions, { withKey, answerKey });
});

export default router;
