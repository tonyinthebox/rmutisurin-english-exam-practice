/* English Exam Practice — single-page app (no build step required) */
(() => {
  "use strict";

  const CFG = Object.assign({
    siteTitle: "ฝึกทำข้อสอบภาษาอังกฤษ",
    siteSubtitle: "",
    sheetsUrl: "",
    requireStudentInfo: false,
    showAnswersAfterSubmit: true
  }, window.EXAM_CONFIG || {});

  const LETTERS = "ABCDEFGH";
  const app = document.getElementById("app");
  const topbarExtra = document.getElementById("topbar-extra");

  // ---------- small helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };

  const testCache = {};
  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url} (${res.status})`);
    return res.json();
  }
  async function getTest(id) {
    if (!testCache[id]) {
      const t = await loadJSON(`data/tests/${encodeURIComponent(id)}.json`);
      if (Array.isArray(t.includes)) {
        // combined test: stitch the sections of other test files together, in order
        const parts = await Promise.all(t.includes.map(getTest));
        t.sections = parts.flatMap((p) => p.sections.map((s) => ({
          ...s,
          part: (p.title || p.id).replace(/^.*[–-]\s*/, "").replace(/\s*Part$/i, ""),
          groups: s.groups.map((g) => ({ ...g, audioTest: g.audioTest || p.id }))
        })));
        t.numberOffset = 0;
      }
      testCache[id] = t;
    }
    return testCache[id];
  }
  const allQuestions = (test) => test.sections.flatMap((s) =>
    s.groups.flatMap((g) => g.questions.map((q) => ({ q, g, s }))));

  // ---------- audio: MP3 file, falling back to browser speech ----------
  class ListeningPlayer {
    constructor(test, group, { limit, onChange }) {
      this.src = `audio/${group.audioTest || test.id}/${group.id}.mp3`;
      this.script = group.script || [];
      this.limit = limit;           // null = unlimited
      this.plays = 0;
      this.playing = false;
      this.mode = "file";           // "file" | "speech"
      this.rate = 1;
      this.onChange = onChange || (() => {});
      this.audio = new Audio();
      this.audio.preload = "metadata";
      this.audio.addEventListener("error", () => { this.mode = "speech"; this.onChange(); }, { once: true });
      this.audio.addEventListener("ended", () => { this.playing = false; this.onChange(); });
      this.audio.addEventListener("timeupdate", () => this.onChange());
      this.audio.addEventListener("loadedmetadata", () => this.onChange());
      this.audio.src = this.src;
    }
    get remaining() { return this.limit == null ? Infinity : this.limit - this.plays; }
    get progress() {
      if (this.mode === "file" && this.audio.duration) return this.audio.currentTime / this.audio.duration;
      return this.speechProgress || 0;
    }
    play() {
      if (this.playing || this.remaining <= 0) return;
      ListeningPlayer.stopAll();
      this.plays++;
      this.playing = true;
      ListeningPlayer.current = this;
      if (this.mode === "file") {
        this.audio.currentTime = 0;
        this.audio.playbackRate = this.rate;
        this.audio.play().catch(() => { this.mode = "speech"; this.playSpeech(); });
      } else {
        this.playSpeech();
      }
      this.onChange();
    }
    setRate(r) {
      this.rate = r;
      this.audio.playbackRate = r;
    }
    stop() {
      this.audio.pause();
      if (this.mode === "speech" && window.speechSynthesis) speechSynthesis.cancel();
      this.playing = false;
      this.onChange();
    }
    playSpeech() {
      const synth = window.speechSynthesis;
      if (!synth) { this.playing = false; this.onChange(); return; }
      const voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
      const speakers = [...new Set(this.script.map((l) => l.speaker))];
      const pick = (sp) => voices.length ? voices[speakers.indexOf(sp) % voices.length] : null;
      synth.cancel();
      let i = 0;
      const next = () => {
        if (!this.playing) return;
        if (i >= this.script.length) { this.playing = false; this.speechProgress = 1; this.onChange(); return; }
        const line = this.script[i];
        const u = new SpeechSynthesisUtterance(line.text);
        const v = pick(line.speaker);
        if (v) u.voice = v;
        u.lang = v ? v.lang : "en-US";
        u.rate = 0.92 * this.rate;
        // vary pitch per speaker so dialogues stay distinguishable on single-voice devices
        u.pitch = 0.85 + (speakers.indexOf(line.speaker) % 3) * 0.2;
        u.onend = () => { i++; this.speechProgress = i / this.script.length; this.onChange(); setTimeout(next, 600); };
        u.onerror = u.onend;
        synth.speak(u);
      };
      this.speechProgress = 0;
      setTimeout(next, 300);
    }
    static stopAll() { if (ListeningPlayer.current) ListeningPlayer.current.stop(); }
  }
  if (window.speechSynthesis) speechSynthesis.getVoices(); // warm up voice list

  // ---------- timer ----------
  let timerHandle = null;
  function clearTimer() { clearInterval(timerHandle); timerHandle = null; topbarExtra.innerHTML = ""; }

  // ---------- views ----------
  async function viewHome() {
    clearTimer();
    ListeningPlayer.stopAll();
    let ids;
    try { ids = (await loadJSON("data/tests/index.json")).tests; }
    catch (e) { return showError("โหลดรายการข้อสอบไม่สำเร็จ", e); }

    const tests = await Promise.all(ids.map((id) => getTest(id).catch(() => null)));
    const student = store.get("student", { name: "", sid: "" });
    const history = store.get("history", {});

    app.innerHTML = "";
    app.append(el(`
      <section class="hero">
        <h1>${esc(CFG.siteTitle)}</h1>
        ${CFG.siteSubtitle ? `<p class="hero-sub">${esc(CFG.siteSubtitle)}</p>` : ""}
      </section>`));

    const form = el(`
      <section class="card student">
        <h2>ข้อมูลผู้สอบ ${CFG.requireStudentInfo ? "" : '<span class="muted small">(ไม่บังคับ)</span>'}</h2>
        <div class="fields">
          <label>ชื่อ–นามสกุล<input id="st-name" autocomplete="name" value="${esc(student.name)}"></label>
          <label>รหัสนักศึกษา<input id="st-sid" inputmode="numeric" value="${esc(student.sid)}"></label>
        </div>
      </section>`);
    app.append(form);
    form.addEventListener("input", () => store.set("student", {
      name: form.querySelector("#st-name").value.trim(),
      sid: form.querySelector("#st-sid").value.trim()
    }));

    const list = el(`<section class="test-list"></section>`);
    tests.forEach((t, i) => {
      if (!t) {
        list.append(el(`<div class="card test-card broken"><strong>${esc(ids[i])}</strong><p class="muted">ไฟล์ข้อสอบนี้โหลดไม่ได้</p></div>`));
        return;
      }
      const n = allQuestions(t).length;
      const best = history[t.id]?.best;
      const card = el(`
        <article class="card test-card">
          <div class="test-head">
            <h3>${esc(t.title)}</h3>
            ${t.level ? `<span class="pill">${esc(t.level)}</span>` : ""}
          </div>
          ${t.description ? `<p class="muted">${esc(t.description)}</p>` : ""}
          <ul class="meta">
            <li>${t.sections.map((s) => esc(s.title)).join(" · ")}</li>
            <li>${n} ข้อ</li>
            ${t.timeLimitMinutes ? `<li>${t.timeLimitMinutes} นาที</li>` : ""}
            ${best != null ? `<li class="best">คะแนนสูงสุด ${best}/${n}</li>` : ""}
          </ul>
          <div class="mode-buttons">
            <button class="btn" data-mode="practice" title="ฟังได้ไม่จำกัด เห็นตัวเลือก เฉลยทันที">โหมดฝึก</button>
            <button class="btn primary" data-mode="test" title="จับเวลา ฟังได้จำกัด เหมือนสอบจริง">โหมดสอบ</button>
          </div>
          <p class="mode-hint small muted">โหมดฝึก: ฟังซ้ำได้ เห็นตัวเลือก เฉลยทันที · โหมดสอบ: จับเวลาเหมือนจริง</p>
        </article>`);
      card.querySelectorAll("[data-mode]").forEach((btn) => btn.addEventListener("click", () => {
        const st = store.get("student", { name: "", sid: "" });
        if (CFG.requireStudentInfo && (!st.name || !st.sid)) {
          alert("กรุณากรอกชื่อและรหัสนักศึกษาก่อนเริ่มทำข้อสอบ");
          form.querySelector(st.name ? "#st-sid" : "#st-name").focus();
          return;
        }
        location.hash = `#/${btn.dataset.mode}/${encodeURIComponent(t.id)}`;
      }));
      list.append(card);
    });
    app.append(list);
  }

  // live attempt state
  let attempt = null;

  async function viewTest(id, mode = "exam") {
    clearTimer();
    ListeningPlayer.stopAll();
    let test;
    try { test = await getTest(id); } catch (e) { return showError("ไม่พบข้อสอบชุดนี้", e); }

    const practice = mode === "practice";
    attempt = { test, mode, answers: {}, startedAt: Date.now(), sectionIdx: 0, players: {}, submitted: false };
    const total = allQuestions(test).length;

    // timer
    if (test.timeLimitMinutes && !practice) {
      const endAt = attempt.startedAt + test.timeLimitMinutes * 60000;
      topbarExtra.innerHTML = `<span class="timer" id="timer"></span>`;
      const tick = () => {
        const left = (endAt - Date.now()) / 1000;
        const t = document.getElementById("timer");
        if (t) {
          t.textContent = fmtTime(left);
          t.classList.toggle("warn", left < 120);
        }
        if (left <= 0) { clearTimer(); submit(true); }
      };
      tick();
      timerHandle = setInterval(tick, 1000);
    }

    app.innerHTML = "";
    const shell = el(`
      <div class="exam">
        <div class="exam-head">
          <h1>${esc(test.title)} <span class="mode-badge ${practice ? "practice" : "exam"}">${practice ? "โหมดฝึก" : "โหมดสอบ"}</span></h1>
          ${practice ? '<p class="small muted practice-note">ฟังซ้ำได้ไม่จำกัด เลือกคำตอบแล้วเห็นเฉลยทันที ไม่จับเวลา</p>' : ""}
          <div class="progress"><div class="bar"><span id="prog-bar"></span></div><span id="prog-text" class="small muted"></span></div>
          <nav class="tabs" role="tablist"></nav>
        </div>
        <div id="section-body"></div>
        <div class="exam-foot">
          <button class="btn" id="prev-sec">← ส่วนก่อนหน้า</button>
          <button class="btn" id="next-sec">ส่วนถัดไป →</button>
          <button class="btn primary" id="submit">${practice ? "ดูสรุปผล" : "ส่งคำตอบ"}</button>
        </div>
      </div>`);
    app.append(shell);

    const tabs = shell.querySelector(".tabs");
    test.sections.forEach((s, i) => {
      const b = el(`<button role="tab" class="tab">${esc(s.title)} <span class="count" data-sec="${i}"></span></button>`);
      b.addEventListener("click", () => showSection(i));
      tabs.append(b);
    });
    shell.querySelector("#prev-sec").addEventListener("click", () => showSection(attempt.sectionIdx - 1));
    shell.querySelector("#next-sec").addEventListener("click", () => showSection(attempt.sectionIdx + 1));
    shell.querySelector("#submit").addEventListener("click", () => submit(false));

    function updateProgress() {
      const done = Object.keys(attempt.answers).length;
      shell.querySelector("#prog-bar").style.width = `${(done / total) * 100}%`;
      shell.querySelector("#prog-text").textContent = `ตอบแล้ว ${done}/${total} ข้อ`;
      test.sections.forEach((s, i) => {
        const qs = s.groups.flatMap((g) => g.questions);
        const d = qs.filter((q) => q.id in attempt.answers).length;
        shell.querySelector(`.count[data-sec="${i}"]`).textContent = `${d}/${qs.length}`;
      });
    }

    function showSection(i) {
      if (i < 0 || i >= test.sections.length) return;
      ListeningPlayer.stopAll();
      attempt.sectionIdx = i;
      [...tabs.children].forEach((t, j) => {
        t.classList.toggle("active", j === i);
        t.setAttribute("aria-selected", j === i);
      });
      shell.querySelector("#prev-sec").disabled = i === 0;
      shell.querySelector("#next-sec").disabled = i === test.sections.length - 1;
      const body = shell.querySelector("#section-body");
      body.innerHTML = "";
      body.append(renderSection(test, test.sections[i], { mode: practice ? "practice" : "exam", onAnswer: updateProgress }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    showSection(0);
    updateProgress();
  }

  function renderSection(test, section, { mode, onAnswer }) {
    const review = mode === "review";
    const practice = mode === "practice";
    const wrap = el(`<section class="section"></section>`);
    if (!review && section.instructions) {
      // in practice mode, the "listen only / N plays" exam rules don't apply
      const text = practice && section.groups.some((g) => g.script)
        ? "ฟังซ้ำได้ไม่จำกัด ปรับความเร็วเสียงได้ เปิดดูบทพูดได้ เลือกคำตอบแล้วจะเห็นเฉลยทันที"
        : section.instructions;
      wrap.append(el(`<p class="instructions">${esc(text)}</p>`));
    }
    if (review) wrap.append(el(`<h2 class="review-sec">${esc(section.title)}</h2>`));

    const order = allQuestions(test).map((x) => x.q.id);

    section.groups.forEach((g) => {
      const hasPassage = !!g.passage;
      const block = el(`<div class="group ${hasPassage ? "with-passage" : ""}"></div>`);
      if (g.label) block.append(el(`<div class="group-label">${esc(g.label)}</div>`));

      const inner = el(`<div class="group-inner"></div>`);
      if (g.script) inner.append(renderPlayer(test, g, mode));
      if (hasPassage) inner.append(el(`<div class="passage">${esc(g.passage).replace(/\n/g, "<br>")}</div>`));

      const qs = el(`<div class="questions"></div>`);
      g.questions.forEach((q) => {
        const num = order.indexOf(q.id) + 1 + (test.numberOffset || 0);
        qs.append(renderQuestion(q, num, g, { mode, onAnswer }));
      });
      inner.append(qs);

      if ((review || practice) && g.script) {
        const tr = el(`<details class="transcript"><summary>${practice ? "แสดงบทพูด (Transcript)" : "บทพูด (Transcript)"}</summary></details>`);
        g.script.forEach((l) => tr.append(el(`<p><b>${esc(l.speaker)}:</b> ${esc(l.text)}</p>`)));
        inner.append(tr);
      }
      block.append(inner);
      wrap.append(block);
    });
    return wrap;
  }

  function renderPlayer(test, g, mode) {
    const free = mode !== "exam";               // practice & review: unlimited plays
    const key = `${g.id}:${mode}`;
    const limit = free ? null : (g.playLimit ?? null);
    const box = el(`
      <div class="player">
        <button class="play" aria-label="เล่นเสียง"><span class="icon">▶</span></button>
        <div class="player-main">
          <div class="pbar"><span></span></div>
          <div class="pinfo small muted"></div>
        </div>
        ${free ? `<div class="speed" role="group" aria-label="ความเร็วเสียง">
          <button type="button" data-rate="0.75">0.75x</button>
          <button type="button" data-rate="1">1x</button>
        </div>` : ""}
      </div>`);
    let player = attempt.players[key];
    const render = () => {
      const p = player;
      box.querySelector(".pbar span").style.width = `${(p.progress || 0) * 100}%`;
      const btn = box.querySelector(".play");
      btn.querySelector(".icon").textContent = p.playing ? "■" : "▶";
      btn.disabled = !p.playing && p.remaining <= 0;
      const parts = [];
      if (p.limit != null) parts.push(p.remaining > 0 ? `เล่นได้อีก ${p.remaining} ครั้ง` : "ครบจำนวนครั้งที่ฟังได้แล้ว");
      else if (mode === "practice" && p.plays) parts.push(`ฟังแล้ว ${p.plays} ครั้ง`);
      if (p.mode === "speech") parts.push("ใช้เสียงสำรองจากเบราว์เซอร์");
      box.querySelector(".pinfo").textContent = parts.join(" · ");
      box.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", Number(b.dataset.rate) === p.rate));
    };
    if (!player) {
      player = new ListeningPlayer(test, g, { limit, onChange: () => render() });
      attempt.players[key] = player;
    } else {
      player.onChange = render;
    }
    box.querySelector(".play").addEventListener("click", () => {
      // in exam mode, stopping still uses up the play — like a real test
      if (player.playing) player.stop(); else player.play();
    });
    box.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => {
      player.setRate(Number(b.dataset.rate));
      render();
    }));
    render();
    return box;
  }

  // For Question–Response items the options are spoken ("A. ...") — recover their text from the script
  function spokenOption(g, letter) {
    const line = (g.script || []).find((l) => l.text.trim().startsWith(`${letter}. `));
    return line ? line.text.trim().slice(3) : "";
  }

  function renderQuestion(q, num, g, { mode, onAnswer }) {
    const chosen = attempt.answers[q.id];
    const practice = mode === "practice";
    // practice: reveal right after answering; review: always revealed
    const revealed = mode === "review" || (practice && chosen != null);
    const card = el(`
      <fieldset class="question ${revealed ? (chosen === q.answer ? "correct" : "wrong") : ""}">
        <legend><span class="qnum">${num}</span><span class="qtext">${esc(q.prompt)}</span></legend>
        <div class="options"></div>
      </fieldset>`);
    const opts = card.querySelector(".options");
    const showSpoken = mode !== "exam";
    q.options.forEach((o, i) => {
      const letter = LETTERS[i];
      let text = o.trim() === letter ? "" : o;          // letter-only = listening Q–R item
      if (!text && showSpoken) text = spokenOption(g, letter);
      const lab = el(`
        <label class="option">
          <input type="radio" name="${esc(q.id)}" value="${i}" ${chosen === i ? "checked" : ""} ${revealed ? "disabled" : ""}>
          <span class="letter">${letter}</span>
          ${text ? `<span class="otext">${esc(text)}</span>` : ""}
        </label>`);
      if (revealed) {
        if (i === q.answer) lab.classList.add("is-answer");
        else if (i === chosen) lab.classList.add("is-wrong");
      } else {
        lab.querySelector("input").addEventListener("change", () => {
          attempt.answers[q.id] = i;
          onAnswer && onAnswer();
          if (practice) card.replaceWith(renderQuestion(q, num, g, { mode, onAnswer }));
        });
      }
      opts.append(lab);
    });
    if (revealed && CFG.showAnswersAfterSubmit) {
      const verdict = chosen == null ? "ไม่ได้ตอบ" : chosen === q.answer ? "ถูกต้อง" : `คุณตอบ ${LETTERS[chosen]}`;
      card.append(el(`
        <div class="explain">
          <div class="verdict"><b>${verdict}</b> · เฉลย ${LETTERS[q.answer]}</div>
          ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}
        </div>`));
    }
    return card;
  }

  // ---------- submit & results ----------
  function submit(timeUp) {
    if (!attempt || attempt.submitted) return;
    const { test } = attempt;
    const total = allQuestions(test).length;
    const answered = Object.keys(attempt.answers).length;
    const practice = attempt.mode === "practice";
    if (!timeUp && answered < total &&
      !confirm(`ยังไม่ได้ตอบ ${total - answered} ข้อ ต้องการ${practice ? "ดูสรุปผล" : "ส่งคำตอบ"}เลยหรือไม่?`)) return;

    attempt.submitted = true;
    attempt.finishedAt = Date.now();
    clearTimer();
    ListeningPlayer.stopAll();

    const bySection = test.sections.map((s) => {
      const qs = s.groups.flatMap((g) => g.questions);
      const score = qs.filter((q) => attempt.answers[q.id] === q.answer).length;
      return { id: s.id, title: s.title, score, total: qs.length };
    });
    const score = bySection.reduce((a, b) => a + b.score, 0);
    // combined tests: also total each part (e.g. Listening / Reading)
    const byPart = [];
    test.sections.forEach((s, i) => {
      if (!s.part) return;
      let p = byPart.find((x) => x.title === s.part);
      if (!p) byPart.push(p = { title: s.part, score: 0, total: 0 });
      p.score += bySection[i].score; p.total += bySection[i].total;
    });
    attempt.result = { score, total, bySection, byPart, timeUp };

    // local history
    const history = store.get("history", {});
    const h = history[test.id] || { attempts: [] };
    h.attempts.push({ at: attempt.finishedAt, score, total, mode: attempt.mode });
    h.attempts = h.attempts.slice(-20);
    if (!practice) h.best = Math.max(h.best ?? 0, score);   // best score counts exam mode only
    history[test.id] = h;
    store.set("history", history);

    sendToSheets(test, attempt);
    location.hash = `#/result/${encodeURIComponent(test.id)}`;
  }

  function sendToSheets(test, a) {
    if (!CFG.sheetsUrl) return;
    const st = store.get("student", { name: "", sid: "" });
    const payload = {
      timestamp: new Date(a.finishedAt).toISOString(),
      name: st.name, studentId: st.sid,
      testId: test.id, testTitle: test.title, mode: a.mode === "practice" ? "practice" : "exam",
      score: a.result.score, total: a.result.total,
      sections: Object.fromEntries([...a.result.byPart, ...a.result.bySection].map((s) => [s.title, `${s.score}/${s.total}`])),
      minutes: Math.round((a.finishedAt - a.startedAt) / 6000) / 10,
      answers: Object.fromEntries(allQuestions(test).map(({ q }) =>
        [q.id, a.answers[q.id] == null ? "" : LETTERS[a.answers[q.id]]]))
    };
    a.sheetStatus = "sending";
    fetch(CFG.sheetsUrl, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(() => { a.sheetStatus = "sent"; updateSheetNote(); })
      .catch(() => { a.sheetStatus = "failed"; updateSheetNote(); });
  }
  function updateSheetNote() {
    const n = document.getElementById("sheet-note");
    if (!n || !attempt) return;
    n.textContent = { sending: "กำลังส่งคะแนนให้อาจารย์…", sent: "ส่งคะแนนให้อาจารย์แล้ว", failed: "ส่งคะแนนไม่สำเร็จ กรุณาแจ้งอาจารย์" }[attempt.sheetStatus] || "";
  }

  function viewResult(id) {
    clearTimer();
    if (!attempt || !attempt.submitted || attempt.test.id !== id) { location.hash = "#/"; return; }
    const { test, result } = attempt;
    const pct = Math.round((result.score / result.total) * 100);
    const mins = Math.round((attempt.finishedAt - attempt.startedAt) / 60000);

    app.innerHTML = "";
    app.append(el(`
      <section class="card result">
        <p class="small muted">${esc(test.title)} · ${attempt.mode === "practice" ? "โหมดฝึก" : "โหมดสอบ"}${result.timeUp ? " · หมดเวลา ส่งคำตอบอัตโนมัติ" : ""}</p>
        <div class="score"><span class="big">${result.score}</span><span class="of">/ ${result.total}</span><span class="pct">${pct}%</span></div>
        ${result.byPart.length ? `<div class="part-scores">${result.byPart.map((p) => `
          <div class="part-score"><span>${esc(p.title)}</span><b>${p.score}<small>/${p.total}</small></b></div>`).join("")}</div>` : ""}
        <div class="sec-scores">
          ${result.bySection.map((s) => `
            <div class="sec-score">
              <span>${esc(s.title)}</span>
              <div class="bar"><span style="width:${(s.score / s.total) * 100}%"></span></div>
              <b>${s.score}/${s.total}</b>
            </div>`).join("")}
        </div>
        <p class="small muted">ใช้เวลา ${mins} นาที <span id="sheet-note"></span></p>
        <div class="actions">
          <a class="btn" href="#/">กลับหน้าแรก</a>
          <a class="btn" href="#/${attempt.mode === "practice" ? "practice" : "test"}/${encodeURIComponent(test.id)}">ทำอีกครั้ง</a>
          ${attempt.mode === "practice" ? `<a class="btn primary" href="#/test/${encodeURIComponent(test.id)}">ลองโหมดสอบ</a>` : ""}
        </div>
      </section>`));
    updateSheetNote();

    if (CFG.showAnswersAfterSubmit) {
      app.append(el(`<h2 class="review-title">เฉลยและคำอธิบาย</h2>`));
      test.sections.forEach((s) => app.append(renderSection(test, s, { mode: "review" })));
    }
    window.scrollTo({ top: 0 });
  }

  function showError(msg, e) {
    app.innerHTML = "";
    app.append(el(`<div class="card error"><h2>${esc(msg)}</h2><p class="muted small">${esc(e && e.message)}</p><a class="btn" href="#/">กลับหน้าแรก</a></div>`));
  }

  // ---------- router ----------
  function route() {
    const [view, id] = location.hash.replace(/^#\/?/, "").split("/");
    if (attempt && !attempt.submitted && view !== "test" && view !== "practice") {
      // leaving an unfinished test
      attempt = null;
    }
    if (view === "test" && id) return viewTest(decodeURIComponent(id), "exam");
    if (view === "practice" && id) return viewTest(decodeURIComponent(id), "practice");
    if (view === "result" && id) return viewResult(decodeURIComponent(id));
    return viewHome();
  }

  window.addEventListener("beforeunload", (e) => {
    if (attempt && !attempt.submitted && Object.keys(attempt.answers).length) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("hashchange", route);
  route();
})();
