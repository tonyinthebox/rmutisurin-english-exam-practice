# English Exam Practice

เว็บไซต์ฝึกทำข้อสอบภาษาอังกฤษ ภาค **Listening · Grammar · Reading** แนว TOEIC / CEFR
ทำงานบน GitHub Pages ฟรี ไม่ต้องมีเซิร์ฟเวอร์ เปิดได้ทั้งมือถือและคอมพิวเตอร์

**สองโหมดจากข้อสอบชุดเดียวกัน**
- **โหมดฝึก:** ฟังซ้ำได้ไม่จำกัด ปรับความเร็ว 0.75x/1x เห็นตัวเลือกทุกข้อ (รวม Question–Response) เปิดดูบทพูดได้ เลือกคำตอบแล้วเห็นเฉลยทันที ไม่จับเวลา
- **โหมดสอบ:** จับเวลา ฟังได้ตามจำนวนครั้งที่กำหนด (`playLimit`) ข้อ Question–Response ฟังอย่างเดียว เฉลยหลังส่ง

**ความสามารถ**
- จับเวลา ส่งอัตโนมัติเมื่อหมดเวลา ตรวจคะแนนทันที แยกคะแนนรายภาค
- เฉลยพร้อมคำอธิบายภาษาไทย และบทพูด (transcript) หลังส่งคำตอบ
- ภาค Listening จำกัดจำนวนครั้งที่ฟังได้ต่อชุด
- เสียง Listening สร้างอัตโนมัติจากบทพูดด้วย TTS หลายสำเนียง (US, UK, AU, CA)
- ส่งคะแนนเข้า Google Sheets ได้ (ไม่บังคับ)

---

## เริ่มใช้งานครั้งแรก

1. **สร้าง repository ใหม่** ใน GitHub เช่น `english-exam-practice` เลือก **Public**
2. **อัปโหลดไฟล์ทั้งหมด** ในโฟลเดอร์นี้ (แนะนำใช้ [GitHub Desktop](https://desktop.github.com/) เพราะการลากไฟล์ผ่านเว็บอาจไม่รวมโฟลเดอร์ `.github` ที่ซ่อนอยู่)
   - ถ้าอัปโหลดผ่านเว็บ ให้ตรวจว่ามีไฟล์ `.github/workflows/build-and-deploy.yml` ถ้าไม่มี ให้กด **Add file → Create new file** ตั้งชื่อ `.github/workflows/build-and-deploy.yml` แล้ววางเนื้อหาจากไฟล์ต้นฉบับ
3. ไปที่ **Settings → Pages** ตรง Source เลือก **GitHub Actions**
4. ไปที่แท็บ **Actions** จะเห็นงาน *Build audio & deploy site* กำลังทำงาน (ถ้าไม่เริ่มเอง กด **Run workflow**)
5. รอ 2–3 นาที เว็บจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ-repo>/`

ทุกครั้งที่แก้ไขไฟล์ใน repo ระบบจะตรวจข้อสอบ สร้างเสียงเฉพาะชุดที่เปลี่ยน และอัปเดตเว็บให้เองภายในไม่กี่นาที

> ระหว่างที่ยังไม่มีไฟล์เสียง MP3 เว็บจะใช้เสียงอ่านของเบราว์เซอร์แทนชั่วคราว

---

## โครงสร้างไฟล์

```
index.html                 หน้าเว็บ
css/style.css              หน้าตาเว็บ
js/app.js                  ระบบทำข้อสอบ
js/config.js               ← ตั้งค่า (ชื่อเว็บ, Google Sheets)
data/tests/index.json      ← รายการข้อสอบที่แสดงบนเว็บ
data/tests/*.json          ← ข้อสอบแต่ละชุด
audio/                     ไฟล์เสียง (สร้างอัตโนมัติ ไม่ต้องแก้)
scripts/build_audio.py     สคริปต์สร้างเสียง
scripts/validate.py        สคริปต์ตรวจไฟล์ข้อสอบ
docs/                      คู่มือเชื่อม Google Sheets
```

---

## เพิ่มข้อสอบชุดใหม่

1. คัดลอก `data/tests/practice-01.json` เป็นไฟล์ใหม่ เช่น `practice-02.json`
2. แก้ `"id"` ให้ตรงกับชื่อไฟล์ (`"practice-02"`)
3. เพิ่มชื่อชุดใน `data/tests/index.json`

   ```json
   { "tests": ["practice-01", "practice-02"] }
   ```

### รูปแบบคำถาม

```json
{
  "id": "G1",
  "prompt": "The manager _______ the meeting until next week.",
  "options": ["postpone", "has postponed", "postponing", "to postpone"],
  "answer": 1,
  "explanation": "คำอธิบายเฉลยภาษาไทย"
}
```

- `answer` นับจาก **0** (0 = A, 1 = B, 2 = C, 3 = D)
- `id` ของแต่ละข้อห้ามซ้ำกันในชุดเดียวกัน

### ชุด Listening

ใส่ `script` คือบทพูดทีละบรรทัด ระบุผู้พูดด้วยรหัสที่กำหนดไว้ใน `voices` ด้านบนของไฟล์

```json
{
  "id": "conversation-2",
  "label": "Short Conversation",
  "playLimit": 2,
  "script": [
    { "speaker": "W", "text": "Have you booked the meeting room?" },
    { "speaker": "M", "text": "Yes, room B on the third floor." }
  ],
  "questions": [ ... ]
}
```

- `playLimit` = จำนวนครั้งที่ฟังได้ (ลบออกถ้าไม่จำกัด)
- ข้อ Question–Response ให้ใส่ตัวเลือกในบทพูด แล้วใช้ `"options": ["A", "B", "C"]`
- **บทพูดต้องเป็นอักษรโรมันเท่านั้น** ชื่อไทยให้เขียนเป็น Somchai, Nipa ฯลฯ

### เสียงที่ใช้ได้ (ตัวอย่าง)

| สำเนียง | ผู้หญิง | ผู้ชาย |
|---|---|---|
| อเมริกัน | `en-US-JennyNeural`, `en-US-AriaNeural` | `en-US-GuyNeural`, `en-US-ChristopherNeural` |
| อังกฤษ | `en-GB-SoniaNeural`, `en-GB-LibbyNeural` | `en-GB-RyanNeural` |
| ออสเตรเลีย | `en-AU-NatashaNeural` | `en-AU-WilliamNeural` |
| แคนาดา | `en-CA-ClaraNeural` | `en-CA-LiamNeural` |

ดูรายชื่อทั้งหมดได้ด้วยคำสั่ง `edge-tts --list-voices`

### ตรวจไฟล์ก่อน commit (ถ้ามี Python ในเครื่อง)

```
python scripts/validate.py
```

ถ้าไม่ได้ตรวจเอง GitHub Actions จะตรวจให้ และจะไม่อัปเดตเว็บถ้าพบข้อผิดพลาด (ดูรายละเอียดได้ในแท็บ Actions)

---

## แบบฝึก Speaking (CU-TEP Part 1 Picture Story)

เปิดที่ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ-repo>/speaking/` หรือกดการ์ด **ฝึก Speaking** บนหน้าแรก

| หน้า | ใช้ทำอะไร |
|---|---|
| `speaking/index.html` | หน้ารวม แสดงความก้าวหน้า (เก็บในเบราว์เซอร์ของผู้เรียน) |
| `speaking/shadowing.html` | ฟังคำตอบตัวอย่างทีละประโยค พูดตาม อัดเสียง และเทียบกับต้นแบบ |
| `speaking/drills.html` | Drill สั้น: Connector sprint, เชื่อมภาพยาก, Pattern 7 บรรทัด |
| `speaking/exam.html` | จำลองสอบพร้อมเสียงกรรมการ จับเวลา ตรวจภาพครบ/connector และ rubric |

**เนื้อหาทั้งหมดอยู่ใน `data/speaking/part1.json`** แก้ได้โดยไม่ต้องแตะโค้ด

- `pictures` คลังภาพ: `id`, `emoji` (ใช้แทนภาพชั่วคราว), `label`, `kw` (คำที่ใช้ตรวจว่าผู้เรียนพูดถึงภาพนี้) และ `img` (ไม่บังคับ)
- `sets` ชุด 6 ภาพพร้อมคำตอบตัวอย่าง แต่ละประโยคมี `id` และ `say`
- `examiner`, `connectors`, `roles`, `pattern` คำสั่งกรรมการและโจทย์ของ Drills

**เพิ่มภาพจริงแทน emoji:** อัปโหลดภาพไว้ที่ `speaking/images/` แล้วใส่ `"img": "images/ชื่อไฟล์.jpg"` ในภาพนั้น และบันทึกที่มาของภาพใน `speaking/images/CREDITS.md`

**เสียง:** ทุกรายการที่มี `id` + `say` จะถูกสร้างเป็น `audio/speaking/<id>.mp3` อัตโนมัติด้วย edge-tts เมื่อ push ขึ้น `main` เปลี่ยนเสียงได้ด้วย `"voice"` (ใส่ที่ชุดหรือที่ประโยค) ระหว่างที่ยังไม่มีไฟล์ MP3 เว็บจะใช้เสียงอ่านของเบราว์เซอร์แทน

- `id` ใช้ได้เฉพาะ a-z, 0-9 และ `-` และห้ามซ้ำกันทั้งไฟล์
- ตรวจไฟล์ก่อน commit: `python scripts/build_speaking_audio.py --check`

**ข้อจำกัด:** การถอดเสียงเป็นข้อความทำงานเต็มที่บน Chrome/Edge (Android, Windows, Mac) บน iPhone อัดเสียงและฟังได้ แต่การถอดเสียงอาจไม่ทำงาน ผู้เรียนพิมพ์คำตอบเองได้ในหน้าผลลัพธ์

---

## เก็บคะแนนใน Google Sheets

ดูขั้นตอนใน [docs/google-sheets-setup.md](docs/google-sheets-setup.md)

---

## ข้อควรรู้

- เฉลยอยู่ในไฟล์ข้อสอบที่เบราว์เซอร์โหลด ผู้ที่เปิดดูโค้ดได้จะเห็นเฉลย ระบบนี้จึงเหมาะกับ **การฝึก** ไม่ใช่การสอบที่นับคะแนนจริง
- เสียงสร้างด้วย `edge-tts` ซึ่งเรียกใช้บริการอ่านออกเสียงของ Microsoft Edge แบบไม่เป็นทางการ หากวันหนึ่งใช้ไม่ได้ สามารถเปลี่ยนไปใช้ Google Cloud TTS หรืออัดเสียงเองแล้ววางไฟล์ MP3 ที่ `audio/<test-id>/<group-id>.mp3` ได้
- ถ้าขั้นตอน "บันทึกไฟล์เสียงกลับเข้า repository" ล้มเหลว ให้ไปที่ **Settings → Actions → General → Workflow permissions** เลือก **Read and write permissions**


---

**Designed by** Suparat Walakanon and Thitiwan Mingpruek  
The International Studies Center, Rajamangala University of Technology Isan (RMUTI), Surin Campus  
© 2026
