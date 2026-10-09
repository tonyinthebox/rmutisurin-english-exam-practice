"""
ตรวจไฟล์ข้อสอบก่อนเผยแพร่ เพื่อกันข้อผิดพลาดที่พบบ่อย เช่น
เฉลยเกินจำนวนตัวเลือก รหัสข้อซ้ำ หรือลืมใส่คำอธิบาย

วิธีใช้:  python scripts/validate.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = ROOT / "data" / "tests"
errors, warnings = [], []


def err(where, msg):
    errors.append(f"✗ {where}: {msg}")


def warn(where, msg):
    warnings.append(f"! {where}: {msg}")


index = json.loads((TESTS_DIR / "index.json").read_text("utf-8"))
listed = set(index.get("tests", []))
files = {p.stem for p in TESTS_DIR.glob("*.json") if p.name != "index.json"}

for missing in listed - files:
    err("index.json", f"อ้างถึง {missing} แต่ไม่พบไฟล์ data/tests/{missing}.json")
for extra in files - listed:
    warn("index.json", f"มีไฟล์ {extra}.json แต่ยังไม่ได้ใส่ใน index.json (จะไม่แสดงบนเว็บ)")

for name in sorted(files):
    path = TESTS_DIR / f"{name}.json"
    try:
        test = json.loads(path.read_text("utf-8"))
    except json.JSONDecodeError as e:
        err(path.name, f"JSON ผิดรูปแบบ บรรทัด {e.lineno} คอลัมน์ {e.colno}: {e.msg}")
        continue

    if test.get("id") != name:
        err(path.name, f'"id" ต้องตรงกับชื่อไฟล์ ({name})')
    if "includes" in test:   # combined test made from other test files
        for inc in test["includes"]:
            if inc not in files:
                err(path.name, f'"includes" อ้างถึง {inc} แต่ไม่พบไฟล์ data/tests/{inc}.json')
        continue
    for field in ("title", "sections"):
        if field not in test:
            err(path.name, f'ไม่มี "{field}"')

    voices = test.get("voices", {})
    seen_q, seen_g = set(), set()
    for s in test.get("sections", []):
        for g in s.get("groups", []):
            gid = g.get("id", "?")
            where = f"{path.name} › {gid}"
            if gid in seen_g:
                err(where, "รหัสชุดคำถาม (group id) ซ้ำ")
            seen_g.add(gid)
            for line in g.get("script", []):
                sp = line.get("speaker")
                if sp and sp not in voices:
                    warn(where, f'ผู้พูด "{sp}" ไม่มีใน "voices" จะใช้เสียงเริ่มต้นแทน')
                if any("฀" <= ch <= "๿" for ch in line.get("text", "")):
                    err(where, "บทพูดมีอักษรไทย เสียงภาษาอังกฤษจะอ่านไม่ได้ ใช้ชื่อแบบอักษรโรมันแทน")
            if not g.get("questions"):
                err(where, "ไม่มีคำถาม")
            for q in g.get("questions", []):
                qid = q.get("id", "?")
                qw = f"{path.name} › {qid}"
                if qid in seen_q:
                    err(qw, "รหัสข้อ (question id) ซ้ำ")
                seen_q.add(qid)
                opts = q.get("options", [])
                if len(opts) < 2:
                    err(qw, "ตัวเลือกน้อยกว่า 2 ตัว")
                ans = q.get("answer")
                if not isinstance(ans, int) or not 0 <= ans < len(opts):
                    err(qw, f"answer = {ans!r} ต้องเป็นเลข 0–{len(opts) - 1} (0 = ตัวเลือกแรก)")
                if len(set(opts)) != len(opts):
                    err(qw, "มีตัวเลือกซ้ำกัน")
                if not q.get("explanation"):
                    warn(qw, "ยังไม่มีคำอธิบายเฉลย")

for w in warnings:
    print(w)
for e in errors:
    print(e)
print(f"\nตรวจ {len(files)} ชุดข้อสอบ: {len(errors)} ข้อผิดพลาด, {len(warnings)} คำเตือน")
sys.exit(1 if errors else 0)
