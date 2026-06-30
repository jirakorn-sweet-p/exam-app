import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import authRoutes from "./routes/auth.js";
import examRoutes from "./routes/exam.js";
import adminRoutes from "./routes/admin.js";
import { bootstrap } from "./db/bootstrap.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());

// API
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/admin", adminRoutes);

// health check (Render ใช้เช็คว่าเซิร์ฟเวอร์ขึ้นแล้ว)
app.get("/healthz", (req, res) => res.json({ ok: true }));

// เสิร์ฟไฟล์หน้าเว็บ
app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// เตรียมฐานข้อมูลให้พร้อม (สร้างตาราง + โหลดข้อสอบ) แล้วจึงเริ่มเซิร์ฟเวอร์
bootstrap()
  .catch((err) => {
    console.error("⚠️  เตรียมฐานข้อมูลไม่สำเร็จ:", err.message);
    console.error("    เซิร์ฟเวอร์จะยังคงทำงานต่อ กรุณาตรวจสอบ DATABASE_URL");
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 เซิร์ฟเวอร์ทำงานที่ http://localhost:${PORT}`);
    });
  });
