/* ===================================================================
 * AutoKkutu Web - kkutu.co.kr 전용 (v1.1: 끊김 수정판)
 * - MutationObserver 범위 축소 + throttle (메인 쓰레드 블록 방지)
 * - 사전 빌드를 청크로 분할 (페이지 멈춤 방지)
 * - DOM 쿼리 캐싱
 * - form.submit() 폴백 제거 (SPA 폼 깨짐 방지)
 * =================================================================== */
(function () {
  "use strict";

  if (!/(^|\.)kkutu\.co\.kr$/i.test(location.hostname)) {
    alert("이 스크립트는 kkutu.co.kr 에서만 동작합니다.\n현재: " + location.hostname);
    return;
  }
  if (window.__AutoKkutuLoaded) {
    window.__AutoKkutuToggleUI && window.__AutoKkutuToggleUI();
    return;
  }
  window.__AutoKkutuLoaded = true;

  /* ---------- 설정 ---------- */
  const WORDS_URL =
    "https://raw.githubusercontent.com/Shshshhkak/Kkuuuu/refs/heads/main/korean_words.txt";

  const LS_KEY = "AutoKkutu.prefs.v1";
  const defaults = {
    autoEnter: false,
    onlyMyTurn: true,
    useEndWord: true,
    useAttackWord: true,
    randomTopN: 3,
    maxDisplay: 25,
    minDelay: 400,
    perCharDelay: 70,
    longestFirst: true,
  };
  const prefs = Object.assign({}, defaults, safeParse(localStorage.getItem(LS_KEY)));
  function savePrefs() { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); }
  function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

  /* ---------- 두음법칙 ---------- */
  const HANGUL_BASE = 0xAC00, JUNG = 21, JONG = 28;
  function decomposeSyllable(ch) {
    const code = ch.charCodeAt(0) - HANGUL_BASE;
    if (code < 0 || code >= 19 * JUNG * JONG) return null;
    return {
      cho: Math.floor(code / (JUNG * JONG)),
      jung: Math.floor((code % (JUNG * JONG)) / JONG),
      jong: code % JONG
    };
  }
  function composeSyllable(cho, jung, jong) {
    return String.fromCharCode(HANGUL_BASE + cho * JUNG * JONG + jung * JONG + jong);
  }
  const I_VOWELS = new Set([2, 6, 12, 17, 20, 3, 7]); // ㅑㅕㅛㅠㅣㅒㅖ
  function dueumAlternates(ch) {
    const out = [ch];
    const d = decomposeSyllable(ch);
    if (!d) return out;
    if (d.cho === 5) {
      out.push(composeSyllable(I_VOWELS.has(d.jung) ? 11 : 2, d.jung, d.jong));
    } else if (d.cho === 2 && I_VOWELS.has(d.jung)) {
      out.push(composeSyllable(11, d.jung, d.jong));
    }
    return out;
  }

  /* ---------- 스타일 ---------- */
  injectStyle();
  const panel = buildPanel();
  document.body.appendChild(panel);
  window.__AutoKkutuToggleUI = () => panel.classList.toggle("ak-hidden");

  function injectStyle() {
    const css = `
    .ak-panel{position:fixed;top:60px;right:16px;width:320px;max-height:calc(100vh - 80px);
      background:#1d1f25;color:#e8eaed;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      border:1px solid #3a3f4b;border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.45);
      z-index:2147483647;display:flex;flex-direction:column;overflow:hidden}
    .ak-panel.ak-hidden{display:none}
    .ak-head{display:flex;align-items:center;justify-content:space-between;
      padding:10px 12px;background:#2a2e38;cursor:move;user-select:none}
    .ak-title{font-weight:600;font-size:13px}
    .ak-title small{color:#8a93a3;font-weight:400;margin-left:6px}
    .ak-head .ak-x{background:none;border:0;color:#aaa;font-size:16px;cursor:pointer;padding:0 4px}
    .ak-body{padding:10px 12px;overflow:auto;flex:1}
    .ak-row{display:flex;align-items:center;justify-content:space-between;margin:6px 0;gap:8px}
    .ak-row label{flex:1;color:#cbd2dd}
    .ak-row input[type=number]{width:64px}
    .ak-status{margin:6px 0 10px;padding:8px 10px;border-radius:6px;background:#262a33;
      color:#9aa3b2;font-size:12px}
    .ak-status b{color:#fff;font-weight:600}
    .ak-section{margin-top:10px;padding-top:8px;border-top:1px solid #2f343f}
    .ak-section h4{margin:0 0 6px;font-size:12px;color:#8a93a3;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
    .ak-search{display:flex;gap:6px}
    .ak-search input{flex:1;background:#11141a;color:#fff;border:1px solid #3a3f4b;border-radius:5px;padding:5px 7px}
    .ak-search button{background:#3b82f6;border:0;color:#fff;border-radius:5px;padding:5px 10px;cursor:pointer}
    .ak-list{margin:6px 0 0;padding:0;list-style:none;max-height:240px;overflow:auto;
      border:1px solid #2f343f;border-radius:6px;background:#11141a}
    .ak-list li{padding:5px 8px;border-bottom:1px solid #1c1f26;cursor:pointer;display:flex;
      justify-content:space-between;font-size:12.5px}
    .ak-list li:last-child{border-bottom:0}
    .ak-list li:hover{background:#1f242e}
    .ak-list li.ak-end{color:#ff8080}
    .ak-list li.ak-attack{color:#ffd166}
    .ak-list .ak-meta{color:#6c7484;font-size:11px;margin-left:8px}
    .ak-btn{background:#374151;color:#fff;border:0;border-radius:5px;padding:5px 8px;cursor:pointer;font-size:12px}
    .ak-btn.warn{background:#ef4444}
    .ak-toggle{position:relative;width:34px;height:18px;background:#3a3f4b;border-radius:10px;cursor:pointer;flex:0 0 auto}
    .ak-toggle::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;background:#fff;border-radius:50%;transition:.15s}
    .ak-toggle.on{background:#22c55e}
    .ak-toggle.on::after{left:18px}
    .ak-bubble{position:fixed;top:18px;right:16px;background:#22c55e;color:#fff;font-weight:600;
      padding:6px 10px;border-radius:18px;z-index:2147483647;cursor:pointer;
      box-shadow:0 6px 18px rgba(0,0,0,.35);font-size:12px}
    `;
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function row(label, control) {
    const r = document.createElement("div");
    r.className = "ak-row";
    const l = document.createElement("label");
    l.textContent = label;
    r.appendChild(l); r.appendChild(control);
    return r;
  }
  function toggle(key, onChange) {
    const t = document.createElement("div");
    t.className = "ak-toggle" + (prefs[key] ? " on" : "");
    t.onclick = () => {
      prefs[key] = !prefs[key];
      t.classList.toggle("on", prefs[key]);
      savePrefs();
      onChange && onChange();
    };
    return t;
  }
  function num(key, min, max, step) {
    const i = document.createElement("input");
    i.type = "number"; i.min = min; i.max = max; i.step = step || 1;
    i.value = prefs[key];
    i.oninput = () => { prefs[key] = +i.value || 0; savePrefs(); };
    return i;
  }

  function buildPanel() {
    const p = document.createElement("div");
    p.className = "ak-panel";
    const head = document.createElement("div");
    head.className = "ak-head";
    head.innerHTML = '<div class="ak-title">AutoKkutu <small>v1.1 · kkutu.co.kr</small></div>';
    const x = document.createElement("button");
    x.className = "ak-x"; x.textContent = "×";
    x.onclick = () => p.classList.add("ak-hidden");
    head.appendChild(x);
    p.appendChild(head);
    makeDraggable(p, head);

    const body = document.createElement("div");
    body.className = "ak-body";
    p.appendChild(body);

    const status = document.createElement("div");
    status.className = "ak-status";
    status.id = "ak-status";
    body.appendChild(status);

    const sec1 = document.createElement("div"); sec1.className = "ak-section";
    sec1.innerHTML = "<h4>자동 입력</h4>";
    sec1.appendChild(row("자동 입력 활성화", toggle("autoEnter", updateStatus)));
    sec1.appendChild(row("내 턴에만 검색", toggle("onlyMyTurn")));
    sec1.appendChild(row("최소 지연 (ms)", num("minDelay", 0, 5000, 50)));
    sec1.appendChild(row("글자당 지연 (ms)", num("perCharDelay", 0, 500, 10)));
    body.appendChild(sec1);

    const sec2 = document.createElement("div"); sec2.className = "ak-section";
    sec2.innerHTML = "<h4>단어 선택</h4>";
    sec2.appendChild(row("한방단어 우선", toggle("useEndWord")));
    sec2.appendChild(row("공격단어 우선", toggle("useAttackWord")));
    sec2.appendChild(row("긴 단어 우선", toggle("longestFirst")));
    sec2.appendChild(row("상위 N개 랜덤", num("randomTopN", 1, 50, 1)));
    sec2.appendChild(row("표시 개수", num("maxDisplay", 5, 100, 1)));
    body.appendChild(sec2);

    const sec3 = document.createElement("div"); sec3.className = "ak-section";
    sec3.innerHTML = "<h4>단어 추천</h4>";
    const search = document.createElement("div");
    search.className = "ak-search";
    const sInput = document.createElement("input");
    sInput.placeholder = "시작 글자 (예: 가)";
    sInput.maxLength = 3;
    const sBtn = document.createElement("button");
    sBtn.textContent = "검색";
    sBtn.onclick = () => doSearch(sInput.value.trim());
    sInput.onkeydown = (e) => { if (e.key === "Enter") sBtn.click(); };
    search.appendChild(sInput); search.appendChild(sBtn);
    sec3.appendChild(search);

    const list = document.createElement("ul");
    list.className = "ak-list"; list.id = "ak-list";
    list.innerHTML = '<li style="color:#6c7484;cursor:default">단어 사전 로딩 중…</li>';
    sec3.appendChild(list);
    body.appendChild(sec3);

    const sec4 = document.createElement("div"); sec4.className = "ak-section";
    sec4.style.display = "flex"; sec4.style.gap = "6px"; sec4.style.flexWrap = "wrap";
    const reload = document.createElement("button");
    reload.className = "ak-btn"; reload.textContent = "사전 다시 불러오기";
    reload.onclick = () => loadDict(true);
    const reset = document.createElement("button");
    reset.className = "ak-btn warn"; reset.textContent = "설정 초기화";
    reset.onclick = () => {
      if (!confirm("설정을 초기화할까요?")) return;
      Object.assign(prefs, defaults); savePrefs(); location.reload();
    };
    sec4.appendChild(reload); sec4.appendChild(reset);
    body.appendChild(sec4);

    return p;
  }

  function makeDraggable(panel, handle) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      const r = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      e.preventDefault();
    });
    addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = (ox + e.clientX - sx) + "px";
      panel.style.top = (oy + e.clientY - sy) + "px";
      panel.style.right = "auto";
    });
    addEventListener("mouseup", () => dragging = false);
  }

  /* ---------- 사전 ---------- */
  let DICT = [];
  let INDEX = new Map();
  let STARTS = new Set();
  let dictReady = false;

  function loadDict(force) {
    const cacheKey = "AutoKkutu.dict.v1";
    const cacheTimeKey = "AutoKkutu.dict.time.v1";
    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          DICT = JSON.parse(cached);
          buildIndexAsync().then(() => {
            const t = +(localStorage.getItem(cacheTimeKey) || 0);
            log("캐시 사전 로드: " + DICT.length + "개 (" + new Date(t).toLocaleString() + ")");
          });
          return;
        } catch {}
      }
    }
    log("사전 다운로드 중…");
    fetch(WORDS_URL, { cache: force ? "reload" : "default" })
      .then(r => r.text())
      .then(txt => {
        DICT = txt.split(/\r?\n/).map(s => s.trim()).filter(w => w.length >= 2);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(DICT));
          localStorage.setItem(cacheTimeKey, String(Date.now()));
        } catch (e) {
          log("사전 캐시 저장 실패 (용량초과 가능)");
        }
        return buildIndexAsync();
      })
      .then(() => log("사전 로드 완료: " + DICT.length + "개"))
      .catch(err => {
        log("사전 로드 실패: " + err.message);
        const list = document.getElementById("ak-list");
        if (list) list.innerHTML = '<li style="color:#ff8080;cursor:default">사전 로드 실패</li>';
      });
  }

  // 청크로 인덱스 빌드 (메인 쓰레드 양보)
  function buildIndexAsync() {
    return new Promise((resolve) => {
      INDEX = new Map();
      STARTS = new Set();
      const total = DICT.length;
      let i = 0;
      const CHUNK = 5000;
      function step() {
        const end = Math.min(i + CHUNK, total);
        for (; i < end; i++) {
          const w = DICT[i];
          const c = w[0];
          STARTS.add(c);
          let arr = INDEX.get(c);
          if (!arr) { arr = []; INDEX.set(c, arr); }
          arr.push(w);
        }
        if (i < total) {
          setTimeout(step, 0);
        } else {
          // 정렬도 청크로
          const keys = [...INDEX.keys()];
          let ki = 0;
          function sortStep() {
            const kEnd = Math.min(ki + 50, keys.length);
            for (; ki < kEnd; ki++) {
              INDEX.get(keys[ki]).sort((a, b) => b.length - a.length);
            }
            if (ki < keys.length) setTimeout(sortStep, 0);
            else { dictReady = true; updateStatus(); resolve(); }
          }
          sortStep();
        }
      }
      step();
    });
  }

  /* ---------- 검색 ---------- */
  function candidatesFor(ch) {
    const seen = new Set();
    const out = [];
    for (const alt of dueumAlternates(ch)) {
      const arr = INDEX.get(alt);
      if (!arr) continue;
      for (const w of arr) if (!seen.has(w)) { seen.add(w); out.push(w); }
    }
    return out;
  }
  function isEndWord(w) {
    const last = w[w.length - 1];
    for (const alt of dueumAlternates(last)) if (STARTS.has(alt)) return false;
    return true;
  }
  function nextCount(w) {
    const last = w[w.length - 1];
    let c = 0;
    for (const alt of dueumAlternates(last)) c += (INDEX.get(alt) || []).length;
    return c;
  }
  function score(w, usedSet) {
    if (usedSet && usedSet.has(w)) return -1;
    let s = 0;
    if (prefs.useEndWord && isEndWord(w)) s += 10000;
    if (prefs.useAttackWord) {
      const n = nextCount(w);
      if (n < 5) s += 2000;
      else if (n < 20) s += 600;
      else if (n < 60) s += 150;
    }
    if (prefs.longestFirst) s += w.length * 5;
    return s;
  }
  function rank(ch, usedSet) {
    const cands = candidatesFor(ch);
    const scored = [];
    for (const w of cands) {
      const sc = score(w, usedSet);
      if (sc < 0) continue;
      scored.push([w, sc]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored;
  }
  function pickFromTop(scored) {
    if (!scored.length) return null;
    const top = scored.slice(0, Math.max(1, prefs.randomTopN));
    return top[Math.floor(Math.random() * top.length)][0];
  }

  function renderList(scored, ch) {
    const list = document.getElementById("ak-list");
    if (!list) return;
    if (!scored.length) {
      list.innerHTML = '<li style="color:#6c7484;cursor:default">' +
        (ch ? '"' + ch + '" 로 시작하는 단어 없음' : '추천 단어 없음') + '</li>';
      return;
    }
    const max = Math.max(1, prefs.maxDisplay);
    const frag = document.createDocumentFragment();
    for (const [w, s] of scored.slice(0, max)) {
      const li = document.createElement("li");
      const end = isEndWord(w);
      const atk = !end && nextCount(w) < 20;
      if (end) li.classList.add("ak-end");
      else if (atk) li.classList.add("ak-attack");
      li.innerHTML = '<span>' + escapeHtml(w) +
        (end ? ' [한방]' : (atk ? ' [공격]' : '')) +
        '</span><span class="ak-meta">' + s + 'p</span>';
      li.onclick = () => sendWord(w);
      frag.appendChild(li);
    }
    list.innerHTML = "";
    list.appendChild(frag);
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function doSearch(ch) {
    if (!dictReady) return;
    if (!ch) { renderList([], ""); return; }
    renderList(rank(ch[0], usedWords), ch[0]);
  }

  /* ---------- 게임 감시 (가벼운 폴링 + 좁은 범위 옵저버) ---------- */
  // 캐시
  let cachedInput = null;
  let cachedDisplay = null;
  function getInputBox() {
    if (cachedInput && document.contains(cachedInput)) return cachedInput;
    cachedInput =
      document.querySelector("#Talk") ||
      document.querySelector("input.chat-input") ||
      document.querySelector('input[type="text"][maxlength]');
    return cachedInput;
  }
  function getDisplayEl() {
    if (cachedDisplay && document.contains(cachedDisplay)) return cachedDisplay;
    cachedDisplay =
      document.querySelector(".jjo-display .word") ||
      document.querySelector(".jjo-display") ||
      document.querySelector("#Game .jjo .word") ||
      document.querySelector("#Game .game-display .word");
    return cachedDisplay;
  }
  function getPromptChar() {
    const el = getDisplayEl();
    if (!el) return null;
    const t = (el.textContent || "").trim();
    const m = t.match(/[가-힣]/);
    return m ? m[0] : null;
  }
  function isMyTurn() {
    const box = getInputBox();
    if (!box) return false;
    if (box.disabled || box.readOnly) return false;
    return true;
  }

  const usedWords = new Set();
  let lastPrompt = "";
  let isAutoEntering = false;

  function sendWord(word) {
    const box = getInputBox();
    if (!box) { log("입력창을 찾을 수 없습니다."); return false; }
    box.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(box, word);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    // form.submit() 폴백 제거 - SPA 폼이 깨질 수 있음
    box.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
    }));
    box.dispatchEvent(new KeyboardEvent("keypress", {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
    }));
    box.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true
    }));
    usedWords.add(word);
    return true;
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function tryAutoEnter(prompt) {
    if (!prefs.autoEnter || isAutoEntering) return;
    if (!dictReady) return;
    if (prefs.onlyMyTurn && !isMyTurn()) return;
    const scored = rank(prompt, usedWords);
    if (!scored.length) return;
    const word = pickFromTop(scored);
    if (!word) return;
    isAutoEntering = true;
    const wait = prefs.minDelay + word.length * prefs.perCharDelay;
    log('자동입력 예약: "' + word + '"');
    await delay(wait);
    if (sendWord(word)) log('입력: "' + word + '"');
    isAutoEntering = false;
  }

  // === 핵심 변경: MutationObserver 대신 가벼운 폴링 ===
  // 끄투 화면은 변화가 잦아서 전역 옵저버가 메인 쓰레드를 막아 ws ping 누락 -> 끊김.
  // 폴링은 250ms 마다 한 번만 prompt 글자를 읽으므로 사실상 무시 가능한 부하.
  let pollTimer = setInterval(() => {
    if (!dictReady) return;
    const p = getPromptChar();
    if (p && p !== lastPrompt) {
      lastPrompt = p;
      const scored = rank(p, usedWords);
      renderList(scored, p);
      log('새 제시: "' + p + '" (' + scored.length + '개)');
      tryAutoEnter(p);
    } else if (!p && lastPrompt) {
      // 라운드 종료 등 - prompt 사라짐
      lastPrompt = "";
    }
  }, 250);

  /* ---------- 상태 / 로그 ---------- */
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
    if (logs.length > 100) logs.shift();
    console.log("[AutoKkutu]", msg);
    updateStatus();
  }
  function updateStatus() {
    const el = document.getElementById("ak-status");
    if (!el) return;
    el.innerHTML =
      '사전: <b>' + (dictReady ? DICT.length + "개" : "로딩중") + '</b> · ' +
      '자동: <b style="color:' + (prefs.autoEnter ? '#22c55e' : '#ef4444') + '">' +
      (prefs.autoEnter ? "켜짐" : "꺼짐") + '</b><br>' +
      '<span style="color:#6c7484">' + (logs[logs.length - 1] || "대기중") + '</span>';
  }

  const bubble = document.createElement("div");
  bubble.className = "ak-bubble";
  bubble.textContent = "AutoKkutu";
  bubble.title = "패널 토글";
  bubble.onclick = () => panel.classList.toggle("ak-hidden");
  document.body.appendChild(bubble);

  // 페이지 떠날 때 정리
  addEventListener("beforeunload", () => clearInterval(pollTimer));

  loadDict(false);
  updateStatus();
  log("v1.1 로드 완료. " + location.hostname);
})();
