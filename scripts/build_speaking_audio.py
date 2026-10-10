"""
สร้างไฟล์เสียงสำหรับแบบฝึก Speaking จาก data/speaking/*.json

- ทุก object ที่มีทั้ง "id" และ "say" จะได้ไฟล์เสียง audio/speaking/<id>.mp3 หนึ่งไฟล์
- เสียงที่ใช้: "voice" ของ object นั้น หรือของ object ที่ครอบอยู่ใกล้ที่สุด หรือของไฟล์
- สร้างใหม่เฉพาะประโยคที่ข้อความหรือเสียงเปลี่ยน (เช็คจาก audio/speaking/manifest.json)
- เว็บจะใช้เสียงอ่านของเบราว์เซอร์แทนชั่วคราวสำหรับประโยคที่ยังไม่มีไฟล์ MP3

วิธีใช้:
    pip install edge-tts
    python scripts/build_speaking_audio.py            # สร้างเฉพาะที่เปลี่ยน
    python scripts/build_speaking_audio.py --check    # ตรวจไฟล์ข้อมูลอย่างเดียว ไม่สร้างเสียง
    python scripts/build_speaking_audio.py --force    # สร้างใหม่ทั้งหมด

ต้องมี ffmpeg ในเครื่อง (GitHub Actions มีให้แล้ว)
"""
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "speaking"
OUT_DIR = ROOT / "audio" / "speaking"
MANIFEST = OUT_DIR / "manifest.json"

DEFAULT_VOICE = "en-US-JennyNeural"
DEFAULT_RATE = "-5%"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def collect(node, voice, rate, out, where):
    """เดินทั้งไฟล์ เก็บทุก object ที่มี id + say พร้อมเสียงที่สืบทอดมา"""
    if isinstance(node, dict):
        voice = node.get("voice", voice)
        rate = node.get("rate", rate)
        if "id" in node and "say" in node:
            out.append({"id": node["id"], "say": node["say"], "voice": voice, "rate": rate, "where": where})
        for k, v in node.items():
            collect(v, voice, rate, out, where)
    elif isinstance(node, list):
        for v in node:
            collect(v, voice, rate, out, where)


def load_items():
    items, errors = [], []
    for f in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text("utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{f.name}: JSON ไม่ถูกต้อง ({e})")
            continue
        collect(data, data.get("voice", DEFAULT_VOICE), data.get("rate", DEFAULT_RATE), items, f.name)
        errors += check_refs(data, f.name)
    seen = {}
    for it in items:
        if not ID_RE.match(it["id"]):
            errors.append(f'{it["where"]}: id "{it["id"]}" ใช้ได้เฉพาะ a-z 0-9 และ -')
        if it["id"] in seen:
            errors.append(f'{it["where"]}: id "{it["id"]}" ซ้ำกับใน {seen[it["id"]]}')
        seen[it["id"]] = it["where"]
        if not str(it["say"]).strip():
            errors.append(f'{it["where"]}: "{it["id"]}" ไม่มีข้อความใน say')
    return items, errors


def check_refs(data, name):
    """ตรวจว่าชุดภาพอ้างถึงภาพที่มีอยู่จริง และมีครบ 6 ภาพ"""
    errors = []
    pic_ids = {p.get("id") for p in data.get("pictures", [])}
    for s in data.get("sets", []):
        pics = s.get("pics", [])
        if len(pics) != 6:
            errors.append(f'{name}: ชุด "{s.get("id")}" ต้องมี 6 ภาพ (มี {len(pics)})')
        for p in pics:
            if p not in pic_ids:
                errors.append(f'{name}: ชุด "{s.get("id")}" อ้างถึงภาพ "{p}" ที่ไม่มีใน pictures')
    if data.get("pictures") is not None and len(pic_ids) < 6:
        errors.append(f"{name}: pictures ต้องมีอย่างน้อย 6 ภาพ")
    return errors


def item_hash(it):
    payload = json.dumps({k: it[k] for k in ("say", "voice", "rate")}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


async def synth(it, out_path):
    import edge_tts  # นำเข้าตอนสร้างเสียงเท่านั้น เพื่อให้ --check ทำงานได้โดยไม่ต้องติดตั้ง

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.mp3"
        for attempt in range(3):
            try:
                await edge_tts.Communicate(it["say"], it["voice"], rate=it["rate"]).save(str(raw))
                break
            except Exception as exc:  # network hiccup → retry
                if attempt == 2:
                    raise
                print(f"  retry {attempt + 1}: {exc}")
                await asyncio.sleep(2)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        # โมโน 24 kHz 48 kbps + เว้นเงียบสั้นๆ ก่อนพูด → ไฟล์เล็ก เริ่มเล่นไม่กุดหัว
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-af", "adelay=150:all=1", "-ac", "1", "-ar", "24000", "-b:a", "48k", str(out_path)],
            check=True,
        )


async def main(force=False, check_only=False):
    items, errors = load_items()
    if errors:
        print("พบข้อผิดพลาดในไฟล์ data/speaking:")
        for e in errors:
            print("  ✗", e)
        sys.exit(1)
    print(f"ตรวจไฟล์ Speaking ผ่าน: {len(items)} ประโยคที่มีเสียง")
    if check_only:
        return

    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    built = skipped = 0
    for it in items:
        out_path = OUT_DIR / f'{it["id"]}.mp3'
        h = item_hash(it)
        if not force and manifest.get(it["id"]) == h and out_path.exists():
            skipped += 1
            continue
        print(f'▶ building audio/speaking/{it["id"]}.mp3')
        await synth(it, out_path)
        manifest[it["id"]] = h
        built += 1

    # ลบรายการของประโยคที่ถูกลบออกจากข้อมูลแล้ว
    current = {it["id"] for it in items}
    for old in [k for k in manifest if k not in current]:
        manifest.pop(old)
        (OUT_DIR / f"{old}.mp3").unlink(missing_ok=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True), "utf-8")
    print(f"done: {built} built, {skipped} unchanged")


if __name__ == "__main__":
    asyncio.run(main(force="--force" in sys.argv, check_only="--check" in sys.argv))
