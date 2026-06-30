-- โครงสร้างฐานข้อมูลสำหรับเว็บทำข้อสอบ

-- ผู้ใช้งาน (ผู้สอบ)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(120),
  role          VARCHAR(20) NOT NULL DEFAULT 'student',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ชุดข้อสอบ
CREATE TABLE IF NOT EXISTS exams (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  time_limit_min INT,                       -- เวลาทำข้อสอบ (นาที), NULL = ไม่จำกัด
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- คำถาม (ตัวเลือกแบบ multiple choice)
CREATE TABLE IF NOT EXISTS questions (
  id            SERIAL PRIMARY KEY,
  exam_id       INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,              -- โจทย์คำถาม
  choices       JSONB NOT NULL,             -- เช่น ["ก","ข","ค","ง"]
  correct_index INT NOT NULL,               -- index ของคำตอบที่ถูก (เริ่มที่ 0)
  image         TEXT,                       -- path รูปประกอบ (ถ้ามี) เช่น exam-images/q62.png
  points        INT NOT NULL DEFAULT 1,
  position      INT NOT NULL DEFAULT 0      -- ลำดับการแสดง
);

-- ผลการสอบ (1 แถวต่อ 1 ครั้งที่ส่งคำตอบ)
CREATE TABLE IF NOT EXISTS attempts (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id       INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  score         INT NOT NULL,
  total_points  INT NOT NULL,
  answers       JSONB NOT NULL,             -- { "question_id": chosen_index, ... }
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
