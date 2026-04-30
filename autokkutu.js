/* ===================================================================
 * AutoKkutu Web - kkutu.co.kr 전용 (v1.3: 모바일 1014 끊김 해결판)
 *  - Worker 내부 split/build/sort 를 청크화 -> 메인 ws ping 보호
 *  - Worker 내부 IndexedDB 캐싱 -> 두 번째부터는 fetch/파싱 없음
 *  - "로비에서 1회만 로드" 안내 (방 안에서 첫 로드 시 끊김 위험)
 * =================================================================== */
(function () {
  "use strict";

  if (!/(^|\.)kkutu\.co\.kr$/i.test(location.hostname)) {
    alert("이 스크립트는 kkutu.co.kr 에서만 동작합니다.\n현재: " + location.hostname);
    return;
  }
  if (window.__AKLoaded) {
    window.__AKToggle && window.__AKToggle();
    return;
  }
  window.__AKLoaded = true;

  const WORDS_URL =
    "https://raw.githubusercontent.com/Shshshhkak/Kkuuuu/refs/heads/main/korean_words.txt";

  const LS_KEY = "AKprefs.v1";
  const defaults = {
    autoEnter: false,
    autoMode: "clipboard", // "clipboard" (안전) | "inject" (키 주입, 끊김 위험)
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

  /* ---------- Worker (모든 무거운 작업 + IndexedDB 캐싱) ---------- */
  const workerSrc = `
    "use strict";
    const HB=0xAC00, JU=21, JO=28;
    const IV=new Set([2,6,12,17,20,3,7]);
    function dec(ch){const c=ch.charCodeAt(0)-HB; if(c<0||c>=19*JU*JO) return null;
      return {cho:Math.floor(c/(JU*JO)),jung:Math.floor((c%(JU*JO))/JO),jong:c%JO};}
    function comp(c,j,o){return String.fromCharCode(HB+c*JU*JO+j*JO+o);}
    function alts(ch){
      const out=[ch]; const d=dec(ch); if(!d) return out;
      if(d.cho===5) out.push(comp(IV.has(d.jung)?11:2,d.jung,d.jong));
      else if(d.cho===2 && IV.has(d.jung)) out.push(comp(11,d.jung,d.jong));
      return out;
    }

    let DICT=[], INDEX=new Map(), STARTS=new Set(), ready=false;

    // -- IndexedDB --
    function openDB(){
      return new Promise((res,rej)=>{
        const r = indexedDB.open("ak_dict", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    async function dbGet(k){
      try{
        const db = await openDB();
        return await new Promise((res)=>{
          const t = db.transaction("kv","readonly");
          const q = t.objectStore("kv").get(k);
          q.onsuccess = () => res(q.result);
          q.onerror = () => res(null);
        });
      }catch{ return null; }
    }
    async function dbSet(k,v){
      try{
        const db = await openDB();
        await new Promise((res)=>{
          const t = db.transaction("kv","readwrite");
          t.objectStore("kv").put(v, k);
          t.oncomplete = () => res();
          t.onerror = () => res();
        });
      }catch{}
    }

    // 양보 (메인 ws ping 보호)
    const yieldNow = () => new Promise(r => setTimeout(r, 0));

    async function buildAll(rawText, postProgress){
      // 1) split 청크화 - 5MB 한 번에 split 도 모바일에서 부담
      const lines = rawText.split(/\\r?\\n/);
      DICT = [];
      INDEX = new Map();
      STARTS = new Set();
      const N = lines.length;
      const CH1 = 8000;
      for (let i=0; i<N; i+=CH1){
        const end = Math.min(i+CH1, N);
        for (let j=i; j<end; j++){
          const w = (lines[j] || "").trim();
          if (w.length < 2) continue;
          DICT.push(w);
          const c = w[0];
          STARTS.add(c);
          let arr = INDEX.get(c);
          if (!arr){ arr = []; INDEX.set(c, arr); }
          arr.push(w);
        }
        postProgress && postProgress("인덱싱 " + Math.min(end,N) + "/" + N);
        await yieldNow();
      }

      // 2) sort 청크화
      const keys = [...INDEX.keys()];
      const KCH = 30;
      for (let i=0; i<keys.length; i+=KCH){
        const end = Math.min(i+KCH, keys.length);
        for (let j=i; j<end; j++){
          INDEX.get(keys[j]).sort((a,b)=>b.length-a.length);
        }
        postProgress && postProgress("정렬 " + end + "/" + keys.length);
        await yieldNow();
      }
      ready = true;
    }

    function isEnd(w){
      const last = w[w.length-1];
      const a = alts(last);
      for (let i=0;i<a.length;i++) if (STARTS.has(a[i])) return false;
      return true;
    }
    function nextC(w){
      const last = w[w.length-1];
      const a = alts(last); let c=0;
      for (let i=0;i<a.length;i++){ const x=INDEX.get(a[i]); if(x) c+=x.length; }
      return c;
    }
    function cands(ch){
      const seen=new Set(); const out=[];
      const a = alts(ch);
      for (let i=0;i<a.length;i++){
        const x = INDEX.get(a[i]); if(!x) continue;
        for (let j=0;j<x.length;j++){ const w=x[j]; if(!seen.has(w)){seen.add(w);out.push(w);} }
      }
      return out;
    }
    function scoreOf(w, p){
      let s=0;
      const end = isEnd(w);
      if (p.useEndWord && end) s += 10000;
      const n = nextC(w);
      if (p.useAttackWord){
        if (n<5) s+=2000; else if (n<20) s+=600; else if (n<60) s+=150;
      }
      if (p.longestFirst) s += w.length*5;
      return [s, end, n];
    }

    self.onmessage = async (e) => {
      const m = e.data || {};
      try{
        if (m.cmd === "load"){
          const post = (msg) => self.postMessage({ev:"progress", msg});
          if (!m.force){
            post("캐시 확인...");
            const cached = await dbGet("raw");
            if (cached){
              post("캐시에서 빌드 중...");
              await buildAll(cached, post);
              self.postMessage({ev:"loaded", count:DICT.length, fromCache:true});
              return;
            }
          }
          post("다운로드 중... (5MB)");
          const r = await fetch(m.url, { cache: m.force ? "reload" : "default" });
          const txt = await r.text();
          post("저장 중...");
          await dbSet("raw", txt);
          await buildAll(txt, post);
          self.postMessage({ev:"loaded", count:DICT.length, fromCache:false});
        }
        else if (m.cmd === "search"){
          if (!ready){ self.postMessage({ev:"searched", ch:m.ch, items:[], reqId:m.reqId}); return; }
          const usedSet = new Set(m.used || []);
          const list = cands(m.ch);
          const scored = [];
          for (let i=0;i<list.length;i++){
            const w = list[i];
            if (usedSet.has(w)) continue;
            const r = scoreOf(w, m.prefs);
            scored.push([w, r[0], r[1], r[2]]);
            if ((i & 1023) === 0) await yieldNow();
          }
          scored.sort((a,b)=>b[1]-a[1]);
          self.postMessage({ev:"searched", ch:m.ch, items:scored.slice(0, (m.prefs.maxDisplay||25)+5), reqId:m.reqId});
        }
        else if (m.cmd === "clearCache"){
          await dbSet("raw", null);
          self.postMessage({ev:"progress", msg:"캐시 삭제됨"});
        }
      }catch(err){
        self.postMessage({ev:"error", msg: String(err && err.message || err)});
      }
    };
  `;

  let worker = null;
  let dictReady = false;
  let dictCount = 0;
  let pendingReqId = 0;
  const pendingResolvers = new Map();

  function startWorker() {
    if (worker) return worker;
    try {
      const blob = new Blob([workerSrc], { type: "application/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      log("Worker 생성 실패: " + e.message);
      return null;
    }
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.ev === "loaded") {
        dictReady = true;
        dictCount = m.count;
        log("사전 로드 완료: " + dictCount + "개" + (m.fromCache ? " (캐시)" : " (다운로드)"));
      } else if (m.ev === "progress") {
        log(m.msg);
      } else if (m.ev === "error") {
        log("오류: " + m.msg);
      } else if (m.ev === "searched") {
        const r = pendingResolvers.get(m.reqId);
        if (r) { pendingResolvers.delete(m.reqId); r(m.items, m.ch); }
      }
    };
    worker.onerror = (e) => log("Worker 오류: " + (e.message || ""));
    return worker;
  }

  function loadDict(force) {
    const w = startWorker(); if (!w) return;
    log(force ? "사전 강제 재다운로드..." : "사전 로드 시작...");
    dictReady = false;
    w.postMessage({ cmd: "load", url: WORDS_URL, force: !!force });
  }
  function clearCache() {
    const w = startWorker(); if (!w) return;
    w.postMessage({ cmd: "clearCache" });
  }
  function searchAsync(ch) {
    return new Promise((resolve) => {
      if (!worker || !dictReady) { resolve({items:[], ch}); return; }
      const id = ++pendingReqId;
      pendingResolvers.set(id, (items, retCh) => resolve({ items, ch: retCh }));
      worker.postMessage({
        cmd: "search", ch, used: [...usedWords],
        prefs: {
          useEndWord: prefs.useEndWord, useAttackWord: prefs.useAttackWord,
          longestFirst: prefs.longestFirst, maxDisplay: prefs.maxDisplay
        },
        reqId: id
      });
    });
  }

  /* ---------- UI ---------- */
  injectStyle();
  const panel = buildPanel();
  document.body.appendChild(panel);
  window.__AKToggle = () => panel.classList.toggle("ak-hidden");

  function injectStyle() {
    const css = `
    .ak-panel{position:fixed;top:60px;right:16px;width:330px;max-height:calc(100vh - 80px);
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
    .ak-warn{margin:6px 0;padding:8px 10px;border-radius:6px;background:#3b2a1a;
      color:#ffc78a;font-size:11.5px;border-left:3px solid #f59e0b}
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
    .ak-btn.primary{background:#22c55e}
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
    s.textContent = css; document.head.appendChild(s);
  }
  function row(label, control) {
    const r = document.createElement("div"); r.className = "ak-row";
    const l = document.createElement("label"); l.textContent = label;
    r.appendChild(l); r.appendChild(control); return r;
  }
  function toggle(key, onChange) {
    const t = document.createElement("div");
    t.className = "ak-toggle" + (prefs[key] ? " on" : "");
    t.onclick = () => {
      prefs[key] = !prefs[key];
      t.classList.toggle("on", prefs[key]); savePrefs();
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
    const head = document.createElement("div"); head.className = "ak-head";
    head.innerHTML = '<div class="ak-title">단어 도우미 <small>v1.4</small></div>';
    const x = document.createElement("button"); x.className = "ak-x"; x.textContent = "×";
    x.onclick = () => p.classList.add("ak-hidden");
    head.appendChild(x); p.appendChild(head);
    makeDraggable(p, head);

    const body = document.createElement("div"); body.className = "ak-body"; p.appendChild(body);
    const status = document.createElement("div");
    status.className = "ak-status"; status.id = "ak-status";
    body.appendChild(status);

    const warn = document.createElement("div");
    warn.className = "ak-warn"; warn.id = "ak-warn";
    warn.innerHTML = "<b>처음 1회</b> 사전 로드는 로비에서 하세요 (5MB).<br>" +
      "<b>자동입력 = 키 주입 모드</b> 는 끄투의 합성 이벤트 검사로 끊길 수 있습니다. " +
      "기본은 <b>클립보드 모드</b> (단어가 자동 복사됨 → 입력창 클릭 후 붙여넣기 + Enter).";
    body.appendChild(warn);

    const sec0 = document.createElement("div"); sec0.className = "ak-section";
    sec0.innerHTML = "<h4>사전</h4>";
    const dictRow = document.createElement("div");
    dictRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    const dlBtn = document.createElement("button");
    dlBtn.className = "ak-btn primary"; dlBtn.textContent = "사전 로드";
    dlBtn.onclick = () => loadDict(false);
    const reBtn = document.createElement("button");
    reBtn.className = "ak-btn"; reBtn.textContent = "강제 재다운로드";
    reBtn.onclick = () => loadDict(true);
    const clBtn = document.createElement("button");
    clBtn.className = "ak-btn warn"; clBtn.textContent = "캐시 삭제";
    clBtn.onclick = () => clearCache();
    dictRow.appendChild(dlBtn); dictRow.appendChild(reBtn); dictRow.appendChild(clBtn);
    sec0.appendChild(dictRow);
    body.appendChild(sec0);

    const sec1 = document.createElement("div"); sec1.className = "ak-section";
    sec1.innerHTML = "<h4>자동 입력</h4>";
    sec1.appendChild(row("자동 입력 활성화", toggle("autoEnter", updateStatus)));
    // 모드 선택
    const modeRow = document.createElement("div"); modeRow.className = "ak-row";
    const modeLbl = document.createElement("label"); modeLbl.textContent = "입력 모드";
    const modeSel = document.createElement("select");
    modeSel.style.cssText = "background:#11141a;color:#fff;border:1px solid #3a3f4b;border-radius:5px;padding:4px";
    [["clipboard","클립보드 (안전)"],["inject","키 주입 (위험)"]].forEach(([v,l])=>{
      const o=document.createElement("option"); o.value=v; o.textContent=l;
      if (prefs.autoMode===v) o.selected=true;
      modeSel.appendChild(o);
    });
    modeSel.onchange = () => { prefs.autoMode = modeSel.value; savePrefs(); };
    modeRow.appendChild(modeLbl); modeRow.appendChild(modeSel);
    sec1.appendChild(modeRow);
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
    const search = document.createElement("div"); search.className = "ak-search";
    const sInput = document.createElement("input");
    sInput.placeholder = "시작 글자 (예: 가)"; sInput.maxLength = 3;
    const sBtn = document.createElement("button");
    sBtn.textContent = "검색";
    sBtn.onclick = async () => {
      const ch = sInput.value.trim(); if (!ch) return;
      const r = await searchAsync(ch[0]);
      renderList(r.items, r.ch);
    };
    sInput.onkeydown = (e) => { if (e.key === "Enter") sBtn.click(); };
    search.appendChild(sInput); search.appendChild(sBtn);
    sec3.appendChild(search);

    const list = document.createElement("ul");
    list.className = "ak-list"; list.id = "ak-list";
    list.innerHTML = '<li style="color:#6c7484;cursor:default">사전을 먼저 로드하세요</li>';
    sec3.appendChild(list);
    body.appendChild(sec3);

    const sec4 = document.createElement("div"); sec4.className = "ak-section";
    const reset = document.createElement("button");
    reset.className = "ak-btn warn"; reset.textContent = "설정 초기화";
    reset.onclick = () => {
      if (!confirm("설정을 초기화할까요?")) return;
      Object.assign(prefs, defaults); savePrefs(); location.reload();
    };
    sec4.appendChild(reset);
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

  function renderList(items, ch) {
    const list = document.getElementById("ak-list");
    if (!list) return;
    if (!items || !items.length) {
      list.innerHTML = '<li style="color:#6c7484;cursor:default">' +
        (ch ? '"' + ch + '" 로 시작하는 단어 없음' : '추천 없음') + '</li>';
      return;
    }
    const max = Math.max(1, prefs.maxDisplay);
    const frag = document.createDocumentFragment();
    for (const it of items.slice(0, max)) {
      const [w, s, end, n] = it;
      const li = document.createElement("li");
      const atk = !end && n < 20;
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
    return s.replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  /* ---------- 게임 감시 ---------- */
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
    const el = getDisplayEl(); if (!el) return null;
    const t = (el.textContent || "").trim();
    const m = t.match(/[가-힣]/);
    return m ? m[0] : null;
  }
  function isMyTurn() {
    const box = getInputBox();
    if (!box) return false;
    if (box.disabled || box.readOnly) return false;
    // kkutu.co.kr: 내 턴이 아닐 때 #Game 안 .game-input 컨테이너에 .my 클래스가 안 붙음
    // 또는 게임 영역 자체에 turn 표시. 폴백 selector 들 검사:
    const turnHints = document.querySelectorAll(
      "#Game-area.my-turn, #Game .my-turn, .game-input.my, .users .my-turn, .users li.my, .users li.game-host.turn"
    );
    if (turnHints.length > 0) return true;
    // 명확한 표시가 없으면 false 반환 (잘못 입력 방지)
    // 사용자가 원하면 onlyMyTurn 끄기로 우회 가능
    return false;
  }

  const usedWords = new Set();
  let lastPrompt = "";
  let isAutoEntering = false;

  function showToast(word) {
    let t = document.getElementById("ak-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "ak-toast";
      t.style.cssText =
        "position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);" +
        "background:#22c55e;color:#fff;font-weight:700;font-size:28px;padding:14px 28px;" +
        "border-radius:12px;z-index:2147483647;box-shadow:0 12px 36px rgba(0,0,0,.5);" +
        "pointer-events:none;letter-spacing:1px";
      document.body.appendChild(t);
    }
    t.textContent = word + "  (붙여넣기 + Enter)";
    t.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.style.display = "none"; }, 2500);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // 폴백
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }

  // 클릭(클릭한 단어 후보) -> 추천 모드 동작
  function sendWord(word) {
    if (prefs.autoMode === "inject") {
      return injectWord(word);
    }
    // 클립보드 모드
    copyToClipboard(word).then((ok) => {
      if (ok) {
        showToast(word);
        log('"' + word + '" 클립보드 복사됨');
      } else {
        log("복사 실패. 수동 입력하세요: " + word);
      }
    });
    usedWords.add(word);
    return true;
  }

  function injectWord(word) {
    const box = getInputBox();
    if (!box) { log("입력창 없음"); return false; }
    // focus() 호출 시 끄투 채팅 핸들러가 활성화되어 추가 검사가 시작될 수 있음 -> 생략
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(box, word);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent("keydown", {
      key:"Enter", code:"Enter", keyCode:13, which:13, bubbles:true
    }));
    box.dispatchEvent(new KeyboardEvent("keyup", {
      key:"Enter", code:"Enter", keyCode:13, which:13, bubbles:true
    }));
    usedWords.add(word);
    return true;
  }
  function pickFromTop(items) {
    if (!items.length) return null;
    const top = items.slice(0, Math.max(1, prefs.randomTopN));
    return top[Math.floor(Math.random() * top.length)][0];
  }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function tryAutoEnter(prompt) {
    if (!prefs.autoEnter || isAutoEntering) return;
    if (!dictReady) return;
    if (prefs.onlyMyTurn && !isMyTurn()) return;
    const r = await searchAsync(prompt);
    if (!r.items.length) return;
    const word = pickFromTop(r.items);
    if (!word) return;
    isAutoEntering = true;
    const wait = prefs.minDelay + word.length * prefs.perCharDelay;
    log('자동입력 예약: "' + word + '"');
    await delay(wait);
    if (sendWord(word)) log('입력: "' + word + '"');
    isAutoEntering = false;
  }

  let pollTimer = setInterval(async () => {
    const p = getPromptChar();
    if (p && p !== lastPrompt) {
      lastPrompt = p;
      if (dictReady) {
        const r = await searchAsync(p);
        renderList(r.items, p);
        log('새 제시: "' + p + '" (' + r.items.length + '개)');
        tryAutoEnter(p);
      } else {
        log('새 제시: "' + p + '" (사전 미로드)');
      }
    } else if (!p && lastPrompt) {
      lastPrompt = "";
    }
  }, 400);

  /* ---------- 상태/로그 ---------- */
  const logs = [];
  function log(msg) {
    logs.push("[" + new Date().toLocaleTimeString() + "] " + msg);
    if (logs.length > 80) logs.shift();
    console.log("[AK]", msg);
    updateStatus();
  }
  function updateStatus() {
    const el = document.getElementById("ak-status");
    if (!el) return;
    el.innerHTML =
      '사전: <b>' + (dictReady ? dictCount + "개" : "미로드") + '</b> · ' +
      '자동: <b style="color:' + (prefs.autoEnter ? '#22c55e' : '#ef4444') + '">' +
      (prefs.autoEnter ? "켜짐" : "꺼짐") + '</b><br>' +
      '<span style="color:#6c7484">' + (logs[logs.length - 1] || "대기중") + '</span>';
  }

  const bubble = document.createElement("div");
  bubble.className = "ak-bubble";
  bubble.textContent = "도우미";
  bubble.title = "패널 토글";
  bubble.onclick = () => panel.classList.toggle("ak-hidden");
  document.body.appendChild(bubble);

  addEventListener("beforeunload", () => {
    clearInterval(pollTimer);
    if (worker) worker.terminate();
  });

  updateStatus();
  log("v1.4 로드. 기본 = 클립보드 모드 (붙여넣기 + Enter).");
})();
