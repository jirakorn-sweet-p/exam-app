import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

// สร้าง token หลัง login สำเร็จ
export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// middleware กันหน้า/route ที่ต้อง login ก่อน
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อน" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie("token");
    return res.status(401).json({ error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
  }
}

// middleware กัน route ที่ต้องเป็น admin เท่านั้น (ใช้ต่อจาก requireAuth)
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "ต้องเป็นผู้ดูแลระบบ (admin) เท่านั้น" });
    }
    next();
  });
}
