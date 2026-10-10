// ===== เครื่องมือกลางของแบบฝึก Speaking (เสียง, อัดเสียง, ถอดเสียง, จับเวลา, บันทึกความก้าวหน้า) =====
(function () {
  "use strict";
  const ROOT = "../";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  const wordCount = (t) => (t.trim().match(/[A-Za-z'’-]+/g) || []).length;

  async function loadData() {
    const r = await fetch(ROOT + "data/speaking/part1.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // ---------- keyword / connector matching ----------
  function kwRe(k) { return new RegExp("(?<![a-zà-ÿ])" + reEsc(k).replace(/ /g, "\\s+") + "(?:s|es)?(?![a-zà-ÿ])", "i"); }
  function connRe(label, flags = "gi") {
    if (/^not only/i.test(label)) return new RegExp("(?<![a-z])not only(?![a-z])[\\s\\S]{0,150}?(?<![a-z])but(?![a-z])", flags);
    return new RegExp("(?<![a-z])" + reEsc(label).replace(/ /g, "\\s+") + "(?![a-z])", flags);
  }
  const hasConn = (text, label) => connRe(label, "i").test(text);
  const picMentioned = (text, pic) => pic.kw.some((k) => kwRe(k).test(text));

  // wrap connectors of an (unescaped) sentence in <mark class="conn">
  function highlight(text, labels) {
    const words = new Set();
    labels.forEach((l) => {
      if (/^not only/i.test(l)) { words.add("not only"); words.add("but"); words.add("also"); }
      else words.add(l.toLowerCase());
    });
    const list = [...words].sort((a, b) => b.length - a.length).map(reEsc);
    const re = new RegExp("(?<![A-Za-z])(" + list.join("|") + ")(?![A-Za-z])", "gi");
    return esc(text).replace(re, '<mark class="conn">$1</mark>');
  }

  // word-by-word comparison (longest common subsequence) for shadowing
  const norm = (t) => (t.toLowerCase().replace(/[’]/g, "'").match(/[a-z0-9']+/g) || []);
  function compareWords(target, heard) {
    const tokens = target.split(/\s+/).filter(Boolean);
    const T = [], owner = [];
    tokens.forEach((tok, i) => norm(tok).forEach((w) => { T.push(w); owner.push(i); }));
    const H = norm(heard);
    const n = T.length, m = H.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = T[i] === H[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const hit = new Array(n).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (T[i] === H[j]) { hit[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    const tokHit = tokens.map((_, ti) => { const idx = owner.map((o, k) => (o === ti ? k : -1)).filter((k) => k >= 0); return idx.length === 0 ? null : idx.every((k) => hit[k]); });
    return { tokens, tokHit, pct: n ? Math.round((100 * hit.filter(Boolean).length) / n) : 0 };
  }

  // ---------- progress (stays in this browser only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sp:" + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("sp:" + k, JSON.stringify(v)); } catch (_) { /* private mode */ } }
  };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  function logPractice(kind) {
    const p = store.get("progress", { days: [], counts: {} });
    const t = dayKey();
    if (!p.days.includes(t)) p.days.push(t);
    p.days = p.days.slice(-180);
    p.counts[kind] = (p.counts[kind] || 0) + 1;
    store.set("progress", p);
  }
  function progress() {
    const p = store.get("progress", { days: [], counts: {} });
    const days = new Set(p.days);
    const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let streak = 0;
    while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
    return { streak, total, days: p.days.length, counts: p.counts };
  }

  // ---------- audio: MP3 if built, otherwise the browser's voice ----------
  let manifest = null;
  const player = new Audio();
  player.preload = "auto";
  let voices = [];
  const loadVoices = () => { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; };
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice() {
    const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
    return en.find((v) => /natural|neural|online|google us|samantha|aria|jenny/i.test(v.name) && /en[-_]US/i.test(v.lang))
      || en.find((v) => /en[-_]US/i.test(v.lang)) || en[0] || null;
  }
  async function initAudio() {
    if (manifest) return manifest;
    try { const r = await fetch(ROOT + "audio/speaking/manifest.json", { cache: "no-cache" }); manifest = r.ok ? await r.json() : {}; }
    catch (_) { manifest = {}; }
    return manifest;
  }
  const hasMp3 = (id) => !!(manifest && id && manifest[id]);

  let actx = null;
  function unlockAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (_) { /* no WebAudio */ }
  }
  function beep(freq = 880, ms = 320) {
    return new Promise((res) => {
      try {
        unlockAudio();
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
        o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
        o.start(t); o.stop(t + ms / 1000 + 0.05);
      } catch (_) { /* silent */ }
      setTimeout(res, ms + 80);
    });
  }

  let token = 0, pending = null;
  function stopAudio() {
    token++;
    const r = pending; pending = null;
    try { player.pause(); } catch (_) {}
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (r) r(false);
  }
  function tts(text, rate) {
    return new Promise((res) => {
      if (!window.speechSynthesis || !text) return res();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = Math.max(0.5, 0.95 * rate);
      const v = pickVoice(); if (v) u.voice = v;
      u.onend = () => res(); u.onerror = () => res();
      speechSynthesis.speak(u);
    });
  }
  // say({id, say}) → resolves true when finished, false when interrupted
  function say(item, rate = 1) {
    stopAudio();
    const my = ++token;
    return new Promise((resolve) => {
      pending = resolve;
      const finish = () => { if (my !== token) return; pending = null; resolve(true); };
      let fell = false;
      const viaTTS = () => { if (fell || my !== token) return; fell = true; tts(item.say, rate).then(finish); };
      if (hasMp3(item.id)) {
        player.src = ROOT + "audio/speaking/" + item.id + ".mp3";
        player.defaultPlaybackRate = rate; player.playbackRate = rate;
        player.onended = finish;
        player.onerror = viaTTS;
        const p = player.play();
        if (p && p.catch) p.catch(viaTTS);
      } else viaTTS();
    });
  }

  // ---------- microphone & recording ----------
  const Mic = {
    stream: null,
    async open() {
      if (this.stream && this.stream.active) return this.stream;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return this.stream;
    },
    close() { if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; } }
  };
  window.addEventListener("pagehide", () => Mic.close());
  const canRecord = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  function mimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  }
  async function startRecording() {
    const stream = await Mic.open();
    const mime = mimeType();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(500);
    return {
      stop() {
        return new Promise((res) => {
          if (rec.state === "inactive") return res(null);
          rec.onstop = () => {
            const type = rec.mimeType || mime || "audio/webm";
            const blob = new Blob(chunks, { type });
            res({ blob, url: URL.createObjectURL(blob), ext: type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm" });
          };
          try { rec.stop(); } catch (_) { res(null); }
        });
      }
    };
  }

  // ---------- speech-to-text (Chrome / Edge) ----------
  function listen(onUpdate) {
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    let finalText = "", want = true, failed = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript.trim() + " ";
        else interim += r[0].transcript;
      }
      if (onUpdate) onUpdate(finalText + interim);
    };
    rec.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "network", "audio-capture"].includes(e.error)) { want = false; failed = e.error; }
    };
    rec.onend = () => { if (want) { try { rec.start(); } catch (_) {} } };
    try { rec.start(); } catch (_) {}
    return {
      get failed() { return failed; },
      stop() {
        return new Promise((res) => {
          want = false;
          const t = setTimeout(() => res(finalText.trim()), 1500);
          rec.onend = () => { clearTimeout(t); res(finalText.trim()); };
          try { rec.stop(); } catch (_) { clearTimeout(t); res(finalText.trim()); }
        });
      }
    };
  }

  // ---------- timer ----------
  function countdown(total, onTick, onDone) {
    const end = Date.now() + total * 1000;
    let iv = null;
    const tick = () => {
      const left = (end - Date.now()) / 1000;
      onTick(Math.max(0, left), total);
      if (left <= 0) { clearInterval(iv); onDone(); }
    };
    iv = setInterval(tick, 200); tick();
    return () => clearInterval(iv);
  }

  // ---------- shared UI ----------
  function picHTML(p, i, state) {
    const cls = state === true ? " hit" : state === false ? " miss" : "";
    const mark = state === true ? " ✓" : state === false ? " ✗" : "";
    const media = p.img
      ? `<img src="${esc(ROOT + "speaking/" + p.img)}" alt="${esc(p.label)}" loading="lazy">`
      : `<div class="emo" aria-hidden="true">${p.emoji || "🖼️"}</div>`;
    return `<div class="pic${cls}">${i != null ? `<span class="num">${i + 1}${mark}</span>` : ""}${media}<div class="lbl">${esc(p.label)}</div></div>`;
  }
  function supportChips() {
    const c = [];
    c.push(canRecord ? '<span class="chip ok">✓ อัดเสียงได้</span>' : '<span class="chip bad">✗ เบราว์เซอร์นี้อัดเสียงไม่ได้</span>');
    c.push(SR ? '<span class="chip ok">✓ ถอดเสียงเป็นข้อความได้</span>' : '<span class="chip">ถอดเสียงอัตโนมัติไม่ได้ (ใช้ Chrome หรือ Edge จะได้ฟีเจอร์ครบ)</span>');
    c.push(window.speechSynthesis || hasMp3("examiner-intro") ? '<span class="chip ok">✓ เล่นเสียงตัวอย่างได้</span>' : '<span class="chip bad">✗ เล่นเสียงไม่ได้</span>');
    return `<div class="chips">${c.join("")}</div>`;
  }
  function markNav() {
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".sp-nav a").forEach((a) => {
      if ((a.getAttribute("href") === "./" && (here === "" || here === "index.html")) || a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });
  }
  document.addEventListener("DOMContentLoaded", markNav);

  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); return true; }
    catch (_) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  window.SP = {
    ROOT, SR, $, esc, el, fmt, shuffle, wordCount, loadData,
    kwRe, connRe, hasConn, picMentioned, highlight, compareWords,
    store, logPractice, progress,
    initAudio, hasMp3, say, stopAudio, beep, unlockAudio,
    Mic, canRecord, startRecording, listen, countdown,
    picHTML, supportChips, copyText
  };
})();
