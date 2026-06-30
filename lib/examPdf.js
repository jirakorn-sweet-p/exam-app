import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FONT = join(ROOT, "assets", "fonts", "Sarabun-Regular.ttf");
const FONT_B = join(ROOT, "assets", "fonts", "Sarabun-Bold.ttf");
const LETTERS = ["ก", "ข", "ค", "ง"];

/**
 * สร้าง PDF ข้อสอบขาวดำ (สำหรับพิมพ์ทำข้อสอบ) แล้ว stream ไปยัง res
 * - ไม่แสดงเฉลย
 * - รูปประกอบใช้เวอร์ชันขาวดำใน public/exam-images-bw/
 * @param {object} res  express response
 * @param {object} exam { title, description }
 * @param {array}  questions [{ body, choices, image }]
 * @param {object} opts  { withKey: boolean, answerKey: [index,...] }
 */
export function generateExamPdf(res, exam, questions, opts = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.registerFont("th", FONT);
  doc.registerFont("thb", FONT_B);
  doc.pipe(res);

  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
  const contentWidth = () =>
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---------- หัวกระดาษ ----------
  doc.font("thb").fontSize(18).fillColor("black").text(exam.title, { align: "center" });
  if (exam.description) {
    doc.font("th").fontSize(11).fillColor("#333")
      .text(exam.description, { align: "center" });
  }
  doc.moveDown(0.4);
  doc.font("th").fontSize(11).fillColor("#000")
    .text("ชื่อ-สกุล ........................................................   หน่วย ......................   คะแนน ............ / " + questions.length, { align: "left" });
  doc.moveDown(0.2);
  // เส้นคั่น
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#000").lineWidth(0.7).stroke();
  doc.moveDown(0.5);

  // ---------- คำถาม ----------
  questions.forEach((q, i) => {
    drawQuestion(doc, i + 1, q, { pageBottom, contentWidth });
  });

  // ---------- เฉลย (เฉพาะเมื่อสั่ง) ----------
  if (opts.withKey && opts.answerKey) {
    doc.addPage();
    doc.font("thb").fontSize(16).text("เฉลย", { align: "center" });
    doc.moveDown(0.5);
    doc.font("th").fontSize(12);
    const perRow = 5;
    let line = "";
    opts.answerKey.forEach((idx, n) => {
      line += `${String(n + 1).padStart(3, " ")}. ${LETTERS[idx] ?? "-"}    `;
      if ((n + 1) % perRow === 0) {
        doc.text(line); line = "";
      }
    });
    if (line) doc.text(line);
  }

  doc.end();
}

function drawQuestion(doc, num, q, { pageBottom, contentWidth }) {
  const left = doc.page.margins.left;
  const width = contentWidth();

  // ประเมินความสูงคร่าว ๆ เพื่อตัดสินใจขึ้นหน้าใหม่
  doc.font("th").fontSize(12);
  const bodyText = `${num}. ${q.body}`;
  const bodyHeight = doc.heightOfString(bodyText, { width });
  const choicesHeight = q.choices.reduce(
    (h, c) => h + doc.heightOfString(`${"ก"}. ${c}`, { width: width - 16 }) + 2, 0);
  const imgHeight = q.image ? 130 : 0;
  const needed = bodyHeight + choicesHeight + imgHeight + 14;

  if (doc.y + needed > pageBottom() && doc.y > doc.page.margins.top) {
    doc.addPage();
  }

  // โจทย์
  doc.font("th").fontSize(12).fillColor("#000").text(bodyText, left, doc.y, { width });
  doc.moveDown(0.15);

  // รูปประกอบ (ขาวดำ)
  if (q.image) {
    const bw = imageBwPath(q.image);
    if (bw && existsSync(bw)) {
      try {
        if (doc.y + 130 > pageBottom()) doc.addPage();
        doc.image(bw, left + 14, doc.y, { fit: [width - 28, 120], align: "left" });
        doc.y += 126;
      } catch { /* ข้ามถ้ารูปมีปัญหา */ }
    }
  }

  // ตัวเลือก
  q.choices.forEach((c, idx) => {
    const t = `${LETTERS[idx]}. ${c}`;
    const h = doc.heightOfString(t, { width: width - 16 });
    if (doc.y + h > pageBottom()) doc.addPage();
    doc.font("th").fontSize(12).fillColor("#000").text(t, left + 16, doc.y, { width: width - 16 });
    doc.moveDown(0.1);
  });
  doc.moveDown(0.4);
}

// แปลง path รูปสี -> รูปขาวดำใน exam-images-bw
function imageBwPath(image) {
  if (!image) return null;
  const name = image.split("/").pop();
  return join(ROOT, "public", "exam-images-bw", name);
}
