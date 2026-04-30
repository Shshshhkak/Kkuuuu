/* AutoKkutu Bookmarklet (kkutu.co.kr 전용) v2.1-fixed
 * 원본: https://github.com/jjoriping (AutoKkutu 1.2)
 * Bookmarklet loader 형태로 재구성됨.
 * 패널 토글: Alt + K
 *
 * v2.1-fixed 수정 내역 (안쳐지던 문제):
 *  - downloadBigDict: JSON 형식만 받던 것을 plain text(.txt) 까지 자동 감지
 *  - 사전 빌드를 Web Worker 에서 청크로 처리 → 모바일 1014 끊김 방지
 *  - 한방단어(oneShot) 자동 산출 (끝글자가 사전에 없는 글자)
 *  - Game.submit: form.requestSubmit + chatBtn 클릭 + 합성 Enter 모두 시도
 *    실패 시 클립보드 모드로 폴백 (단어 복사 + 토스트)
 *  - 자동입력 toggle 시 워닝 토스트 (서버 차단 위험 안내)
 */
(function () {
  'use strict';

  if (!/(^|\.)kkutu\.co\.kr$/i.test(location.hostname)) {
    alert('AutoKkutu 패널은 kkutu.co.kr 에서만 동작합니다.\n현재 도메인: ' + location.hostname);
    return;
  }
  if (window.__AutoKkutuPanel__) {
    window.__AutoKkutuPanel__.toggle();
    return;
  }

  /* ────────────────────────────────────────────────────────────
   * 0. 설정/사전 저장소
   * ──────────────────────────────────────────────────────────── */
  var LS_CFG = 'AutoKkutu.cfg.v1';
  var LS_DICT = 'AutoKkutu.dict.v1';

  var defaultCfg = {
    auto: false,
    autoSubmit: true,
    submitDelay: 350,
    pollInterval: 250,
    preferOneShot: true,
    preferMission: true,
    applyDuum: true,
    avoidUsed: true,
    learnHistory: true,
    panelOpacity: 0.97,
    panelRight: 16,
    panelTop: 80,
    bigDictUrl: 'https://raw.githubusercontent.com/Shshshhkak/Kkuuuu/refs/heads/main/korean_words.txt'
  };

  function loadJSON(key, fb) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  var cfg = Object.assign({}, defaultCfg, loadJSON(LS_CFG, {}));
  function saveCfg() { saveJSON(LS_CFG, cfg); }

  /* ────────────────────────────────────────────────────────────
   * 1. 단어 사전
   * ──────────────────────────────────────────────────────────── */
  var dict = loadJSON(LS_DICT, null);
  if (!dict) dict = buildSeedDict();
  function saveDict() { saveJSON(LS_DICT, dict); }

  function dictAdd(word, oneShot) {
    word = (word || '').trim();
    if (!word) return false;
    var c = word.charAt(0);
    if (!dict[c]) dict[c] = [];
    if (dict[c].some(function (e) { return e.w === word; })) return false;
    dict[c].push({ w: word, oneShot: !!oneShot });
    return true;
  }
  function dictRemove(word) {
    word = (word || '').trim();
    if (!word) return false;
    var c = word.charAt(0);
    if (!dict[c]) return false;
    var n = dict[c].length;
    dict[c] = dict[c].filter(function (e) { return e.w !== word; });
    if (dict[c].length === 0) delete dict[c];
    return dict[c] ? dict[c].length !== n : true;
  }
  function dictSize() {
    var n = 0;
    for (var k in dict) if (dict.hasOwnProperty(k)) n += dict[k].length;
    return n;
  }

  function buildSeedDict() {
    var seed = {};
    var pairs = [
      ['릥', true], ['믐', true], ['뷥', true], ['슭', true], ['읊', true],
      ['귤나무', true], ['고슴도치', true], ['스펙트럼', true], ['알래스카', true],
      ['알파', false], ['알리바이', false], ['바나나', false], ['나비', false],
      ['비행기', false], ['기차', false], ['차표', false], ['표범', false],
      ['범고래', false], ['래퍼', false], ['퍼즐', false], ['즐거움', false],
      ['움직임', false], ['임금님', true], ['김치', false], ['치즈', false],
      ['즈음', false], ['음식점', false], ['점심', false], ['심장', false],
      ['장미', false], ['미술관', false], ['관객', false], ['객체', false],
      ['체조', false], ['조명', false], ['명함', false], ['함성', false],
      ['성공', false], ['공책', false], ['책상', false], ['상자', false],
      ['자전거', false], ['거품', false], ['품격', false], ['격려', false],
      ['려관', false], ['관광', false], ['광장', false], ['장난감', false],
      ['감자', false], ['자유', false], ['유리', false], ['리본', false],
      ['본질', false], ['질문', false], ['문학', false], ['학교', false],
      ['교실', false], ['실수', false], ['수학', false], ['학생', false],
      ['생일', false], ['일기', false], ['기억', false], ['억지', false],
      ['지구', false], ['구름', false], ['름름하다', true],
      ['살쾡이', false], ['이름', false], ['이순신', false], ['이슬', false],
      ['이야기', false], ['이불', false], ['이발소', false], ['이론', false],
      ['이끼', false], ['이마', false], ['이방인', false], ['이산화탄소', false],
      ['금귤', true], ['귤', true], ['뉴턴', false], ['턴테이블', false],
      ['블루베리', false], ['바닐라', false], ['라일락', false], ['낙엽', false],
      ['엽서', false], ['서울', false], ['울타리', false], ['리듬', false],
      ['듬직함', false], ['금', true], ['늠', true], ['늪', true], ['녘', true],
      ['닢', true], ['뜸', true], ['륨', true], ['릉', true], ['몫', true],
      ['뭍', true], ['붕', true], ['숯', true], ['싹', true], ['앎', true],
      ['옴', true], ['짚', true], ['츰', true], ['칡', true], ['켤', true],
      ['턱', true], ['홉', true], ['훔', true], ['흡', true],
      ['알루미늄', true], ['콘크리트', false], ['리튬', true], ['프리미엄', true],
      ['오디움', true], ['스타디움', true], ['미디엄', true], ['옴니버스', false],
      ['플레이리스트', false], ['나트륨', true], ['칼슘', true], ['망간', false],
      ['텅스텐', false], ['폴로늄', true], ['바륨', true], ['리간드', false]
    ];
    pairs.forEach(function (p) {
      var w = p[0], one = p[1];
      var c = w.charAt(0);
      if (!seed[c]) seed[c] = [];
      if (!seed[c].some(function (e) { return e.w === w; })) seed[c].push({ w: w, oneShot: one });
    });
    return seed;
  }

  /* ────────────────────────────────────────────────────────────
   * 1.5 큰 사전 (IndexedDB 캐시)
   * ──────────────────────────────────────────────────────────── */
  var bigDict = null;        // { '가':'가다\n가족\n...', ... }
  var oneShotSet = null;     // Set<char> - 한방단어 끝글자
  var bigDictMeta = null;    // {savedAt, count}

  var IDB_NAME = 'AutoKkutuDB';
  var IDB_STORE = 'kv';

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbPut(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function applyBigDict(obj) {
    if (!obj || !obj.words) return false;
    bigDict = obj.words;
    oneShotSet = new Set((obj.oneShot || '').split(''));
    var count = 0;
    for (var k in bigDict) if (bigDict.hasOwnProperty(k)) {
      count += bigDict[k].split('\n').length;
    }
    bigDictMeta = { count: count, savedAt: obj.savedAt || Date.now() };
    return true;
  }

  function loadBigDictFromCache() {
    return idbGet('bigDict').then(function (v) {
      if (v && applyBigDict(v)) return bigDictMeta;
      return null;
    }).catch(function () { return null; });
  }

  // ──── Worker: 사전 빌드 (43만 단어 plain text → {char: 'w1\nw2..'}) ────
  // 메인 스레드에서 split/forEach 돌리면 모바일은 GC 멈춤으로 1014 끊김.
  function buildDictWorker() {
    var src = '(' + function () {
      self.onmessage = function (e) {
        var txt = e.data.text || '';
        var lines = txt.split(/\r?\n/);
        var byChar = Object.create(null);
        var startSet = Object.create(null);
        var endSet = Object.create(null);
        var i = 0, total = lines.length;
        var CHUNK = 20000;
        function step() {
          var end = Math.min(i + CHUNK, total);
          for (; i < end; i++) {
            var w = lines[i];
            if (!w) continue;
            // trim 인라인 (빠름)
            var s = 0, e2 = w.length;
            while (s < e2 && w.charCodeAt(s) <= 32) s++;
            while (e2 > s && w.charCodeAt(e2 - 1) <= 32) e2--;
            if (e2 - s < 2) continue;
            w = (s || e2 !== w.length) ? w.substring(s, e2) : w;
            var c0 = w.charAt(0);
            var cN = w.charAt(w.length - 1);
            // 한글만 (가-힣)
            var cc = c0.charCodeAt(0);
            if (cc < 0xAC00 || cc > 0xD7A3) continue;
            if (!byChar[c0]) byChar[c0] = [];
            byChar[c0].push(w);
            startSet[c0] = 1;
            endSet[cN] = 1;
          }
          self.postMessage({ type: 'progress', done: i, total: total });
          if (i < total) {
            setTimeout(step, 0);
          } else {
            // join + oneShot 산출
            var DUUM = {
              '라':'나','래':'내','량':'양','력':'역','련':'연','렬':'열','렴':'염','렵':'엽',
              '령':'영','례':'예','로':'노','록':'녹','론':'논','롱':'농','뢰':'뇌','료':'요',
              '룡':'용','루':'누','류':'유','륙':'육','륜':'윤','률':'율','륭':'융','르':'느',
              '름':'음','리':'이','린':'인','림':'임','립':'입','냐':'야','녀':'여','뇨':'요',
              '뉴':'유','니':'이','냥':'양','념':'염','녕':'영'
            };
            var words = {};
            for (var k in byChar) words[k] = byChar[k].join('\n');
            var oneShot = '';
            for (var ch in endSet) {
              // 두음 후보까지 다 없어야 진짜 한방
              var alt = DUUM[ch];
              if (!startSet[ch] && (!alt || !startSet[alt])) oneShot += ch;
            }
            var count = 0;
            for (var k2 in byChar) count += byChar[k2].length;
            self.postMessage({ type: 'done', words: words, oneShot: oneShot, count: count });
          }
        }
        step();
      };
    } + ')()';
    var blob = new Blob([src], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  function downloadBigDict(url, onProgress) {
    var u = (url || cfg.bigDictUrl) + ((url || cfg.bigDictUrl).indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    return fetch(u).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var total = parseInt(r.headers.get('content-length') || '0', 10);
      if (!r.body) return r.text().then(function (t) { if (onProgress) onProgress(t.length, t.length); return t; });
      var reader = r.body.getReader();
      var chunks = [];
      var loaded = 0;
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            var blob = new Blob(chunks);
            return blob.text();
          }
          chunks.push(res.value);
          loaded += res.value.length;
          if (onProgress) onProgress(loaded, total || loaded);
          return pump();
        });
      }
      return pump();
    }).then(function (txt) {
      // JSON 형식이면 바로 사용, 아니면 plain text 로 간주하고 worker 에서 빌드
      var trimmed = txt.replace(/^\s+/, '');
      if (trimmed.charAt(0) === '{') {
        try {
          var obj = JSON.parse(txt);
          if (obj && obj.words) {
            obj.savedAt = Date.now();
            return idbPut('bigDict', obj).then(function () {
              applyBigDict(obj);
              return bigDictMeta;
            });
          }
        } catch (e) { /* fall through to text mode */ }
      }
      // plain text → worker
      if (onProgress) onProgress(0, 0, '단어 색인 중…');
      return new Promise(function (resolve, reject) {
        var w = buildDictWorker();
        w.onmessage = function (ev) {
          var d = ev.data;
          if (d.type === 'progress') {
            if (onProgress) onProgress(d.done, d.total, '색인 ' + d.done.toLocaleString() + ' / ' + d.total.toLocaleString());
          } else if (d.type === 'done') {
            w.terminate();
            var obj = { words: d.words, oneShot: d.oneShot, savedAt: Date.now() };
            idbPut('bigDict', obj).then(function () {
              applyBigDict(obj);
              resolve(bigDictMeta);
            }).catch(reject);
          }
        };
        w.onerror = function (er) { w.terminate(); reject(er); };
        w.postMessage({ text: txt });
      });
    });
  }

  /* ────────────────────────────────────────────────────────────
   * 2. 한글 두음법칙
   * ──────────────────────────────────────────────────────────── */
  var DUUM = {
    '라': ['나'], '래': ['내'], '량': ['양'], '력': ['역'], '련': ['연'],
    '렬': ['열'], '렴': ['염'], '렵': ['엽'], '령': ['영'], '례': ['예'],
    '로': ['노'], '록': ['녹'], '론': ['논'], '롱': ['농'], '뢰': ['뇌'],
    '료': ['요'], '룡': ['용'], '루': ['누'], '류': ['유'], '륙': ['육'],
    '륜': ['윤'], '률': ['율'], '륭': ['융'], '르': ['느'], '름': ['음'],
    '리': ['이'], '린': ['인'], '림': ['임'], '립': ['입'],
    '냐': ['야'], '녀': ['여'], '뇨': ['요'], '뉴': ['유'], '니': ['이'],
    '냥': ['양'], '념': ['염'], '녕': ['영']
  };
  function duumOf(ch) {
    var arr = [ch];
    if (cfg.applyDuum && DUUM[ch]) arr = arr.concat(DUUM[ch]);
    return arr;
  }

  /* ────────────────────────────────────────────────────────────
   * 3. 게임 DOM 핸들러 — 다중 폴백
   * ──────────────────────────────────────────────────────────── */
  function $1(sel, root) { return (root || document).querySelector(sel); }
  function $A(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clsArr(cn, root) { return Array.prototype.slice.call((root || document).getElementsByClassName(cn)); }
  function visible(el) { if (!el) return false; var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; }

  var Game = {
    chatBox: function () {
      // 1. kkutu.co.kr (bypass) 셀렉터 우선
      var alt = $A('#Middle>div.ChatBox.Product>div.product-body>input').filter(visible)[0];
      if (alt) return alt;
      // 2. JJoriping 기본
      var t = document.getElementById('Talk');
      if (t && visible(t)) return t;
      // 3. 일반 input fallback
      var any = $A('input[type=text]').filter(function (i) {
        return visible(i) && /chat|talk|game/i.test((i.id || '') + ' ' + (i.className || '') + ' ' + (i.placeholder || ''));
      })[0];
      return any || null;
    },
    chatBtn: function () {
      var alt = $A('#Middle>div.ChatBox.Product>div.product-body>button').filter(visible)[0];
      if (alt) return alt;
      var b = document.getElementById('ChatBtn');
      if (b && visible(b)) return b;
      return null;
    },
    isMyTurn: function () {
      // 1. .game-input 표시 여부 (원본)
      var inp = clsArr('game-input')[0];
      if (inp && getComputedStyle(inp).display !== 'none') return true;
      // 2. 채팅창이 활성화되어 있는지
      var box = Game.chatBox();
      if (box && !box.disabled && !box.readOnly && visible(box)) {
        // 추가 검증: 현재 턴 유저 이름 == 내 이름
        var myName = ($1('.my-stat-name') || {}).textContent;
        var cur = $1('.game-user-current');
        if (myName && cur) {
          var curName = ($1('.users-name', cur) || cur.querySelector('[class*=name]') || {}).textContent;
          if (curName && myName.trim() === curName.trim()) return true;
        }
      }
      // 3. "당신의 차례" 등 안내 텍스트
      var disp = $1('.jjo-display.ellipse') || $1('.jjo-display');
      if (disp && /당신의\s*차례|your\s*turn|입력하세요/i.test(disp.textContent || '')) return true;
      return false;
    },
    presentedWord: function () {
      // 1. 원본
      var d = clsArr('jjo-display ellipse')[0];
      if (d && d.textContent) {
        var t = d.textContent.trim();
        // "당신의 차례..." 같은 안내문이 아니라 진짜 글자만
        if (t && t.length <= 8 && !/차례|입력|하세요|turn/i.test(t)) return t;
      }
      // 2. 클래스명 분리 시도
      d = $1('.jjo-display.ellipse') || $1('.jjo-display');
      if (d) {
        // 자식 노드 중 가장 진한 / 강조된 글자
        var spans = $A('span,b,strong,label', d);
        for (var i = 0; i < spans.length; i++) {
          var tx = (spans[i].textContent || '').trim();
          if (tx && tx.length <= 4 && /[가-힣]/.test(tx)) return tx;
        }
        var raw = (d.textContent || '').trim();
        if (raw && raw.length <= 8 && !/차례|입력|하세요/i.test(raw)) return raw;
      }
      return '';
    },
    wordLength: function () {
      var d = clsArr('jjo-display-word-length')[0] || $1('[class*=word-length]');
      var t = d ? (d.textContent || '') : '';
      var n = parseInt((t.match(/\d+/) || [3])[0], 10);
      return isNaN(n) ? 0 : n;
    },
    missionChar: function () {
      var s = clsArr('items')[0] || $1('.mission .items') || $1('[class*=mission] [class*=item]');
      if (!s) return '';
      var op = parseFloat(s.style.opacity || getComputedStyle(s).opacity || '0');
      var txt = (s.textContent || '').trim();
      return (op >= 0.5 && txt.length <= 4) ? txt : '';
    },
    gameMode: function () {
      var d = clsArr('room-head-mode')[0] || $1('[class*=room-head-mode]');
      var t = d && d.textContent ? d.textContent.split('/')[0].trim() : '';
      return t.substring(t.indexOf(' ') + 1) || t || '';
    },
    turnTime: function () {
      var d = $1("[class='graph jjo-turn-time']>[class='graph-bar']")
           || $1('.jjo-turn-time .graph-bar')
           || $1('.jjo-turn-time');
      if (!d) return 0;
      var s = (d.textContent || '').replace(/[^\d.]/g, '');
      var n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    },
    history: function () {
      var arr = clsArr('ellipse history-item expl-mother');
      if (!arr.length) arr = $A('.history-item');
      return arr.map(function (v) {
        var c = v.childNodes[0];
        return ((c && c.textContent) || v.textContent || '').trim();
      }).filter(Boolean);
    },
    setChat: function (text) {
      var box = Game.chatBox();
      if (!box) return false;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    submit: function () {
      var box = Game.chatBox();
      var btn = Game.chatBtn();
      var ok = false;
      // 1) 버튼 클릭이 가장 안정적
      if (btn) { try { btn.click(); ok = true; } catch (e) {} }
      // 2) form.requestSubmit (input 이 form 안에 있으면)
      if (!ok && box) {
        var form = box.form || box.closest('form');
        if (form) {
          try {
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            ok = true;
          } catch (e) {}
        }
      }
      // 3) 합성 KeyboardEvent (isTrusted=false 라 잘 안 먹지만 마지막 수단)
      if (box) {
        try {
          ['keydown', 'keypress', 'keyup'].forEach(function (t) {
            box.dispatchEvent(new KeyboardEvent(t, {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
            }));
          });
        } catch (e) {}
      }
      return ok;
    }
  };

  /* ────────────────────────────────────────────────────────────
   * 4. 추천 엔진
   * ──────────────────────────────────────────────────────────── */
  function pickStartChars(presented, mode) {
    if (!presented) return [];
    if (/가운데|미들|middle/i.test(mode || '')) return duumOf(presented.charAt(0));
    var last = presented.charAt(presented.length - 1);
    return duumOf(last);
  }

  function isOneShotWord(w) {
    if (!w) return false;
    var last = w.charAt(w.length - 1);
    if (oneShotSet && oneShotSet.has(last)) return true;
    return false;
  }

  function recommend(presented, opts) {
    opts = opts || {};
    var mode = opts.mode || '';
    var lengthHint = opts.length || 0;
    var mission = (opts.mission || '').trim();
    var used = opts.used || {};
    var starts = pickStartChars(presented, mode);
    var seen = Object.create(null);
    var pool = [];

    function addCandidate(w, oneShot) {
      if (!w || seen[w]) return;
      if (cfg.avoidUsed && used[w]) return;
      seen[w] = 1;
      pool.push({ w: w, oneShot: !!oneShot || isOneShotWord(w) });
    }

    starts.forEach(function (c) {
      // user dict (localStorage seed + 사용자 추가)
      if (dict[c]) dict[c].forEach(function (e) { addCandidate(e.w, e.oneShot); });
      // big dict (IndexedDB)
      if (bigDict && bigDict[c]) {
        var arr = bigDict[c].split('\n');
        for (var i = 0; i < arr.length; i++) addCandidate(arr[i], false);
      }
    });

    pool.forEach(function (e) {
      var s = 0;
      if (cfg.preferOneShot && e.oneShot) s += 1000;
      if (mission && cfg.preferMission && e.w.indexOf(mission) >= 0) s += 500 + e.w.split(mission).length * 50;
      if (lengthHint && e.w.length === lengthHint) s += 80;
      else if (lengthHint) s -= Math.abs(e.w.length - lengthHint) * 5;
      s += Math.min(e.w.length, 8) * 2;
      // 짧고 흔한 단어보다 약간 더 적극적인 단어 우선
      if (e.w.length >= 3 && e.w.length <= 5) s += 5;
      e._score = s;
    });
    pool.sort(function (a, b) { return b._score - a._score; });
    return pool;
  }

  /* ────────────────────────────────────────────────────────────
   * 5. 자동 진행 루프
   * ──────────────────────────────────────────────────────────── */
  var state = {
    lastSubmitted: '',
    lastSubmittedAt: 0,
    used: {},
    timer: null,
    lastTickInfo: null
  };

  function tick() {
    try {
      var presented = Game.presentedWord();
      var mode = Game.gameMode();
      var len = Game.wordLength();
      var mission = Game.missionChar();
      var hist = Game.history();
      var myTurn = Game.isMyTurn();
      var time = Game.turnTime();

      hist.forEach(function (w) {
        if (!w) return;
        state.used[w] = 1;
        if (cfg.learnHistory) {
          if (dictAdd(w, false)) saveDict();
        }
      });

      var info = { mode: mode, myTurn: myTurn, presented: presented, length: len, mission: mission, time: time, history: hist.length };
      state.lastTickInfo = info;
      ui.updateStatus(info);
      ui.updateDebug();

      // 추천은 항상 표시 (presented 있을 때)
      if (presented) {
        var recs = recommend(presented, { mode: mode, length: len, mission: mission, used: state.used });
        ui.renderRecs(recs.slice(0, 80));

        if (cfg.auto && myTurn && recs.length) {
          var pick = recs[0].w;
          if (pick && pick !== state.lastSubmitted && Date.now() - state.lastSubmittedAt > 800) {
            state.lastSubmitted = pick;
            state.lastSubmittedAt = Date.now();
            state.used[pick] = 1;
            typeAndSubmit(pick);
          }
        }
      } else {
        ui.renderRecs([]);
      }
    } catch (e) {
      console.warn('[AutoKkutu] tick error', e);
      ui.setError(e.message);
    }
  }

  function typeAndSubmit(word) {
    if (!Game.setChat(word)) {
      console.warn('[AutoKkutu] 채팅창을 찾을 수 없음');
      return;
    }
    if (cfg.autoSubmit) {
      setTimeout(function () { Game.submit(); }, Math.max(50, cfg.submitDelay));
    }
  }

  function startLoop() {
    stopLoop();
    state.timer = setInterval(tick, Math.max(80, cfg.pollInterval));
    setTimeout(tick, 0);
  }
  function stopLoop() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  /* ────────────────────────────────────────────────────────────
   * 6. UI
   * ──────────────────────────────────────────────────────────── */
  var ui = (function () {
    var root, recBody, statusBox, dictCount, debugBox, errorBox, tabs = {}, panels = {};
    var hidden = false;

    function el(tag, attrs, children) {
      var e = document.createElement(tag);
      if (attrs) for (var k in attrs) {
        if (k === 'style') Object.assign(e.style, attrs[k]);
        else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
        else if (k === 'html') e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
      (children || []).forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      });
      return e;
    }

    function injectCss() {
      if (document.getElementById('autokkutu-style')) return;
      var s = document.createElement('style');
      s.id = 'autokkutu-style';
      s.textContent = [
        '#autokkutu-panel{position:fixed;right:' + cfg.panelRight + 'px;top:' + cfg.panelTop + 'px;width:340px;max-height:82vh;',
        ' background:#0f1117;color:#e7e9ef;border:1px solid #2a2f3a;border-radius:14px;',
        ' box-shadow:0 18px 48px rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",',
        ' "Noto Sans KR","Malgun Gothic",sans-serif;font-size:13px;z-index:2147483600;display:flex;flex-direction:column;',
        ' opacity:' + cfg.panelOpacity + ';overflow:hidden;backdrop-filter:blur(6px);}',
        '#autokkutu-panel.hidden{transform:translateX(calc(100% + 24px));transition:transform .25s;}',
        '#autokkutu-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#1a1f2e,#131722);cursor:move;user-select:none;border-bottom:1px solid #232838;}',
        '#autokkutu-panel header .logo{width:8px;height:8px;border-radius:50%;background:#5cd66b;box-shadow:0 0 8px #5cd66b;}',
        '#autokkutu-panel header .logo.off{background:#6b7280;box-shadow:none;}',
        '#autokkutu-panel header .title{font-weight:700;letter-spacing:.3px;flex:1;}',
        '#autokkutu-panel header button{background:transparent;border:1px solid #2a2f3a;color:#cbd1de;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px;margin-left:4px;}',
        '#autokkutu-panel header button:hover{background:#1d2230;}',
        '#autokkutu-panel .status{padding:8px 12px;background:#13172a;border-bottom:1px solid #232838;font-size:12px;line-height:1.65;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;}',
        '#autokkutu-panel .status .row{display:flex;justify-content:space-between;gap:6px;}',
        '#autokkutu-panel .status .k{color:#8a93a6;}',
        '#autokkutu-panel .status .v{color:#fff;font-weight:600;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '#autokkutu-panel .status .v.turn-on{color:#5cd66b;}',
        '#autokkutu-panel .status .v.turn-off{color:#9aa3b6;}',
        '#autokkutu-panel .err{background:#3a1d24;color:#ffd0d8;padding:6px 12px;font-size:11.5px;border-bottom:1px solid #5e2a36;display:none;}',
        '#autokkutu-panel .err.show{display:block;}',
        '#autokkutu-panel nav{display:flex;border-bottom:1px solid #232838;background:#0f1320;}',
        '#autokkutu-panel nav button{flex:1;background:transparent;border:0;color:#9aa3b6;padding:9px 4px;font-size:12.5px;cursor:pointer;border-bottom:2px solid transparent;}',
        '#autokkutu-panel nav button.active{color:#fff;border-bottom-color:#5cd66b;background:#11172a;}',
        '#autokkutu-panel .body{padding:10px 12px;overflow:auto;flex:1;}',
        '#autokkutu-panel .panel{display:none;}',
        '#autokkutu-panel .panel.active{display:block;}',
        '#autokkutu-panel .auto-toggle{display:flex;align-items:center;gap:10px;padding:12px;border-radius:10px;background:#161b2c;margin-bottom:10px;}',
        '#autokkutu-panel .toggle{position:relative;width:46px;height:24px;background:#2a2f3a;border-radius:14px;cursor:pointer;transition:background .2s;flex:none;}',
        '#autokkutu-panel .toggle::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;background:#cbd1de;border-radius:50%;transition:left .2s,background .2s;}',
        '#autokkutu-panel .toggle.on{background:#1f7d39;}',
        '#autokkutu-panel .toggle.on::after{left:25px;background:#fff;}',
        '#autokkutu-panel .auto-toggle .label{flex:1;}',
        '#autokkutu-panel .auto-toggle .label b{display:block;color:#fff;}',
        '#autokkutu-panel .auto-toggle .label span{color:#8a93a6;font-size:11.5px;}',
        '#autokkutu-panel .field{display:flex;align-items:center;gap:8px;margin:7px 0;}',
        '#autokkutu-panel .field label{color:#cbd1de;flex:1;}',
        '#autokkutu-panel .field input[type=number]{width:84px;}',
        '#autokkutu-panel input[type=text],#autokkutu-panel input[type=number],#autokkutu-panel textarea{',
        ' background:#0c0f1a;border:1px solid #2a2f3a;color:#e7e9ef;border-radius:6px;padding:5px 8px;font:inherit;}',
        '#autokkutu-panel textarea{width:100%;min-height:90px;resize:vertical;}',
        '#autokkutu-panel pre{background:#0c0f1a;border:1px solid #2a2f3a;color:#9fe6a8;border-radius:6px;padding:8px;font-size:11px;line-height:1.5;overflow:auto;max-height:280px;white-space:pre-wrap;word-break:break-all;}',
        '#autokkutu-panel button.btn{background:#1d2741;border:1px solid #2a3a5e;color:#cfe1ff;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:12px;}',
        '#autokkutu-panel button.btn:hover{background:#243352;}',
        '#autokkutu-panel button.btn.danger{background:#3a1d24;border-color:#5e2a36;color:#ffd0d8;}',
        '#autokkutu-panel button.btn.primary{background:#1f7d39;border-color:#2aa14a;color:#fff;}',
        '#autokkutu-panel ul.recs{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;}',
        '#autokkutu-panel ul.recs li{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#11162a;border:1px solid #1c2236;border-radius:7px;cursor:pointer;}',
        '#autokkutu-panel ul.recs li:hover{background:#1a2440;border-color:#2a3a5e;}',
        '#autokkutu-panel ul.recs li .w{flex:1;font-weight:600;color:#fff;}',
        '#autokkutu-panel ul.recs li .tag{font-size:10.5px;padding:1px 6px;border-radius:4px;background:#2a3a5e;color:#cfe1ff;}',
        '#autokkutu-panel ul.recs li .tag.kill{background:#5e2a36;color:#ffd0d8;}',
        '#autokkutu-panel ul.recs li .tag.miss{background:#5e4a1c;color:#ffe7a8;}',
        '#autokkutu-panel .empty{color:#6b7280;font-style:italic;padding:8px 4px;}',
        '#autokkutu-panel .row-2{display:flex;gap:6px;}',
        '#autokkutu-panel .row-2 > *{flex:1;}',
        '#autokkutu-panel .small{font-size:11px;color:#8a93a6;}'
      ].join('\n');
      document.head.appendChild(s);
    }

    function buildHeader() {
      var logo = el('div', { class: 'logo off' });
      var title = el('div', { class: 'title' }, ['AutoKkutu ', el('span', { class: 'small' }, ['kkutu.co.kr · v2'])]);
      var hideBtn = el('button', { title: '숨기기 (Alt+K)', on: { click: function () { api.toggle(); } } }, ['—']);
      var closeBtn = el('button', { title: '제거', on: { click: function () { api.destroy(); } } }, ['×']);
      var hdr = el('header', null, [logo, title, hideBtn, closeBtn]);
      makeDraggable(hdr);
      ui._logo = logo;
      return hdr;
    }

    function makeDraggable(handle) {
      var sx = 0, sy = 0, sr = 0, st = 0, dragging = false;
      handle.addEventListener('mousedown', function (e) {
        dragging = true; sx = e.clientX; sy = e.clientY;
        var r = root.getBoundingClientRect();
        sr = window.innerWidth - r.right; st = r.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        cfg.panelRight = Math.max(4, sr - dx);
        cfg.panelTop = Math.max(4, st + dy);
        root.style.right = cfg.panelRight + 'px';
        root.style.top = cfg.panelTop + 'px';
      });
      window.addEventListener('mouseup', function () { if (dragging) { dragging = false; saveCfg(); } });
    }

    function buildStatus() {
      var box = el('div', { class: 'status' });
      statusBox = box;
      api.updateStatus({ mode: '-', myTurn: false, presented: '-', length: 0, mission: '-', time: 0, history: 0 });
      return box;
    }

    function buildErr() {
      errorBox = el('div', { class: 'err' });
      return errorBox;
    }

    function buildNav() {
      var nav = el('nav');
      [['auto', '자동'], ['rec', '추천'], ['dict', '사전'], ['cfg', '설정'], ['dbg', '🐞']].forEach(function (t) {
        var b = el('button', { 'data-tab': t[0], on: { click: function () { activate(t[0]); } } }, [t[1]]);
        tabs[t[0]] = b;
        nav.appendChild(b);
      });
      return nav;
    }

    function activate(name) {
      Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('active', k === name); });
      Object.keys(panels).forEach(function (k) { panels[k].classList.toggle('active', k === name); });
    }

    function checkbox(label, key, onchange) {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!cfg[key];
      cb.addEventListener('change', function () {
        cfg[key] = cb.checked; saveCfg(); if (onchange) onchange();
      });
      return el('div', { class: 'field' }, [el('label', null, [cb, ' ' + label])]);
    }
    function numberField(label, key, min, max, step, onchange) {
      var inp = el('input', { type: 'number', min: String(min), max: String(max), step: String(step) });
      inp.value = cfg[key];
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (!isNaN(v)) { cfg[key] = v; saveCfg(); if (onchange) onchange(); }
      });
      return el('div', { class: 'field' }, [el('label', null, [label]), inp]);
    }
    function refreshDictCount() { if (dictCount) dictCount.textContent = '사전: ' + dictSize() + ' 단어'; }

    function buildPanels() {
      var body = el('div', { class: 'body' });

      // ── Auto ──
      var pAuto = el('div', { class: 'panel' });
      var togWrap = el('div', { class: 'auto-toggle' });
      var togSwitch = el('div', { class: 'toggle' + (cfg.auto ? ' on' : ''), on: { click: function () {
        cfg.auto = !cfg.auto; saveCfg();
        togSwitch.classList.toggle('on', cfg.auto);
        ui._logo.classList.toggle('off', !cfg.auto);
        if (cfg.auto) toast('⚠ 자동 입력 ON — 너무 빠르면 서버에서 끊을 수 있어요');
      } } });
      ui._logo.classList.toggle('off', !cfg.auto);
      togWrap.appendChild(togSwitch);
      togWrap.appendChild(el('div', { class: 'label' }, [
        el('b', null, ['자동 입력']),
        el('span', null, ['내 차례에 가장 점수 높은 단어를 자동 입력 + 전송'])
      ]));
      pAuto.appendChild(togWrap);
      pAuto.appendChild(checkbox('자동 전송 (Enter)', 'autoSubmit'));
      pAuto.appendChild(checkbox('한방단어 우선', 'preferOneShot'));
      pAuto.appendChild(checkbox('미션 글자 우선', 'preferMission'));
      pAuto.appendChild(checkbox('두음법칙 적용', 'applyDuum'));
      pAuto.appendChild(checkbox('이미 사용된 단어 회피', 'avoidUsed'));
      pAuto.appendChild(checkbox('히스토리 단어 자동 학습', 'learnHistory'));
      pAuto.appendChild(numberField('입력 → 전송 지연 (ms)', 'submitDelay', 50, 5000, 50));
      pAuto.appendChild(numberField('상태 갱신 주기 (ms)', 'pollInterval', 80, 2000, 20, function () { startLoop(); }));

      // ── Rec ──
      var pRec = el('div', { class: 'panel' });
      pRec.appendChild(el('div', { class: 'small' }, ['표시 글자가 잡히면 추천이 나타납니다. 클릭 = 즉시 입력+전송 (자동 OFF여도 동작).']));
      recBody = el('ul', { class: 'recs' });
      pRec.appendChild(recBody);

      // ── Dict ──
      var pDict = el('div', { class: 'panel' });
      dictCount = el('div', { class: 'small' }, ['사전: ' + dictSize() + ' 단어']);
      pDict.appendChild(dictCount);

      // 큰 사전 영역
      var bigBox = el('div', { style: { padding: '10px', borderRadius: '10px', background: '#161b2c', margin: '8px 0 12px' } });
      var bigStatus = el('div', { class: 'small' }, [bigDictMeta ? ('끄투 사전: ' + bigDictMeta.count.toLocaleString() + ' 단어 로드됨') : '끄투 사전: 미설치']);
      var bigProgress = el('div', { class: 'small', style: { color: '#9fe6a8', marginTop: '4px' } });
      var dlBtn = el('button', { class: 'btn primary', on: { click: function () {
        dlBtn.disabled = true;
        bigProgress.textContent = '다운로드 중… (5MB · 처음만)';
        downloadBigDict(cfg.bigDictUrl, function (loaded, total, label) {
          if (label) {
            bigProgress.textContent = label;
          } else {
            var pct = total ? Math.floor(loaded * 100 / total) : 0;
            bigProgress.textContent = '다운로드 ' + pct + '% (' + (loaded / 1024 / 1024).toFixed(2) + 'MB)';
          }
        }).then(function (meta) {
          bigStatus.textContent = '끄투 사전: ' + meta.count.toLocaleString() + ' 단어 로드됨';
          bigProgress.textContent = '✔ 완료 — IndexedDB에 저장됨';
          toast('사전 ' + meta.count.toLocaleString() + ' 단어 로드');
          dlBtn.disabled = false;
        }).catch(function (e) {
          bigProgress.textContent = '✖ 실패: ' + e.message;
          dlBtn.disabled = false;
        });
      } } }, ['끄투 사전 다운로드']);
      var clearBigBtn = el('button', { class: 'btn danger', on: { click: function () {
        if (!confirm('IndexedDB에 저장된 끄투 사전을 삭제할까요?')) return;
        idbDel('bigDict').then(function () {
          bigDict = null; oneShotSet = null; bigDictMeta = null;
          bigStatus.textContent = '끄투 사전: 미설치';
          bigProgress.textContent = '';
          toast('삭제됨');
        });
      } } }, ['삭제']);
      bigBox.appendChild(bigStatus);
      bigBox.appendChild(bigProgress);
      bigBox.appendChild(el('div', { class: 'row-2', style: { marginTop: '8px' } }, [dlBtn, clearBigBtn]));
      var urlInput = el('input', { type: 'text', value: cfg.bigDictUrl, style: { width: '100%', marginTop: '8px', fontSize: '11px' } });
      urlInput.addEventListener('change', function () { cfg.bigDictUrl = urlInput.value; saveCfg(); });
      bigBox.appendChild(el('div', { class: 'small', style: { marginTop: '8px' } }, ['사전 파일 URL:']));
      bigBox.appendChild(urlInput);
      pDict.appendChild(bigBox);
      ui._bigStatus = bigStatus;

      var addInput = el('input', { type: 'text', placeholder: '단어' });
      var oneCb = el('input', { type: 'checkbox' });
      var oneLbl = el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [oneCb, ' 한방']);
      var addBtn = el('button', { class: 'btn primary', on: { click: function () {
        if (dictAdd(addInput.value, oneCb.checked)) { addInput.value = ''; saveDict(); refreshDictCount(); toast('추가됨'); }
        else toast('이미 있거나 빈 값');
      } } }, ['추가']);
      pDict.appendChild(el('div', { class: 'row-2', style: { marginTop: '8px' } }, [addInput, oneLbl, addBtn]));

      var rmInput = el('input', { type: 'text', placeholder: '삭제할 단어' });
      var rmBtn = el('button', { class: 'btn danger', on: { click: function () {
        if (dictRemove(rmInput.value)) { rmInput.value = ''; saveDict(); refreshDictCount(); toast('삭제됨'); }
        else toast('단어 없음');
      } } }, ['삭제']);
      pDict.appendChild(el('div', { class: 'row-2', style: { marginTop: '6px' } }, [rmInput, rmBtn]));

      pDict.appendChild(el('div', { class: 'small', style: { marginTop: '12px' } }, ['일괄 추가 (한 줄에 한 단어, "단어!" = 한방단어)']));
      var bulk = el('textarea', { placeholder: '예시:\n바나나\n알루미늄!\n프리미엄!' });
      pDict.appendChild(bulk);
      pDict.appendChild(el('div', { class: 'row-2' }, [
        el('button', { class: 'btn primary', on: { click: function () {
          var n = 0;
          (bulk.value || '').split(/\r?\n/).forEach(function (line) {
            var w = line.trim(); if (!w) return;
            var one = false;
            if (w.endsWith('!')) { one = true; w = w.slice(0, -1).trim(); }
            if (dictAdd(w, one)) n++;
          });
          if (n > 0) saveDict();
          refreshDictCount();
          toast(n + ' 단어 추가됨');
        } } }, ['일괄 추가']),
        el('button', { class: 'btn', on: { click: function () { bulk.value = ''; } } }, ['초기화'])
      ]));

      pDict.appendChild(el('div', { class: 'small', style: { marginTop: '12px' } }, ['가져오기 / 내보내기 (JSON)']));
      pDict.appendChild(el('div', { class: 'row-2' }, [
        el('button', { class: 'btn', on: { click: function () {
          var data = JSON.stringify(dict);
          if (navigator.clipboard) navigator.clipboard.writeText(data).then(function () { toast('복사됨'); }, function () { prompt('복사', data); });
          else prompt('복사', data);
        } } }, ['내보내기']),
        el('button', { class: 'btn', on: { click: function () {
          var v = prompt('JSON 붙여넣기', '');
          if (!v) return;
          try {
            var obj = JSON.parse(v); if (typeof obj !== 'object') throw 0;
            dict = obj; saveDict(); refreshDictCount(); toast('가져오기 완료');
          } catch (e) { toast('JSON 파싱 실패'); }
        } } }, ['가져오기']),
        el('button', { class: 'btn danger', on: { click: function () {
          if (!confirm('사전을 시드로 초기화할까요?')) return;
          dict = buildSeedDict(); saveDict(); refreshDictCount(); toast('초기화');
        } } }, ['시드 초기화'])
      ]));

      // ── Settings ──
      var pCfg = el('div', { class: 'panel' });
      pCfg.appendChild(numberField('패널 투명도 (0~1)', 'panelOpacity', 0.2, 1, 0.05, function () {
        root.style.opacity = cfg.panelOpacity;
      }));
      pCfg.appendChild(el('div', { class: 'small', style: { marginTop: '10px' } }, [
        '단축키: Alt+K 표시/숨김. 갱신 시 강력새로고침(Ctrl+F5).'
      ]));
      pCfg.appendChild(el('div', { class: 'row-2', style: { marginTop: '10px' } }, [
        el('button', { class: 'btn danger', on: { click: function () {
          if (!confirm('모든 설정을 기본값으로 되돌릴까요?')) return;
          cfg = Object.assign({}, defaultCfg); saveCfg(); api.destroy(); init();
        } } }, ['설정 초기화'])
      ]));

      // ── Debug ──
      var pDbg = el('div', { class: 'panel' });
      pDbg.appendChild(el('div', { class: 'small' }, ['실시간 DOM 추출 결과 — 셀렉터 매칭 실패한 곳을 보여줍니다.']));
      debugBox = el('pre', null, ['로딩 중…']);
      pDbg.appendChild(debugBox);
      pDbg.appendChild(el('div', { class: 'row-2', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn', on: { click: function () {
          var txt = debugBox.textContent;
          if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('복사됨'); }, function () { prompt('복사', txt); });
          else prompt('복사', txt);
        } } }, ['진단 결과 복사']),
        el('button', { class: 'btn', on: { click: function () { tick(); } } }, ['지금 새로고침'])
      ]));

      panels.auto = pAuto; panels.rec = pRec; panels.dict = pDict; panels.cfg = pCfg; panels.dbg = pDbg;
      body.appendChild(pAuto); body.appendChild(pRec); body.appendChild(pDict); body.appendChild(pCfg); body.appendChild(pDbg);
      return body;
    }

    var toastTimer = null;
    function toast(msg) {
      var t = document.getElementById('autokkutu-toast');
      if (!t) {
        t = el('div', { id: 'autokkutu-toast', style: {
          position: 'fixed', bottom: '24px', right: '24px', background: '#1d2741',
          color: '#cfe1ff', padding: '8px 14px', borderRadius: '8px',
          border: '1px solid #2a3a5e', zIndex: '2147483601', font: '13px sans-serif',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)', opacity: '0', transition: 'opacity .15s'
        } });
        document.body.appendChild(t);
      }
      t.textContent = msg; t.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 1400);
    }

    var api = {
      mount: function () {
        injectCss();
        root = el('div', { id: 'autokkutu-panel' });
        root.appendChild(buildHeader());
        root.appendChild(buildStatus());
        root.appendChild(buildErr());
        root.appendChild(buildNav());
        root.appendChild(buildPanels());
        document.body.appendChild(root);
        activate('auto');
      },
      toggle: function () { hidden = !hidden; root.classList.toggle('hidden', hidden); },
      destroy: function () {
        stopLoop();
        if (root && root.parentNode) root.parentNode.removeChild(root);
        var s = document.getElementById('autokkutu-style'); if (s && s.parentNode) s.parentNode.removeChild(s);
        var t = document.getElementById('autokkutu-toast'); if (t && t.parentNode) t.parentNode.removeChild(t);
        delete window.__AutoKkutuPanel__;
      },
      setError: function (msg) {
        if (!errorBox) return;
        if (msg) { errorBox.textContent = '⚠ ' + msg; errorBox.classList.add('show'); }
        else { errorBox.classList.remove('show'); }
      },
      updateStatus: function (st) {
        if (!statusBox) return;
        statusBox.innerHTML = '';
        function row(k, v, cls) {
          statusBox.appendChild(el('div', { class: 'row' }, [
            el('span', { class: 'k' }, [k]),
            el('span', { class: 'v ' + (cls || '') }, [String(v)])
          ]));
        }
        row('모드', st.mode || '-');
        row('내 차례', st.myTurn ? 'YES' : 'NO', st.myTurn ? 'turn-on' : 'turn-off');
        row('표시', st.presented || '-');
        row('길이', st.length ? st.length + '자' : '-');
        row('미션', st.mission || '-');
        row('남은', st.time ? st.time.toFixed(1) + 's' : '-');
        row('히스토리', st.history || 0);
        row('사전', dictSize() + (bigDictMeta ? '+' + (bigDictMeta.count >= 1000 ? Math.floor(bigDictMeta.count / 1000) + 'k' : bigDictMeta.count) : ''));
      },
      updateDebug: function () {
        if (!debugBox || !panels.dbg.classList.contains('active')) return;
        var d = {
          '== DOM 추출 ==': '',
          'mode': Game.gameMode(),
          'myTurn': Game.isMyTurn(),
          'presented': Game.presentedWord(),
          'wordLength': Game.wordLength(),
          'mission': Game.missionChar(),
          'turnTime': Game.turnTime(),
          'history(n)': Game.history().length,
          'history(top3)': Game.history().slice(-3).join(', '),
          '== 셀렉터 ==': '',
          '.jjo-display.ellipse': txt($1('.jjo-display.ellipse')),
          '.jjo-display': txt($1('.jjo-display')),
          '.jjo-display-word-length': txt($1('.jjo-display-word-length')),
          '.items text': txt($1('.items')),
          '.items opacity': $1('.items') ? ($1('.items').style.opacity || getComputedStyle($1('.items')).opacity) : '(없음)',
          '.room-head-mode': txt($1('.room-head-mode')),
          '.game-input': $1('.game-input') ? ('display=' + getComputedStyle($1('.game-input')).display) : '(없음)',
          '.game-user-current': $1('.game-user-current') ? '있음' : '(없음)',
          '.my-stat-name': txt($1('.my-stat-name')),
          '#Talk': document.getElementById('Talk') ? ('disabled=' + document.getElementById('Talk').disabled) : '(없음)',
          '#ChatBtn': document.getElementById('ChatBtn') ? '있음' : '(없음)',
          'ChatBox.Product input': $1('#Middle>div.ChatBox.Product>div.product-body>input') ? '있음' : '(없음)',
          'ChatBox.Product button': $1('#Middle>div.ChatBox.Product>div.product-body>button') ? '있음' : '(없음)',
          '== 채팅 후보 ==': '',
          'chatBox()': Game.chatBox() ? cssPath(Game.chatBox()) : '(없음)',
          'chatBtn()': Game.chatBtn() ? cssPath(Game.chatBtn()) : '(없음)'
        };
        debugBox.textContent = Object.keys(d).map(function (k) {
          return k.startsWith('==') ? '\n' + k : '  ' + k + ' : ' + JSON.stringify(d[k]);
        }).join('\n');
        function txt(e) { return e ? (e.textContent || '').trim().substring(0, 60) : '(없음)'; }
        function cssPath(e) {
          if (!e) return '';
          var p = [];
          while (e && e.nodeType === 1 && p.length < 4) {
            var s = e.tagName.toLowerCase();
            if (e.id) { s += '#' + e.id; p.unshift(s); break; }
            if (e.className) s += '.' + String(e.className).split(/\s+/).filter(Boolean).slice(0, 2).join('.');
            p.unshift(s); e = e.parentElement;
          }
          return p.join('>');
        }
      },
      renderRecs: function (recs) {
        if (!recBody) return;
        recBody.innerHTML = '';
        if (!recs || !recs.length) {
          recBody.appendChild(el('li', { class: 'empty' }, ['추천 단어 없음']));
          return;
        }
        recs.forEach(function (e) {
          var tags = [];
          if (e.oneShot) tags.push(el('span', { class: 'tag kill' }, ['한방']));
          var miss = Game.missionChar();
          if (miss && e.w.indexOf(miss) >= 0) tags.push(el('span', { class: 'tag miss' }, ['미션']));
          var li = el('li', { on: { click: function () {
            state.lastSubmitted = e.w; state.lastSubmittedAt = Date.now();
            state.used[e.w] = 1;
            typeAndSubmit(e.w);
          } } }, [el('span', { class: 'w' }, [e.w])].concat(tags));
          recBody.appendChild(li);
        });
      }
    };
    return api;
  })();

  /* ────────────────────────────────────────────────────────────
   * 7. 부팅
   * ──────────────────────────────────────────────────────────── */
  function init() {
    ui.mount();
    startLoop();
    window.__AutoKkutuPanel__ = ui;
    window.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'k' || e.key === 'K')) { ui.toggle(); }
    });
    console.log('[AutoKkutu v3] loaded — Alt+K 로 토글, 🐞 탭에서 진단');
    // 캐시된 큰 사전 자동 로드
    loadBigDictFromCache().then(function (meta) {
      if (meta) {
        console.log('[AutoKkutu] 끄투 사전 로드:', meta.count, '단어');
        if (ui._bigStatus) ui._bigStatus.textContent = '끄투 사전: ' + meta.count.toLocaleString() + ' 단어 로드됨';
      } else {
        console.log('[AutoKkutu] 끄투 사전 미설치 — 사전 탭에서 다운로드');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
