# ตั้งค่าส่งคะแนนเข้า Google Sheets (ทางเลือก)

ทำครั้งเดียว ใช้เวลาประมาณ 5 นาที หลังตั้งค่าแล้ว ทุกครั้งที่นักศึกษาส่งคำตอบ
จะมีแถวใหม่ในชีตพร้อมชื่อ รหัส คะแนนรวม คะแนนรายภาค และคำตอบรายข้อ

1. สร้าง Google Sheet ใหม่ ตั้งชื่อตามต้องการ เช่น `คะแนนฝึกสอบ 2569`
2. ไปที่เมนู **Extensions → Apps Script**
3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดจากไฟล์ `docs/google-apps-script.gs` กด **Save**
4. กด **Deploy → New deployment**
   - กดรูปฟันเฟือง เลือก **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy** แล้วอนุญาตสิทธิ์ (Google จะเตือนว่าแอปยังไม่ได้ตรวจสอบ ให้กด Advanced → Go to … เพราะเป็นสคริปต์ของอาจารย์เอง)
5. คัดลอก **Web app URL** (ขึ้นต้นด้วย `https://script.google.com/macros/s/.../exec`)
6. เปิดไฟล์ `js/config.js` ใน GitHub แล้ววาง URL ที่ `sheetsUrl`

   ```js
   sheetsUrl: "https://script.google.com/macros/s/XXXX/exec",
   requireStudentInfo: true,
   ```

   ตั้ง `requireStudentInfo: true` เพื่อบังคับให้นักศึกษากรอกชื่อและรหัสก่อนเริ่ม
7. Commit การแก้ไข รอ 1–2 นาที เว็บจะอัปเดตเอง

## หมายเหตุ

- ถ้าแก้โค้ด Apps Script ภายหลัง ต้อง **Deploy → Manage deployments → Edit → New version** ทุกครั้ง URL จะยังเหมือนเดิม
- ข้อสอบหลายชุดใช้ชีตเดียวกันได้ ระบบจะเพิ่มคอลัมน์ให้อัตโนมัติ
- ลิงก์ Web app อยู่ในโค้ดหน้าเว็บ คนที่รู้ลิงก์จึงส่งข้อมูลปลอมเข้าชีตได้ เหมาะกับการเก็บคะแนนฝึก ไม่เหมาะกับการสอบที่มีผลต่อเกรดโดยตรง
