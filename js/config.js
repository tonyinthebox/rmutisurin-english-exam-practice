// ===== ตั้งค่าของเว็บไซต์ (แก้ไฟล์นี้ได้โดยไม่ต้องแตะโค้ดส่วนอื่น) =====
window.EXAM_CONFIG = {
  // ชื่อที่แสดงบนหน้าแรก
  siteTitle: "ฝึกทำข้อสอบภาษาอังกฤษ",
  siteSubtitle: "Listening · Grammar · Reading แนว TOEIC / CEFR",

  // ลิงก์ Google Apps Script สำหรับส่งคะแนนเข้า Google Sheets
  // ปล่อยว่างไว้ = ไม่ส่งคะแนน (นักศึกษาดูผลของตัวเองเท่านั้น)
  // วิธีตั้งค่าดูใน docs/google-sheets-setup.md
  sheetsUrl: "",

  // บังคับให้กรอกชื่อและรหัสนักศึกษาก่อนเริ่มทำข้อสอบหรือไม่
  requireStudentInfo: false,

  // แสดงเฉลยและคำอธิบายหลังส่งคำตอบ
  showAnswersAfterSubmit: true
};
