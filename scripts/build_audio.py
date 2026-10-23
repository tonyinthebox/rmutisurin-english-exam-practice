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
PAUSE_BEFORE_QUESTIONS = 1.5  # วินาที ก่อนเริ่มอ่านคำถาม (เสียงโหมดสอบ)
PAUSE_ANSWER = 4.0           # วินาที ให้เวลาตอบหลังอ่านตัวเลือกครบ
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


async def build_segments(segments, out_path):
    """segments: list of (text, voice, pause_after_seconds) → one MP3 file"""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        lead = tmp / "lead.mp3"
        silence(lead, PAUSE_LEAD_IN)
        gaps = {}
        parts = [lead]
        for i, (text, voice, pause) in enumerate(segments):
            clip = tmp / f"line{i:03d}.mp3"
            for attempt in range(3):
                try:
                    await synth(text, voice, clip)
                    break
                except Exception as exc:  # network hiccup → retry
                    if attempt == 2:
                        raise
                    print(f"  retry {attempt + 1}: {exc}")
                    await asyncio.sleep(2)
            parts.append(clip)
            if pause not in gaps:
                gaps[pause] = tmp / f"gap{len(gaps)}.mp3"
                silence(gaps[pause], pause)
            parts.append(gaps[pause])

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


def script_segments(group, voices):
    return [(l["text"], voices.get(l.get("speaker", ""), DEFAULT_VOICE), PAUSE_BETWEEN_LINES)
            for l in group["script"]]


def needs_exam_audio(group):
    """Conversations/talks whose options are printed in practice mode.
    In exam mode nothing is printed, so questions + options must be spoken."""
    return any(not all(o.strip() == "ABCD"[i] for i, o in enumerate(q["options"]))
               for q in group["questions"])


def exam_segments(group, voices, numbers):
    narrator = voices.get("N", DEFAULT_VOICE)
    segs = script_segments(group, voices)
    segs[-1] = (segs[-1][0], segs[-1][1], PAUSE_BEFORE_QUESTIONS)
    for q in group["questions"]:
        segs.append((f"Question {numbers[q['id']]}. {q['prompt']}", narrator, 0.7))
        for i, o in enumerate(q["options"]):
            last = i == len(q["options"]) - 1
            segs.append((f"{'ABCD'[i]}. {o}", narrator, PAUSE_ANSWER if last else 0.5))
    return segs


async def main(force=False):
    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    built = skipped = 0

    for test_file in sorted(TESTS_DIR.glob("*.json")):
        if test_file.name == "index.json":
            continue
        test = json.loads(test_file.read_text("utf-8"))
        if "includes" in test:      # combined test — audio comes from its parts
            continue
        voices = test.get("voices", {})
        # question numbers as shown on screen (spoken in exam audio)
        all_q = [q for s in test.get("sections", []) for g in s.get("groups", []) for q in g["questions"]]
        numbers = {q["id"]: i + 1 + test.get("numberOffset", 0) for i, q in enumerate(all_q)}
        for section in test.get("sections", []):
            for group in section.get("groups", []):
                if not group.get("script"):
                    continue
                jobs = [("", script_segments(group, voices))]
                if needs_exam_audio(group):
                    jobs.append(("-exam", exam_segments(group, voices, numbers)))
                for suffix, segs in jobs:
                    key = f"{test['id']}/{group['id']}{suffix}"
                    rel = f"audio/{test['id']}/{group['id']}{suffix}.mp3"
                    out_path = ROOT / rel
                    h = (group_hash(group["script"], {l.get("speaker", ""): voices.get(l.get("speaker", ""), DEFAULT_VOICE) for l in group["script"]})
                         if not suffix else group_hash(segs, {"exam": 1}))
                    if not force and manifest.get(key) == h and out_path.exists():
                        skipped += 1
                        continue
                    print(f"▶ building {rel}")
                    await build_segments(segs, out_path)
                    manifest[key] = h
                    built += 1

    AUDIO_DIR.mkdir(exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True), "utf-8")
    print(f"done: {built} built, {skipped} unchanged")


if __name__ == "__main__":
    asyncio.run(main(force="--force" in sys.argv))
