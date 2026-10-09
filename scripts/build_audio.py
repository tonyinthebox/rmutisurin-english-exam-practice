"""
สร้างไฟล์เสียง Listening จากบทพูด (script) ในไฟล์ข้อสอบ data/tests/*.json

- ใช้ edge-tts (เสียง neural ของ Microsoft) สร้างเสียงทีละบรรทัด
- ต่อทุกบรรทัดเป็นไฟล์ MP3 เดียวต่อหนึ่งชุดคำถาม พร้อมเว้นช่วงเงียบระหว่างผู้พูด
- สร้างใหม่เฉพาะชุดที่บทพูดหรือเสียงเปลี่ยน (เช็คจาก audio/manifest.json)

วิธีใช้:
    pip install edge-tts
    python scripts/build_audio.py            # สร้างเฉพาะชุดที่เปลี่ยน
    python scripts/build_audio.py --force    # สร้างใหม่ทั้งหมด

ต้องมี ffmpeg ในเครื่อง (GitHub Actions มีให้แล้ว)
"""
import asyncio
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = ROOT / "data" / "tests"
AUDIO_DIR = ROOT / "audio"
MANIFEST = AUDIO_DIR / "manifest.json"

DEFAULT_VOICE = "en-US-JennyNeural"
PAUSE_BETWEEN_LINES = 0.8   # วินาที ระหว่างบรรทัด
PAUSE_LEAD_IN = 0.5         # วินาที ก่อนเริ่มพูด
RATE = "-5%"                # ช้าลงเล็กน้อยสำหรับผู้เรียน A2–B1


def group_hash(lines, voices):
    payload = json.dumps(
        {"lines": lines, "voices": voices, "rate": RATE,
         "pause": PAUSE_BETWEEN_LINES},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def silence(path, seconds):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "anullsrc=r=24000:cl=mono", "-t", str(seconds),
         "-q:a", "9", "-acodec", "libmp3lame", str(path)],
        check=True,
    )


async def synth(text, voice, path):
    communicate = edge_tts.Communicate(text, voice, rate=RATE)
    await communicate.save(str(path))


async def build_group(test_id, group, voices, out_path):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        lead = tmp / "lead.mp3"
        gap = tmp / "gap.mp3"
        silence(lead, PAUSE_LEAD_IN)
        silence(gap, PAUSE_BETWEEN_LINES)

        parts = [lead]
        for i, line in enumerate(group["script"]):
            voice = voices.get(line.get("speaker", ""), DEFAULT_VOICE)
            clip = tmp / f"line{i:03d}.mp3"
            for attempt in range(3):
                try:
                    await synth(line["text"], voice, clip)
                    break
                except Exception as exc:  # network hiccup → retry
                    if attempt == 2:
                        raise
                    print(f"  retry {attempt + 1}: {exc}")
                    await asyncio.sleep(2)
            parts.append(clip)
            parts.append(gap)

        listfile = tmp / "list.txt"
        listfile.write_text(
            "".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8"
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        # เข้ารหัสใหม่ทั้งไฟล์ให้เป็นโมโน 24 kHz 48 kbps → ไฟล์เล็ก เสียงพูดยังชัด
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", str(listfile), "-ac", "1", "-ar", "24000", "-b:a", "48k",
             str(out_path)],
            check=True,
        )


async def main(force=False):
    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    built = skipped = 0

    for test_file in sorted(TESTS_DIR.glob("*.json")):
        if test_file.name == "index.json":
            continue
        test = json.loads(test_file.read_text("utf-8"))
        voices = test.get("voices", {})
        for section in test.get("sections", []):
            for group in section.get("groups", []):
                if not group.get("script"):
                    continue
                key = f"{test['id']}/{group['id']}"
                rel = f"audio/{test['id']}/{group['id']}.mp3"
                out_path = ROOT / rel
                used_voices = {
                    l.get("speaker", ""): voices.get(l.get("speaker", ""), DEFAULT_VOICE)
                    for l in group["script"]
                }
                h = group_hash(group["script"], used_voices)
                if not force and manifest.get(key) == h and out_path.exists():
                    skipped += 1
                    continue
                print(f"▶ building {rel}")
                await build_group(test["id"], group, voices, out_path)
                manifest[key] = h
                built += 1

    AUDIO_DIR.mkdir(exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True), "utf-8")
    print(f"done: {built} built, {skipped} unchanged")


if __name__ == "__main__":
    asyncio.run(main(force="--force" in sys.argv))
