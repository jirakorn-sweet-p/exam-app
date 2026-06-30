import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

const isProd = process.env.NODE_ENV === "production";
const cookieOpts = {
  httpOnly: true,           // กัน JS ฝั่ง client อ่าน token (กัน XSS ขโมย)
  secure: isProd,           // ส่งผ่าน HTTPS เท่านั้นตอน production
  sameSite: "lax",
  maxAge: 8 * 60 * 60 * 1000, // 8 ชั่วโมง
};

// สมัครสมาชิก
router.post("/register", async (req, res) => {
  const { username, password, full_name } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "กรุณากรอก username และ password" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name)
       VALUES ($1, $2, $3) RETURNING id, username, role`,
      [username, hash, full_name || null]
    );
    const user = rows[0];
    res.cookie("token", signToken(user), cookieOpts);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "username นี้ถูกใช้แล้ว" });
    }
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
});

// เข้าสู่ระบบ
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "กรุณากรอก username และ password" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    const user = rows[0];
    // ใช้ข้อความ error เดียวกันเสมอ กันการเดาว่า username มีอยู่จริงหรือไม่
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: "username หรือ password ไม่ถูกต้อง" });
    }
    res.cookie("token", signToken(user), cookieOpts);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
});

// ออกจากระบบ
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// ข้อมูลผู้ใช้ปัจจุบัน (เช็คว่า login อยู่ไหม)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
