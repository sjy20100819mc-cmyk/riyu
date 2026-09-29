/* 日语.js —— 点读 / 听读默写 / 自测卡（三合一） */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var ALL = WORDS.concat(LEFT_WORDS);
  var ALLW = ALL.concat(PIC_ALL).concat(WORDS2);   // 全部词，只用于错词本查找

  /* ---- 「看图识词」多组通用：组由 词表.js 的 PIC_SETS 决定，加新组不改 JS ---- */
  function picSet(scope) {
    var sets = window.PIC_SETS || [];
    for (var i = 0; i < sets.length; i++) { if (sets[i].id === scope) return sets[i]; }
    return null;
  }
  function injectPicChips() {
    var hosts = ['rdScope', 'dcScope', 'cdScope'];
    (window.PIC_SETS || []).forEach(function (s) {
      hosts.forEach(function (hid) {
        var box = document.getElementById(hid); if (!box) return;
        var ref = box.querySelector('.ch[data-s="pic"]'); if (!ref) return;
        var b = box.querySelector('.ch[data-s="' + s.id + '"]');
        if (!b) {
          b = document.createElement('button');
          b.className = 'ch'; b.setAttribute('data-s', s.id);
          if (s.id === 'pic') { b = ref; } else { ref.parentNode.insertBefore(b, ref.nextSibling); }
        }
        b.textContent = s.label;
      });
    });
  }
  injectPicChips();

  function injectExtraChips() {
    var hosts = ['rdScope', 'dcScope', 'cdScope'];
    (window.EXTRA_SETS || []).forEach(function (x) {
      hosts.forEach(function (hid) {
        var box = document.getElementById(hid); if (!box) return;
        if (box.querySelector('.ch[data-s="' + x.id + '"]')) return;
        var b = document.createElement('button');
        b.className = 'ch'; b.setAttribute('data-s', x.id); b.textContent = x.label;
        var ref = box.querySelector('.ch[data-s="w2"]') || box.firstChild;
        box.insertBefore(b, ref.nextSibling);
      });
    });
  }
  injectExtraChips();

  function injectSelChip() {
    var n = selWords().length;
    var hosts = ['rdScope', 'dcScope', 'cdScope'];
    hosts.forEach(function (hid) {
      var box = document.getElementById(hid); if (!box) return;
      var b = box.querySelector('.ch[data-s="sel"]');
      if (!n) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement('button');
        b.className = 'ch'; b.setAttribute('data-s', 'sel');
        box.insertBefore(b, box.firstChild);
      }
      b.textContent = '🎯 自选 ' + n + ' 词';
    });
  }

  /* ================= 语音 ================= */
  var jaVoice = null;
  function pick() {
    try {
      var v = speechSynthesis.getVoices();
      for (var i = 0; i < v.length; i++) if (/^ja/.test(v[i].lang)) { jaVoice = v[i]; break; }
    } catch (e) {}
  }
  pick();
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = pick; setTimeout(pick, 800);
  }
  /* ---- 发音引擎：0=真人录音（Forvo 日本母语者） 1=神经语音（edge-tts Nanami） 2=系统音（Kyoko） ---- */
  var ENGINE = 0;
  var AUD = (typeof JP_AUDIO !== 'undefined') ? JP_AUDIO : {};
  var actx = null, bufCache = {}, liveSrc = [];
  function engineLabel() { return ['🎧 真人音', '🤖 神经音', '📱 系统音'][ENGINE]; }
  function audFile(text) {
    if (ENGINE === 2) return null;
    var e = AUD[text]; if (!e) return null;
    var f = e[ENGINE]; if (f) return f;
    return e[0] || e[1] || null;
  }
  function audioCtx() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
    return actx;
  }
  function killAudio() {
    liveSrc.forEach(function (s) { try { s.stop(); } catch (e) {} });
    liveSrc = [];
  }
  function playFile(url, slow, dbl, done) {
    var ctx = audioCtx();
    if (!ctx) { if (done) done(); return false; }
    var rate = slow ? 0.72 : 1;
    var key = url + '|' + rate;
    function go(buf) {
      var dur = buf.duration / rate, n = dbl ? 2 : 1;
      for (var i = 0; i < n; i++) {
        (function (i) {
          setTimeout(function () {
            try {
              var s2 = ctx.createBufferSource();
              s2.buffer = buf; s2.playbackRate.value = rate;
              s2.connect(ctx.destination); s2.start(0);
              liveSrc.push(s2);
              s2.onended = function () {
                var k = liveSrc.indexOf(s2); if (k >= 0) liveSrc.splice(k, 1);
              };
              if (i === n - 1 && done) setTimeout(done, dur * 1000);
            } catch (e) { if (i === n - 1 && done) done(); }
          }, i * (dur * 1000 + 350));
        })(i);
      }
    }
    if (bufCache[key]) { go(bufCache[key]); return true; }
    try {
      fetch(url).then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) {
          return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, function (e) { rej(e); }); });
        })
        .then(function (buf) { bufCache[key] = buf; go(buf); })
        .catch(function () { if (done) done(); });
    } catch (e) { if (done) done(); }
    return true;
  }
  /* 统一入口：有本地音频就放音频，否则退回系统音 */
  function speak(text, el, slow, dbl, nowEl) {
    if (nowEl) nowEl.textContent = '\uD83D\uDD0A ' + text;
    if (el) {
      el.classList.add('speaking');
      setTimeout(function () { el.classList.remove('speaking'); }, slow ? 1400 : 1000);
    }
    if (ENGINE !== 2) {
      var f = audFile(text);
      if (f) { playFile(f, slow, dbl, null); return; }
    }
    speakSys(text, null, slow, dbl, null);
  }
  function speakSys(text, el, slow, dbl, nowEl) {
    if (typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; if (!jaVoice) pick(); if (jaVoice) u.voice = jaVoice;
      u.rate = slow ? 0.5 : 0.82;
      speechSynthesis.speak(u);
      if (dbl) setTimeout(function () {
        try {
          var u2 = new SpeechSynthesisUtterance(text);
          u2.lang = 'ja-JP'; if (jaVoice) u2.voice = jaVoice; u2.rate = u.rate;
          speechSynthesis.speak(u2);
        } catch (e) {}
      }, slow ? 1500 : 1150);
    } catch (e) {}
  }
  function hush(nowEl) {
    killAudio();
    try { speechSynthesis.cancel(); } catch (e) {}
    if (nowEl) nowEl.textContent = '';
    document.querySelectorAll('.speaking').forEach(function (e) { e.classList.remove('speaking'); });
  }

  /* ============ 跨会话错词本（按假名存，左栏右栏共用） ============ */
  var WKEY = 'jp_wrong_k';
  var wrongStore = [];
  function loadWrong() {
    try { wrongStore = JSON.parse(localStorage.getItem(WKEY) || '[]') || []; }
    catch (e) { wrongStore = []; }
    syncWrongN();
  }
  function syncWrongN() {
    $('dcWrongN').textContent = wrongStore.length;
    $('cdWrongN').textContent = wrongStore.length;
  }
  function addWrong(k) {
    if (wrongStore.indexOf(k) < 0) { wrongStore.push(k); saveWrong(); }
  }
  function delWrong(k) {
    var i = wrongStore.indexOf(k);
    if (i >= 0) { wrongStore.splice(i, 1); saveWrong(); }
  }
  function saveWrong() {
    try { localStorage.setItem(WKEY, JSON.stringify(wrongStore)); } catch (e) {}
    syncWrongN();
  }
  /* ---- 入口页「自选」：localStorage.jp_sel = ['pic2','w2',...] ---- */
  var ALL_SCOPE = ['right', 'left', 'all', 'w2', 'sent'];
  function selSets() {
    try { return JSON.parse(localStorage.getItem('jp_sel') || '[]') || []; } catch (e) { return []; }
  }
  function dakuAsWords() {
    if (typeof DAKU === 'undefined') return [];
    return DAKU.map(function (d) {
      return { k: d.k, j: '', a: '', c: (d.row ? d.row + ' · 例词 ' + d.ex + (d.ez ? '（' + d.ez + '）' : '') : d.k),
               t: (d.h ? '谐音 ' + d.h + ' · ' : '') + '这是「' + (d.row || '') + '」的字，点读听它' };
    });
  }
  function selWords() {
    var out = [], seenK = {};
    selSets().forEach(function (id) {
      var list = (id === 'daku') ? dakuAsWords() : wordsOf(id);
      list.forEach(function (w) { if (w && w.k && !seenK[w.k]) { seenK[w.k] = 1; out.push(w); } });
    });
    return out;
  }
  function extraSet(scope) {
    var xs = window.EXTRA_SETS || [];
    for (var i = 0; i < xs.length; i++) { if (xs[i].id === scope) return xs[i]; }
    return null;
  }
  function wordsOf(scope) {
    if (scope === 'sel') return selWords();
    var xs = extraSet(scope); if (xs) return xs.words.slice();
    var ps = picSet(scope); if (ps) return ps.words.slice();
    if (scope === 'right') return WORDS.slice();
    if (scope === 'left') return LEFT_WORDS.slice();
    if (scope === 'pic') return PIC_WORDS.slice();
    if (scope === 'w2') return WORDS2.slice();
    if (scope === 'all') return ALL.slice();
    if (scope === 'sent') return [];
    if (scope === 'wrong') return ALLW.filter(function (w) { return wrongStore.indexOf(w.k) >= 0; });
    return [];
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function hl(s) { return esc(s).replace(/【(.+?)】/g, '<em>$1</em>'); }
  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function toast(msg) { var n = $('rdNow'); if (n) { n.textContent = msg; setTimeout(function () { if (n.textContent === msg) n.textContent = ''; }, 2200); } }

  /* ================= 模式切换 ================= */
  var MODE = 'read';
  function setMode(m) {
    MODE = m;
    hush($('rdNow'));
    stopWarm();
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === m);
    });
    $('mRead').classList.toggle('hide', m !== 'read');
    $('mDict').classList.toggle('hide', m !== 'dict');
    $('mCard').classList.toggle('hide', m !== 'card');
    $('mDaku').classList.toggle('hide', m !== 'daku');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.onclick = function () { setMode(b.getAttribute('data-mode')); };
  });

  /* ================= ① 点读 ================= */
  var rd = { scope: 'right', slow: false, cn: true, kanji: true, kana: true, dbl: false, tip: false };

  function rdItems() {
    if (rd.scope === 'right') return WORDS.map(function (w, i) { return { say: w.k, i: i, o: w }; });
    if (rd.scope === 'left') return LEFT_WORDS.map(function (w, i) { return { say: w.k, i: i, o: w }; });
    if (rd.scope === 'w2') return WORDS2.map(function (w, i) { return { say: w.k, i: i, o: w }; });
    if (rd.scope === 'sel') return selWords().map(function (w, i) { return { say: w.k, i: i, o: w }; });
    var xsR = extraSet(rd.scope); if (xsR) return xsR.words.map(function (w, i) { return { say: w.k, i: i, o: w }; });
    var ps = picSet(rd.scope); if (ps) return ps.words.map(function (w, i) { return { say: w.k, i: i, o: w }; });
    if (rd.scope === 'sent') return SENTENCES.map(function (s, i) { return { say: s.ja.replace(/【|】/g, ''), i: i }; });
    return [];
  }

  function wordCard(w, i) {
    return '<div class="wc" data-say="' + esc(w.k) + '" data-i="' + i + '">' +
      (w.img ? '<img class="ph" src="' + esc(w.img) + '" alt="">' : '') +
      '<div class="k">' + esc(w.k) + '</div>' +
      '<div class="j">' + (w.j ? esc(w.j) + '　' + esc(w.a) : esc(w.a)) + '</div>' +
      '<div class="c">' + esc(w.c) + '</div>' +
      '<div class="tip">💡 ' + esc(w.t) + '</div></div>';
  }

  function renderRead() {
    var v = $('rdView'), h = '';
    var psR = picSet(rd.scope), xs = extraSet(rd.scope);
    if (rd.scope === 'right' || rd.scope === 'left' || psR || xs || rd.scope === 'w2' || rd.scope === 'sel') {
      var list = psR ? psR.words : (xs ? xs.words
                 : (rd.scope === 'right' ? WORDS : (rd.scope === 'left' ? LEFT_WORDS
                    : (rd.scope === 'sel' ? selWords() : WORDS2))));
      h = '<div class="grid' + (psR ? ' picg' : '') + '">';
      list.forEach(function (w, i) { h += wordCard(w, i); });
      h += '</div>';
    } else if (rd.scope === 'sent') {
      SENTENCES.forEach(function (s, i) {
        h += '<div class="sent" data-say="' + esc(s.ja.replace(/【|】/g, '')) + '" data-i="' + i + '">' +
          '<div class="g">' + esc(s.g) + '</div><div class="ja">' + hl(s.ja) + '</div>' +
          '<div class="zh">' + esc(s.zh) + '</div></div>';
      });
    } else {
      h += '<div class="sec" style="margin-top:0">～屋（接商品类别名词 → 卖这种东西的店）</div><div class="chips" style="margin:0">';
      YA_WORDS.forEach(function (w, i) {
        h += '<div class="chip" data-say="' + esc(w.k) + '" data-i="' + i + '">' +
          '<div class="k">' + esc(w.j) + '</div><div class="j">' + esc(w.k) + '</div>' +
          '<div class="c">' + esc(w.c) + '</div></div>';
      });
      h += '</div><div class="sec">家庭称谓：左＝敬称（当面叫／说别人家人）　右＝谦称（对外人说自己家人）</div>';
      KAZOKU.forEach(function (f, i) {
        h += '<div class="pair">' +
          '<div class="side kei" data-say="' + esc(f.j) + '" data-i="' + i + '">' +
            '<div class="lb">敬称</div><div class="k">' + esc(f.j) + '</div></div>' +
          '<div class="mid">同一人<br>▼</div>' +
          '<div class="side ken" data-say="' + esc(f.q) + '" data-i="' + i + '">' +
            '<div class="lb">谦称</div><div class="k">' + esc(f.q) + '</div>' +
            '<div class="lb">' + esc(f.c) + '</div></div></div>';
      });
    }
    v.innerHTML = h;
    bindRead();
  }

  function bindRead() {
    document.querySelectorAll('#rdView [data-say]').forEach(function (el) {
      var t = null, lp = false;
      el.addEventListener('touchstart', function () {
        lp = false;
        t = setTimeout(function () {
          lp = true;
          speak(el.getAttribute('data-say'), el, true, false, $('rdNow'));
        }, 600);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
        el.addEventListener(ev, function () { if (t) { clearTimeout(t); t = null; } }, { passive: true });
      });
      el.addEventListener('click', function () {
        if (lp) { lp = false; return; }
        hush();
        if (rd.tip && el.classList.contains('wc')) el.classList.toggle('open');
        speak(el.getAttribute('data-say'), el, rd.slow, rd.dbl, $('rdNow'));
      });
    });
  }

  var rdChain = null;
  function readAll() {
    hush($('rdNow'));
    if (rdChain) { clearTimeout(rdChain); rdChain = null; }
    var list = rdItems();
    if (!list.length) {   // ～屋/称谓：顺序遍历页面元素
      var els = document.querySelectorAll('#rdView [data-say]');
      var k = 0;
      (function step2() {
        if (k >= els.length) { rdChain = null; return; }
        speak(els[k].getAttribute('data-say'), els[k], rd.slow, rd.dbl, $('rdNow'));
        k++; rdChain = setTimeout(step2, rd.slow ? 3000 : 2100);
      })();
      return;
    }
    var i = 0, gap = rd.slow ? 3000 : 2100;
    (function step() {
      if (i >= list.length) { rdChain = null; return; }
      var it = list[i];
      var el = document.querySelector('#rdView [data-i="' + i + '"]');
      speak(it.say, el, rd.slow, rd.dbl, $('rdNow'));
      i++; rdChain = setTimeout(step, gap);
    })();
  }

  document.querySelectorAll('#rdScope .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#rdScope .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); rd.scope = b.getAttribute('data-s');
      hush($('rdNow')); if (rdChain) { clearTimeout(rdChain); rdChain = null; }
      renderRead();
    };
  });
  function rdTg(id, key, fn) {
    $(id).onclick = function () { rd[key] = !rd[key]; this.classList.toggle('on', rd[key]); if (fn) fn(); };
  }
  rdTg('tgSlow', 'slow');
  rdTg('tgCn', 'cn', function () { document.body.classList.toggle('nocn', !rd.cn); });
  rdTg('tgKanji', 'kanji', function () { document.body.classList.toggle('nokanji', !rd.kanji); });
  rdTg('tgKana', 'kana', function () { document.body.classList.toggle('nokana', !rd.kana); });
  rdTg('tg2', 'dbl');
  rdTg('tgTip', 'tip', function () { document.body.classList.toggle('notip', !rd.tip); });
  $('rdAll').onclick = readAll;
  $('rdStop').onclick = function () { if (rdChain) { clearTimeout(rdChain); rdChain = null; } hush($('rdNow')); };

  /* ================= ② 听读默写 ================= */
  var dc = { scope: 'right', slow: false, shuf: true, auto: true, dbl: false, pic: true,
             queue: [], pos: 0, round: 1, ok: 0, no: 0, wrong: [], running: false };

  function dcList() { return dc.scope === 'wrong' ? wordsOf('wrong') : wordsOf(dc.scope); }

  function dcUI() {
    $('dcOk').textContent = dc.ok; $('dcNo').textContent = dc.no;
    $('dcQ').textContent = dc.wrong.length;
    $('dcRound').textContent = '第 ' + dc.round + ' 轮';
    var tot = dc.queue.length;
    $('dcTot').textContent = tot;
    $('dcPos').textContent = Math.min(dc.pos + 1, tot);
    $('dcFill').style.width = (tot ? Math.min(100, (dc.pos / tot) * 100) : 0) + '%';
    $('dcStart').classList.remove('hide');
    $('dcGo').textContent = '开始默写 · ' + dcList().length + ' 词';
  }
  function scopeName() {
    var xs = extraSet(dc.scope); if (xs) return xs.label.replace(/^[^\u4e00-\u9fa5A-Za-z]*/, '');
    var ps = picSet(dc.scope); if (ps) return ps.label;
    return { sel: '自选 ' + selWords().length + ' 词', right: '右栏 21 词', left: '左栏 21 词', w2: '第2课·生词表2 18 词',
             all: '全部 42 词', wrong: '上次错的' }[dc.scope] || '';
  }
  function dcStartView(auto) {
    if (dc.pos >= dc.queue.length) { dcFinish(); return; }
    var w = dc.queue[dc.pos];
    $('dcKana').textContent = w.k;
    $('dcKanji').textContent = w.j ? (w.j + '　' + w.a) : ('（' + w.a + '）');
    $('dcMean').textContent = w.c;
    $('dcTipv').textContent = '💡 ' + w.t;
    var im = $('dcImg');
    if (dc.pic && w.img) {
      im.innerHTML = '<img src="' + esc(w.img) + '" alt="">' +
        '<div class="lb">📷 看图 → 说出 / 写出日语</div>';
      im.classList.remove('hide');
    } else { im.innerHTML = ''; im.classList.add('hide'); }
    $('dcAns').classList.remove('show');
    dcUI();
    if (auto && dc.auto) setTimeout(function () { dcSay(w); }, 240);
  }
  function dcSay(w) {
    speak(w.k, null, dc.slow, dc.dbl, null);
  }
  function dcStart(list, round) {
    dc.queue = dc.shuf ? shuffleArr(list.slice()) : list.slice();
    dc.pos = 0; dc.round = round; dc.ok = 0; dc.no = 0; dc.wrong = []; dc.running = true;
    $('dcStart').classList.add('hide'); $('dcDone').classList.add('hide');
    $('dcQuiz').classList.remove('hide');
    dcStartView(true);
  }
  function dcMark(correct) {
    if (!dc.running) return;
    var w = dc.queue[dc.pos];
    if (correct) { dc.ok++; delWrong(w.k); }
    else { dc.no++; dc.wrong.push(w); addWrong(w.k); }
    dc.pos++;
    setTimeout(function () { dcStartView(true); }, 160);
  }
  function dcFinish() {
    dc.running = false; hush(null);
    $('dcQuiz').classList.add('hide'); $('dcDone').classList.remove('hide');
    var tot = dc.ok + dc.no;
    $('dcScore').textContent = dc.ok + ' / ' + tot;
    $('dcDetail').textContent = '第 ' + dc.round + ' 轮 · 正确率 ' + (tot ? Math.round(dc.ok / tot * 100) : 0) + '%　错 ' + dc.no + ' 个';
    try {
      localStorage.setItem('jp_last_' + dc.scope, JSON.stringify({ ok: dc.ok, tot: tot, t: Date.now() }));
    } catch (e) {}
    var box = $('dcWrongBox');
    if (!dc.wrong.length) {
      box.innerHTML = '<div style="color:#0f7a41;font-weight:700;text-align:center">' +
        (dc.round === 1 ? '🎉 全对！这一页可以收了' : '✅ 错词全清！可以收工') + '</div>';
      $('dcReW').classList.add('hide');
    } else {
      box.innerHTML = '<div style="color:#5b6270">本轮错词（' + dc.wrong.length + ' 个）：</div>' +
        dc.wrong.map(function (w) { return '<span>' + esc(w.k) + '（' + esc(w.c) + '）</span>'; }).join('');
      $('dcReW').classList.remove('hide');
    }
    dcUI();
  }
  document.querySelectorAll('#dcScope .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#dcScope .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); dc.scope = b.getAttribute('data-s');
      $('dcDone').classList.add('hide'); $('dcQuiz').classList.add('hide');
      dc.running = false; hush(null); dcUI();
    };
  });
  function dcTg(id, key) { $(id).onclick = function () { dc[key] = !dc[key]; this.classList.toggle('on', dc[key]); }; }
  dcTg('dcSlow', 'slow'); dcTg('dcShuf', 'shuf'); dcTg('dcAuto', 'auto'); dcTg('dcDbl', 'dbl');
  $('dcPic').onclick = function () {
    dc.pic = !dc.pic; this.classList.toggle('on', dc.pic);
    if (dc.running) dcStartView(false);
  };
  $('dcGo').onclick = function () {
    var l = dcList();
    if (!l.length) { alert(dc.scope === 'wrong' ? '错词本是空的，先默一轮吧。' : '没有词。'); return; }
    dcStart(l, 1);
  };
  $('dcOnlyW').onclick = function () {
    var l = wordsOf('wrong');
    if (!l.length) { alert('错词本还是空的 —— 先做一轮默写，错的会自动记下来。'); return; }
    dc.scope = 'wrong';
    document.querySelectorAll('#dcScope .ch').forEach(function (x) {
      x.classList.toggle('on', x.getAttribute('data-s') === 'wrong');
    });
    dcUI(); dcStart(l, 2);
  };
  $('dcPlay').onclick = function () { var w = dc.queue[dc.pos]; if (w) dcSay(w); };
  $('dcShow').onclick = function () { $('dcAns').classList.add('show'); };
  $('dcOkBtn').onclick = function () { dcMark(true); };
  $('dcNoBtn').onclick = function () { dcMark(false); };
  $('dcReW').onclick = function () { dcStart(dc.wrong.slice(), dc.round + 1); };
  $('dcAgain').onclick = function () { dcStart(dcList(), 1); };
  $('dcCopy').onclick = function () {
    var t = dc.wrong.map(function (w) { return w.k + '（' + w.c + '）'; }).join('　') || '（无错词）';
    try {
      var ta = document.createElement('textarea'); ta.value = t;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); alert('已复制：\n' + t);
    } catch (e) { alert(t); }
  };

  /* ---- 听读热身 ---- */
  var warm = { on: false, i: 0, timer: null, list: [] };
  function warmStart() {
    if (warm.on) return;
    warm.list = dcList();
    if (!warm.list.length) { alert('这个范围没有词。'); return; }
    warm.on = true; warm.i = 0;
    var ov = document.createElement('div'); ov.id = 'warmOv';
    ov.style.cssText = 'position:fixed;inset:0;background:#12202d;color:#fff;z-index:99;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center';
    ov.innerHTML = '<div style="font-size:13px;opacity:.6">👂 听读热身 · ' + scopeName() + ' · 共 ' + warm.list.length + ' 词</div>' +
      '<div id="wKana" style="font-size:46px;font-weight:800;margin:26px 0;letter-spacing:2px">—</div>' +
      '<div id="wMean" style="font-size:17px;color:#8fd0ff;min-height:24px"></div>' +
      '<div id="wCnt" style="font-size:13px;opacity:.6;margin-top:14px"></div>' +
      '<div style="display:flex;gap:10px;margin-top:26px">' +
      '<button id="wkRe" style="background:#2b3f52;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:16px">🔊 再听</button>' +
      '<button id="wkStop" style="background:#e35555;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:16px">⏹ 结束</button></div>';
    document.body.appendChild(ov);
    $('wkRe').onclick = function () { speak(warm.list[warm.i].k, null, dc.slow, false, null); };
    $('wkStop').onclick = stopWarm;
    warmTick();
  }
  function warmTick() {
    if (!warm.on) return;
    if (warm.i >= warm.list.length) { stopWarm(); return; }
    var w = warm.list[warm.i];
    $('wKana').textContent = w.k;
    $('wMean').textContent = w.c;
    $('wCnt').textContent = (warm.i + 1) + ' / ' + warm.list.length + '　跟着念出来';
    speak(w.k, null, dc.slow, false, null);
    warm.i++;
    warm.timer = setTimeout(warmTick, dc.slow ? 3600 : 2600);
  }
  function stopWarm() {
    warm.on = false;
    if (warm.timer) clearTimeout(warm.timer);
    hush(null);
    var ov = $('warmOv'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }
  $('dcWarm').onclick = warmStart;

  /* ================= ③ 自测卡 ================= */
  var cd = { scope: 'right', mode: 1, shuf: true, pic: true, queue: [], total: 0, ok: 0, no: 0,
             flipped: false, badList: [] };

  function cdList() { return wordsOf(cd.scope); }
  function cdUI() {
    $('cdPos').textContent = cd.queue.length;
    $('cdTot').textContent = cd.total;
    $('cdOk').textContent = cd.ok;
    $('cdNo').textContent = cd.no;
    $('cdQueueN').textContent = cd.badList.length;
  }
  function cdPrompt(w) {
    if (cd.mode === 1) return w.c;                                  // 中 → 日
    if (cd.mode === 2) return w.k;                                  // 假名 → 汉字
    return w.k;                                                     // 假名 → 中
  }
  function cdAnswer(w) {
    if (cd.mode === 1) return [w.k, (w.j ? w.j + '　' + w.a : w.a) + '　' + w.c];
    if (cd.mode === 2) return [w.j ? w.j : w.k, w.c + '　' + w.a];
    return [w.c, (w.j ? w.j + '　' : '') + w.a];
  }
  function cdShow() {
    var f = $('cdFlash');
    f.classList.remove('back');
    $('cdA1').classList.add('hide'); $('cdA2').classList.add('hide');
    cd.flipped = false;
    cdUI();
    if (!cd.queue.length) {
      $('cdQ').textContent = cd.badList.length ? ('还有 ' + cd.badList.length + ' 个不会') : '🎉 这一轮全过';
      $('cdHint').textContent = cd.badList.length ? '点下面「✕ 只练不会的」再来一轮' : '可以去做听读默写了';
      return;
    }
    var w = cd.queue[0];
    if (cd.pic && w.img) {
      $('cdQ').innerHTML = '<img class="ph" src="' + esc(w.img) + '" alt="">' +
        (cd.mode === 1 ? '' : '<div>' + esc(cdPrompt(w)) + '</div>');
    } else {
      $('cdQ').textContent = cdPrompt(w);
    }
    $('cdHint').textContent = '点卡片翻面看答案';
  }
  function cdFlip() {
    var w = cd.queue[0]; if (!w) return;
    if (cd.flipped) { cdShow(); return; }
    cd.flipped = true;
    $('cdFlash').classList.add('back');
    var a = cdAnswer(w);
    $('cdA1').textContent = a[0];
    $('cdA2').textContent = a[1];
    $('cdA1').classList.remove('hide');
    $('cdA2').classList.remove('hide');
    $('cdHint').textContent = '💡 ' + w.t;
  }
  function cdMark(knew) {
    var w = cd.queue[0]; if (!w) return;
    if (knew) {
      cd.ok++; cd.queue.shift(); delWrong(w.k);
      var bi = cd.badList.indexOf(w); if (bi >= 0) cd.badList.splice(bi, 1);
    } else {
      cd.no++; addWrong(w.k);
      cd.queue.push(cd.queue.shift());                 // 排到队尾，稍后再考
      if (cd.badList.indexOf(w) < 0) cd.badList.push(w);
    }
    cdShow();
  }
  function cdStart(list, reset) {
    cd.queue = cd.shuf ? shuffleArr(list.slice()) : list.slice();
    cd.total = cd.queue.length;
    if (reset) { cd.ok = 0; cd.no = 0; cd.badList = []; }
    cdShow();
  }
  document.querySelectorAll('#cdScope .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#cdScope .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); cd.scope = b.getAttribute('data-s');
      var l = cdList();
      if (!l.length) {
        cd.queue = []; cd.total = 0; cd.ok = 0; cd.no = 0; cd.badList = [];
        $('cdQ').textContent = cd.scope === 'wrong' ? '错词本是空的' : '没有词';
        $('cdHint').textContent = '先做一轮默写，错的会自动记进错词本';
        cdUI(); return;
      }
      cdStart(l, true);
    };
  });
  function cdSetMode(n) {
    cd.mode = n;
    $('cdM1').classList.toggle('on', n === 1);
    $('cdM2').classList.toggle('on', n === 2);
    $('cdM3').classList.toggle('on', n === 3);
    cdShow();
  }
  $('cdM1').onclick = function () { cdSetMode(1); };
  $('cdM2').onclick = function () { cdSetMode(2); };
  $('cdM3').onclick = function () { cdSetMode(3); };
  $('cdShuf').onclick = function () { cd.shuf = !cd.shuf; this.classList.toggle('on', cd.shuf); cdStart(cdList(), true); };
  $('cdPic').onclick = function () { cd.pic = !cd.pic; this.classList.toggle('on', cd.pic); cdShow(); };
  $('cdFlash').onclick = cdFlip;
  $('cdFlip').onclick = cdFlip;
  $('cdOkBtn').onclick = function () { cdMark(true); };
  $('cdNoBtn').onclick = function () { cdMark(false); };
  $('cdOnlyN').onclick = function () {
    if (!cd.badList.length) { alert('这一轮还没有「不会」的词。'); return; }
    cdStart(cd.badList.slice(), false);
  };
  $('cdReset').onclick = function () {
    var l = cdList();
    if (!l.length) { alert('错词本是空的。'); return; }
    cdStart(l, true);
  };
  $('cdTable').onclick = function () {
    var t = $('cdTableView');
    if (!t.classList.contains('hide')) { t.classList.add('hide'); return; }
    var h = '<table class="all">';
    cdList().forEach(function (w) {
      var bad = wrongStore.indexOf(w.k) >= 0;
      h += '<tr><td><b>' + esc(w.k) + '</b>' + (w.j ? '　' + esc(w.j) : '') +
        '<div style="font-size:12px;color:#c0392b">' + esc(w.c) + '</div></td>' +
        '<td class="s">' + (bad ? '❌ 不会' : '—') + '</td></tr>';
    });
    h += '</table>';
    t.innerHTML = h; t.classList.remove('hide');
  };
  $('cdPlayAll').onclick = function () {
    var l = cdList(); if (!l.length) return;
    hush(null);
    var i = 0;
    (function step() {
      if (i >= l.length) return;
      speak(l[i].k, null, false, false, null);
      i++; setTimeout(step, 1600);
    })();
  };

  /* ================= ④ 浊音 · 半浊音 ================= */
  var DKKEY = 'jp_daku_k';
  var dkWrong = [];
  function dkSyncN() { var e = $('dkWrongN'); if (e) e.textContent = dkWrong.length; }
  function dkSave() { try { localStorage.setItem(DKKEY, JSON.stringify(dkWrong)); } catch (e) {} dkSyncN(); }
  function dkLoad() {
    try { dkWrong = JSON.parse(localStorage.getItem(DKKEY) || '[]') || []; } catch (e) { dkWrong = []; }
    dkSyncN();
  }
  function dkWset(k) { if (dkWrong.indexOf(k) < 0) { dkWrong.push(k); dkSave(); } }
  function dkOset(k) { var i = dkWrong.indexOf(k); if (i >= 0) { dkWrong.splice(i, 1); dkSave(); } }
  function dkPool(s) {
    if (s === 'daku') return DAKU.filter(function (d) { return d.row !== 'ぱ行'; });
    if (s === 'han') return DAKU.filter(function (d) { return d.row === 'ぱ行'; });
    if (s === 'wrong') return DAKU.filter(function (d) { return dkWrong.indexOf(d.k) >= 0; });
    return DAKU.slice();
  }
  function dkToast(msg) {
    var n = $('dkToast'); if (!n) return;
    n.textContent = msg;
    clearTimeout(n._t); n._t = setTimeout(function () { if (n.textContent === msg) n.textContent = ''; }, 2000);
  }
  /* 带 onend 回调的朗读（限时要「播完才开始计时」） */
  function dkSpeak(text, slow, done) {
    var f = audFile(text);
    if (f) { playFile(f, slow, false, done); return; }
    if (typeof speechSynthesis === 'undefined') { if (done) done(); return; }
    var fired = false;
    var go = function () { if (fired) return; fired = true; if (done) done(); };
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; if (!jaVoice) pick(); if (jaVoice) u.voice = jaVoice;
      u.rate = slow ? 0.5 : 0.82;
      u.onend = go;
      speechSynthesis.speak(u);
      setTimeout(go, slow ? 2600 : 1600);
    } catch (e) { go(); }
  }

  var dk = { sub: 'read', rScope: 'all', slow: false, cn: true, ex: true, dbl: false };

  function dkSetSub(s) {
    dk.sub = s;
    document.querySelectorAll('#dkSub .ch').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-k') === s);
    });
    $('dkRead').classList.toggle('hide', s !== 'read');
    $('dkEar').classList.toggle('hide', s !== 'ear');
    $('dkDict').classList.toggle('hide', s !== 'dict');
    hush(null);
    if (s === 'ear') dkEarNext();
    if (s === 'dict') dkDUI();
    window.scrollTo(0, 0);
  }

  /* ---------- A. 对比跟读 ---------- */
  function dkRender() {
    var h = '';
    DAKU_PAIRS.forEach(function (p) {
      h += '<div class="pair">' +
        '<div class="side kei" data-say="' + esc(p.a) + '"><div class="lb">' + esc(p.la || '') + '</div><div class="k">' + esc(p.a) + '</div></div>' +
        '<div class="mid">听<br>差别</div>' +
        '<div class="side ken" data-say="' + esc(p.b) + '"><div class="lb">' + esc(p.lb || '') + '</div><div class="k">' + esc(p.b) + '</div></div>' +
        '</div>';
    });
    $('dkPairs').innerHTML = h;
    var g = '';
    dkPool(dk.rScope).forEach(function (d) {
      g += '<div class="wc" data-say="' + esc(d.k) + '">' +
        '<div class="k">' + esc(d.k) + '</div>' +
        '<div class="j">' + esc(d.r) + '　' + esc(d.s) + (d.row === 'ぱ行' ? ' ＋ ゜' : ' ＋ ゛') + '</div>' +
        '<div class="c">' + esc(d.h) + '</div>' +
        (d.ex ? '<div class="ex2">' + esc(d.ex) + '（' + esc(d.ez) + '）</div>' : '') +
        (d.t ? '<div class="tip2">' + esc(d.t) + '</div>' : '') +
        '</div>';
    });
    $('dkCards').innerHTML = g;
    document.querySelectorAll('#dkRead [data-say]').forEach(function (el) {
      var t = null, lp = false;
      el.addEventListener('touchstart', function () {
        lp = false;
        t = setTimeout(function () { lp = true; speak(el.getAttribute('data-say'), el, true, false, null); }, 600);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
        el.addEventListener(ev, function () { if (t) { clearTimeout(t); t = null; } }, { passive: true });
      });
      el.addEventListener('click', function () {
        if (lp) { lp = false; return; }
        hush(null);
        speak(el.getAttribute('data-say'), el, dk.slow, dk.dbl, null);
      });
    });
  }
  var dkChain = null;
  function dkReadAll() {
    hush(null); if (dkChain) { clearTimeout(dkChain); dkChain = null; }
    var els = document.querySelectorAll('#dkRead [data-say]');
    var i = 0, gap = dk.slow ? 2400 : 1700;
    (function step() {
      if (i >= els.length) { dkChain = null; return; }
      speak(els[i].getAttribute('data-say'), els[i], dk.slow, dk.dbl, null);
      i++; dkChain = setTimeout(step, gap);
    })();
  }

  /* ---------- B. 听辨（最小对立二选一） ---------- */
  var dkEar = { scope: 'all', cur: null, q: '', n: 0, ok: 0, no: 0, stat: {}, lock: true, timer: null };
  function dkEarPool() {
    var ps = DAKU_PAIRS.filter(function (p) { return dkEar.scope === 'all' || p.grp === dkEar.scope; });
    return ps.length ? ps : DAKU_PAIRS;
  }
  function dkOpt(btn, cls, txt) {
    btn.className = 'act ' + cls;
    btn.textContent = txt;
    btn.style.fontSize = '30px'; btn.style.padding = '18px 0';
  }
  function dkEarNext() {
    if (dkEar.timer) { clearTimeout(dkEar.timer); dkEar.timer = null; }
    var pool = dkEarPool();
    var p = pool[Math.floor(Math.random() * pool.length)];
    var A = Math.random() < 0.5 ? p.a : p.b;
    var B = A === p.a ? p.b : p.a;
    dkEar.cur = p; dkEar.q = Math.random() < 0.5 ? A : B; dkEar.lock = false;
    var ba = $('dkOptA'), bb = $('dkOptB');
    dkOpt(ba, 'ghost', A); ba.dataset.v = A;
    dkOpt(bb, 'ghost', B); bb.dataset.v = B;
    $('dkEarMsg').textContent = '第 ' + (dkEar.n + 1) + ' 题 —— 听，然后选"喉咙有没有振"';
    dkEar.n++;
    dkEarUI();
    dkEar.timer = setTimeout(function () { speak(dkEar.q, null, dk.slow, false, null); }, 260);
  }
  function dkEarUI() {
    $('dkEarN').textContent = dkEar.n;
    $('dkEarOk').textContent = dkEar.ok;
    $('dkEarNo').textContent = dkEar.no;
    var tot = dkEar.ok + dkEar.no;
    $('dkEarPct').textContent = tot ? Math.round(dkEar.ok / tot * 100) + '%' : '—';
    $('dkEarBar').style.width = (tot ? (dkEar.ok / tot) * 100 : 0) + '%';
    var rows = [], worst = null;
    Object.keys(dkEar.stat).forEach(function (g) {
      var s = dkEar.stat[g]; if (s.n < 2) return;
      rows.push({ g: g, n: s.n, ok: s.ok, p: s.ok / s.n });
      if (!worst || s.ok / s.n < worst.p) worst = { g: g, n: s.n, ok: s.ok, p: s.ok / s.n };
    });
    if (worst && tot >= 6) {
      $('dkEarRow').innerHTML = '🔎 最弱：<b>' + esc(worst.g) + '</b>　' + worst.ok + '/' + worst.n +
        '（' + Math.round(worst.p * 100) + '%）—— 这一组单独多念几遍';
    } else {
      $('dkEarRow').textContent = '30 对最小对立 · 每个音都要 ≥90% 才算耳朵过关';
    }
    var sum = $('dkEarSum');
    if (rows.length < 2) { sum.style.display = 'none'; return; }
    rows.sort(function (x, y) { return x.p - y.p; });
    var h = '<div class="sec" style="margin:0 0 6px">分组正确率（练到 ≥90% 再收）</div><table class="all">';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.g) + '</td><td class="s">' + r.ok + '/' + r.n + '　<b style="color:' +
        (r.p >= 0.9 ? '#0f7a41' : (r.p >= 0.7 ? '#b06a00' : '#c0392b')) + '">' + Math.round(r.p * 100) + '%</b></td></tr>';
    });
    h += '</table>';
    sum.innerHTML = h; sum.style.display = 'block';
  }
  function dkEarAnswer(v) {
    if (dkEar.lock || !dkEar.cur) return;
    dkEar.lock = true;
    var ok = v === dkEar.q, g = dkEar.cur.grp;
    if (!dkEar.stat[g]) dkEar.stat[g] = { n: 0, ok: 0 };
    dkEar.stat[g].n++;
    if (ok) { dkEar.ok++; dkEar.stat[g].ok++; }
    else { dkEar.no++; dkToast('❌ 正确答案是 ' + dkEar.q + '　再听一遍'); }
    speak(dkEar.q, null, false, false, null);
    [$('dkOptA'), $('dkOptB')].forEach(function (b) {
      var isRight = b.dataset.v === dkEar.q;
      if (isRight) dkOpt(b, 'ok', b.dataset.v);
      else if (b.dataset.v === v) dkOpt(b, 'no', b.dataset.v);
      else dkOpt(b, 'ghost', b.dataset.v);
    });
    var qLab = dkEar.q === dkEar.cur.a ? (dkEar.cur.la || '') : (dkEar.cur.lb || '');
    $('dkEarMsg').textContent = ok ? '✅ 对 —— ' + dkEar.q + '：' + qLab
                                   : '❌ 你选的是 ' + v + '，实际是 ' + dkEar.q + '（' + qLab + '）';
    dkEarUI();
    dkEar.timer = setTimeout(dkEarNext, ok ? 900 : 1700);
  }

  /* ---------- C. 听写 / 限时认读 ---------- */
  var dkD = { scope: 'daku', mix: true, timer: false, slow: false, word: false,
              queue: [], pos: 0, round: 1, ok: 0, no: 0, wrong: [], react: [],
              running: false, t: null, t0: 0 };
  function dkDName() {
    return { daku: '浊音 20', han: '半浊音 5', all: '全部 25', wrong: '上次错的' }[dkD.scope] || '';
  }
  function dkItemsKana() {
    var base = dkPool(dkD.scope), seen = {}, out = [];
    base.forEach(function (d) { if (!seen[d.k]) { seen[d.k] = 1; out.push({ v: d.k, d: d, kind: 'daku' }); } });
    if (dkD.mix && dkD.scope !== 'wrong') {
      base.forEach(function (d) { if (!seen[d.s]) { seen[d.s] = 1; out.push({ v: d.s, d: d, kind: 'sei' }); } });
    }
    return out;
  }
  function dkItemsWord() {
    var base = dkPool(dkD.scope), seen = {}, out = [];
    base.forEach(function (d) {
      if (d.ex && !seen[d.ex]) { seen[d.ex] = 1; out.push({ v: d.ex, d: d, kind: 'word' }); }
    });
    return out;
  }
  function dkDecideList() {
    if (dkD.scope === 'wrong') {
      return dkPool('wrong').map(function (d) { return { v: d.k, d: d, kind: 'daku' }; });
    }
    return dkD.word ? dkItemsWord() : dkItemsKana();
  }
  function dkDUI() {
    $('dkOk').textContent = dkD.ok; $('dkNo').textContent = dkD.no;
    $('dkQ').textContent = dkD.wrong.length;
    $('dkRound').textContent = '第 ' + dkD.round + ' 轮';
    var tot = dkD.queue.length;
    $('dkTot').textContent = tot;
    $('dkPos').textContent = Math.min(dkD.pos + 1, tot);
    $('dkFill').style.width = (tot ? Math.min(100, (dkD.pos / tot) * 100) : 0) + '%';
    $('dkStart').classList.remove('hide');
    var _n = dkDecideList().length;
    var _note = dkD.word ? '例词' : (dkD.mix && dkD.scope !== 'wrong' ? '清浊混出' : '只浊音');
    $('dkGo').textContent = '开始听写（' + dkDName() + ' · ' + _note + ' · ' + _n + ' 题）';
  }
  function dkDShow(auto) {
    if (dkD.pos >= dkD.queue.length) { dkDFinish(); return; }
    var it = dkD.queue[dkD.pos], d = it.d;
    $('dkKana').textContent = it.kind === 'word' ? d.ex : it.v;
    $('dkHintRow').textContent = it.kind === 'word'
      ? (d.ez + '　（含 ' + d.k + '）')
      : (it.kind === 'sei' ? (it.v + '（' + d.rs + '）清音 · 不振　↔ ' + d.k)
                           : (d.r + '　' + d.s + ' → ' + d.k));
    $('dkMean').textContent = it.kind === 'word' ? '' : d.h;
    $('dkTipv').textContent = d.t ? ('⚠️ ' + d.t)
      : (it.kind === 'sei' ? '清音：声带不振动（近似汉语的 k／t／s）' : '浊音：手贴喉头，要有振感');
    $('dkAns').classList.remove('show');
    $('dkTbar').style.display = 'none';
    dkDUI();
    setTimeout(dkDPlay, auto ? 220 : 0);
  }
  function dkDPlay() {
    var it = dkD.queue[dkD.pos]; if (!it) return;
    var txt = it.kind === 'word' ? it.d.ex : it.v;
    $('dkTbar').style.display = 'none';
    dkSpeak(txt, dkD.slow, function () {
      if (!dkD.running) return;
      dkD.t0 = Date.now();
      if (!dkD.timer) return;
      var bar = $('dkTbar'), i = bar.firstElementChild;
      bar.style.display = 'block';
      i.style.transition = 'none'; i.style.width = '100%';
      void i.offsetWidth;
      i.style.transition = 'width 1.5s linear'; i.style.width = '0%';
      dkD.t = setTimeout(function () { dkD.t = null; dkMark(false, true); }, 1560);
    });
  }
  function dkMark(correct, tmo) {
    if (!dkD.running) return;
    if (dkD.t) { clearTimeout(dkD.t); dkD.t = null; }
    var it = dkD.queue[dkD.pos], d = it.d;
    if (correct) { dkD.ok++; dkOset(d.k); }
    else { dkD.no++; dkD.wrong.push(it); dkWset(d.k); }
    if (tmo) {
      $('dkAns').classList.add('show');
      $('dkTipv').textContent = '⏱ 1.5 秒没认出来 —— 这一格还没自动化，回去多念几遍';
      $('dkTbar').style.display = 'none';
    }
    dkD.pos++;
    setTimeout(function () { dkDShow(true); }, correct ? 200 : (tmo ? 2000 : 900));
  }
  function dkDStart(list, round) {
    dkD.queue = shuffleArr(list.slice());
    dkD.pos = 0; dkD.round = round; dkD.ok = 0; dkD.no = 0;
    dkD.wrong = []; dkD.react = []; dkD.running = true;
    $('dkStart').classList.add('hide'); $('dkDone').classList.add('hide');
    $('dkQuiz').classList.remove('hide');
    dkDShow(true);
  }
  function dkDFinish() {
    dkD.running = false;
    if (dkD.t) { clearTimeout(dkD.t); dkD.t = null; }
    $('dkTbar').style.display = 'none';
    hush(null);
    $('dkQuiz').classList.add('hide'); $('dkDone').classList.remove('hide');
    var tot = dkD.ok + dkD.no;
    $('dkScore').textContent = dkD.ok + ' / ' + tot;
    var extra = '';
    if (dkD.react.length) {
      var s = 0; dkD.react.forEach(function (r) { s += r; });
      var avg = s / dkD.react.length;
      extra = '　平均反应 ' + (avg / 1000).toFixed(2) + 's' + (dkD.timer ? (avg <= 1200 ? '（⚡ 已自动化）' : '（还慢，再刷）') : '');
    }
    $('dkDetail').textContent = '第 ' + dkD.round + ' 轮 · 正确率 ' +
      (tot ? Math.round(dkD.ok / tot * 100) : 0) + '%' + extra;
    var box = $('dkWrongBox');
    if (!dkD.wrong.length) {
      box.innerHTML = '<div style="color:#0f7a41;font-weight:700;text-align:center">' +
        (dkD.round === 1 ? '🎉 全对！' : '✅ 错的全清了，可以收工') + '</div>';
      $('dkReW').classList.add('hide');
    } else {
      box.innerHTML = '<div style="color:#5b6270">这轮错的（' + dkD.wrong.length + ' 个）：</div>' +
        dkD.wrong.map(function (it) { return '<span>' + esc(it.kind === 'word' ? it.d.ex : it.v) + '</span>'; }).join('') +
        '<div style="font-size:12px;color:#8a919c;margin-top:6px">写下来 → 出声念 5 遍 → 再默</div>';
      $('dkReW').classList.remove('hide');
    }
    dkDUI();
  }

  /* ---------- 绑定 ---------- */
  document.querySelectorAll('#dkSub .ch').forEach(function (b) {
    b.onclick = function () { dkSetSub(b.getAttribute('data-k')); };
  });
  document.querySelectorAll('#dkScopeR .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#dkScopeR .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); dk.rScope = b.getAttribute('data-s');
      hush(null); dkRender();
    };
  });
  document.querySelectorAll('#dkScopeE .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#dkScopeE .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); dkEar.scope = b.getAttribute('data-s');
      dkEarNext();
    };
  });
  document.querySelectorAll('#dkScopeD .ch').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#dkScopeD .ch').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); dkD.scope = b.getAttribute('data-s');
      dkD.running = false; hush(null);
      $('dkQuiz').classList.add('hide'); $('dkDone').classList.add('hide');
      dkDUI();
    };
  });
  function dkTg(id, key, fn) {
    $(id).onclick = function () { dk[key] = !dk[key]; this.classList.toggle('on', dk[key]); if (fn) fn(); };
  }
  dkTg('dkSlow', 'slow');
  dkTg('dkCn', 'cn', function () { $('mDaku').classList.toggle('hideH', !dk.cn); });
  dkTg('dkEx', 'ex', function () { $('mDaku').classList.toggle('hideE', !dk.ex); });
  dkTg('dkDbl', 'dbl');
  $('dkAll').onclick = dkReadAll;
  $('dkStop').onclick = function () { if (dkChain) { clearTimeout(dkChain); dkChain = null; } hush(null); };
  $('dkEarPlay').onclick = function () {
    if (!dkEar.cur) { dkEarNext(); return; }
    speak(dkEar.q, null, dk.slow, false, null);
  };
  $('dkOptA').onclick = function () { dkEarAnswer(this.dataset.v); };
  $('dkOptB').onclick = function () { dkEarAnswer(this.dataset.v); };
  $('dkMix').onclick = function () {
    dkD.mix = !dkD.mix; this.classList.toggle('on', dkD.mix);
    dkD.running = false; $('dkQuiz').classList.add('hide'); $('dkDone').classList.add('hide'); dkDUI();
  };
  $('dkTimer').onclick = function () {
    dkD.timer = !dkD.timer; this.classList.toggle('on', dkD.timer);
    dkToast(dkD.timer ? '⚡ 限时：播完 1.5 秒内没点「✅ 认出来了」就算错' : '✍️ 听写：听到→写在纸上→对答案');
  };
  $('dkSlow2').onclick = function () { dkD.slow = !dkD.slow; this.classList.toggle('on', dkD.slow); };
  $('dkWord').onclick = function () {
    dkD.word = !dkD.word; this.classList.toggle('on', dkD.word);
    this.textContent = dkD.word ? '🔤 听例词中' : '🔤 改为听例词';
    $('dkMix').classList.toggle('on', dkD.mix && !dkD.word);
    dkD.running = false; $('dkQuiz').classList.add('hide'); $('dkDone').classList.add('hide'); dkDUI();
  };
  $('dkGo').onclick = function () {
    var l = dkDecideList();
    if (!l.length) { alert(dkD.scope === 'wrong' ? '浊音错词本是空的 —— 先听写一轮。' : '没有内容。'); return; }
    dkDStart(l, 1);
  };
  $('dkOnlyW').onclick = function () {
    var l = dkPool('wrong');
    if (!l.length) { alert('浊音错词本还是空的 —— 先做一轮听写，错的会自动记下来。'); return; }
    dkD.scope = 'wrong'; dkD.word = false;
    $('dkWord').textContent = '🔤 改为听例词'; $('dkWord').classList.remove('on');
    document.querySelectorAll('#dkScopeD .ch').forEach(function (x) {
      x.classList.toggle('on', x.getAttribute('data-s') === 'wrong');
    });
    dkDStart(l.map(function (d) { return { v: d.k, d: d, kind: 'daku' }; }), 2);
  };
  $('dkPlay').onclick = dkDPlay;
  $('dkShow').onclick = function () { $('dkAns').classList.add('show'); };
  $('dkOkBtn').onclick = function () {
    if (!dkD.running) return;
    var dt = dkD.t0 ? (Date.now() - dkD.t0) : 0;
    dkD.react.push(dt);
    dkToast('⚡ ' + (dt / 1000).toFixed(2) + 's');
    dkMark(true);
  };
  $('dkNoBtn').onclick = function () { dkMark(false, false); };
  $('dkReW').onclick = function () { dkDStart(dkD.wrong.slice(), dkD.round + 1); };
  $('dkAgain').onclick = function () { dkDStart(dkDecideList(), 1); };
  $('dkCopy').onclick = function () {
    var t = dkD.wrong.map(function (it) { return it.kind === 'word' ? it.d.ex : it.v; }).join('　') || '（无错词）';
    try {
      var ta = document.createElement('textarea'); ta.value = t;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); alert('已复制：\n' + t);
    } catch (e) { alert(t); }
  };

  /* ================= 入口页跳转参数 ================= */
  function applyEntryParams() {
    var q = (location.search || '').replace(/^\?/, '');
    if (!q) return;
    var p = {};
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (p.sets !== undefined) {
      try { localStorage.setItem('jp_sel', JSON.stringify(p.sets.split(',').filter(Boolean))); } catch (e) {}
    }
    var want = p.set || (p.sets ? 'sel' : '');
    if (want) {
      [['rdScope', 'rd'], ['dcScope', 'dc'], ['cdScope', 'cd']].forEach(function (pair) {
        var box = document.getElementById(pair[0]); if (!box) return;
        var b = box.querySelector('.ch[data-s="' + want + '"]');
        var use = want;
        if (!b && p.sets) { b = box.querySelector('.ch[data-s="sel"]'); use = 'sel'; }   // 这个页签没这个范围 → 退回自选
        if (!b) return;
        box.querySelectorAll('.ch').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        want = use;  // 下面三个分支用实际生效的范围
        if (pair[1] === 'rd') { rd.scope = use; renderRead(); }
        if (pair[1] === 'dc') { dc.scope = use; dcUI(); }
        if (pair[1] === 'cd') { cd.scope = use; cdStart(cdList(), true); }
        if (pair[1] === 'rd' && want === 'sent') { /* 例句走自己的渲染 */ }
      });
    }
    injectSelChip();
    dcUI();
    if (cd.queue && !cd.queue.length) cdStart(cdList(), true);
    if (p.mode && ['read', 'dict', 'card', 'daku'].indexOf(p.mode) >= 0) setMode(p.mode);
  }

  /* ================= 发音引擎切换 ================= */
  (function bindEngine() {
    var bs = document.querySelectorAll('.engbtn');
    if (!bs.length) return;
    function paint() {
      bs.forEach(function (b) { b.textContent = engineLabel(); b.classList.toggle('on', ENGINE !== 2); });
    }
    bs.forEach(function (b, i) {
      b.onclick = function () { ENGINE = (ENGINE + 1) % 3; paint(); hush(null); };
    });
    paint();
  })();

  /* ================= 初始化 ================= */
  loadWrong();
  injectSelChip();
  renderRead();
  dcUI();
  cdStart(cdList(), true);
  dkLoad(); dkRender(); dkEarUI(); dkDUI();
  applyEntryParams();
})();
