/* ambient.js —— 环境音共用播放器：多选混音 + 音量记忆 + 悬浮按钮（任何页面 include 即可）
   依赖：ambient_data.js（window.JP_AMBIENT） */
(function () {
  var LIST = window.JP_AMBIENT || [];
  if (!LIST.length) return;
  var DIR = 'audio_ambient/';
  /* 图标用 icons.js 的线条图标；标签里哪怕带了符号也剥掉，只留中文 */
  var ICON = { rain: 'rain', waves: 'wave', wind: 'wind', fire: 'fire', birds: 'bird', cafe: 'cafe', white: 'noise' };
  function ic(name) { return window.JPI ? window.JPI(name) : ''; }
  function nameOf(x) { return String(x.label || x.key).replace(/^[^\u4e00-\u9fa5A-Za-z]+/, ''); }
  var KEY = 'jp_amb';

  var st = { on: true, vol: 0.55, sel: [] };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) { st = { on: saved.on !== false, vol: typeof saved.vol === 'number' ? saved.vol : 0.55, sel: saved.sel || [] }; }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* ---------- 音频 ---------- */
  var ctx = null, master = null, bufs = {}, live = {};
  function ac() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = st.vol; master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
    return ctx;
  }
  function startOne(key) {
    var c = ac(); if (!c) return;
    var item = LIST.filter(function (x) { return x.key === key; })[0]; if (!item) return;
    function go(buf) {
      if (live[key]) return;
      var s = c.createBufferSource();
      s.buffer = buf; s.loop = true;
      var g = c.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(master);
      try { g.gain.setTargetAtTime(1, c.currentTime, 0.8); } catch (e) { g.gain.value = 1; }
      s.start(0);
      live[key] = { src: s, gain: g };
    }
    if (bufs[key]) { go(bufs[key]); return; }
    fetch(DIR + item.file).then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); })
      .then(function (b) { bufs[key] = b; go(b); }).catch(function () {});
  }
  function stopOne(key, quick) {
    var n = live[key]; if (!n) return;
    try {
      n.gain.gain.setTargetAtTime(0, ctx.currentTime, quick ? 0.05 : 0.5);
      var s = n.src;
      setTimeout(function () { try { s.stop(); } catch (e) {} }, quick ? 120 : 900);
    } catch (e) {}
    delete live[key];
  }
  function apply() {
    if (!st.on || !st.sel.length) { Object.keys(live).forEach(function (k) { stopOne(k); }); return; }
    LIST.forEach(function (x) { if (st.sel.indexOf(x.key) >= 0) startOne(x.key); });
    Object.keys(live).forEach(function (k) { if (st.sel.indexOf(k) < 0) stopOne(k); });
    if (master) { try { master.gain.setTargetAtTime(st.vol, ctx.currentTime, 0.2); } catch (e) { master.gain.value = st.vol; } }
  }
  // 浏览器策略：没有用户手势前不能出声 → 第一次触摸时补播
  function armGesture() {
    if (!(st.on && st.sel.length)) return;
    var f = function () {
      ac(); apply();
      window.removeEventListener('pointerdown', f); window.removeEventListener('touchstart', f);
    };
    window.addEventListener('pointerdown', f, { once: true });
    window.addEventListener('touchstart', f, { once: true });
  }

  /* ---------- UI ---------- */
  var ui = document.createElement('div');
  ui.id = 'ambWrap';
  ui.innerHTML =
    '<button id="ambBtn" aria-label="环境音"><span id="ambIco"></span></button>' +
    '<div id="ambSheet" class="hide">' +
      '<div class="amb-hd"><b>环境音</b><button id="ambClose" aria-label="关闭">关闭</button></div>' +
      '<div class="amb-chips" id="ambChips"></div>' +
      '<div class="amb-vol"><span>音量</span><input id="ambVol" type="range" min="0" max="100" value="55"></div>' +
      '<div class="amb-ft"><button id="ambAllOff">全部停</button><span id="ambTip">可多选叠加 · 边默边听</span></div>' +
    '</div>';
  var css = document.createElement('style');
  css.textContent = [
    '#ambWrap{position:fixed;right:14px;bottom:104px;z-index:60;font-family:-apple-system,"PingFang SC",sans-serif}#ambBtn{display:grid;place-items:center;color:inherit}#ambIco{display:grid;place-items:center;font-size:22px;line-height:1}.amb-chips button{display:inline-flex;align-items:center;gap:5px}.amb-chips svg.ic{font-size:14px}',
    '#ambBtn{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.8);font-size:22px;',
    'background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.66));backdrop-filter:blur(18px) saturate(180%);',
    '-webkit-backdrop-filter:blur(18px) saturate(180%);box-shadow:0 10px 26px rgba(16,26,44,.18);transition:transform .2s cubic-bezier(.32,.72,0,1)}',
    '#ambBtn:active{transform:scale(.93)}',
    '#ambBtn.on{background:linear-gradient(160deg,#cfe6ff,#eaf4ff)}',
    '#ambSheet{position:absolute;right:0;bottom:62px;width:272px;border-radius:22px;padding:14px;',
    'background:linear-gradient(160deg,rgba(255,255,255,.96),rgba(255,255,255,.86));backdrop-filter:blur(24px) saturate(180%);',
    '-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.9);box-shadow:0 20px 50px rgba(16,26,44,.22)}',
    '#ambSheet.hide{display:none}',
    '.amb-hd{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#0b1220;margin-bottom:10px}',
    '.amb-hd button{border:0;background:none;font-size:15px;color:#8b94a3}',
    '.amb-chips{display:flex;flex-wrap:wrap;gap:7px}',
    '.amb-chips button{border:1px solid rgba(11,18,32,.1);background:rgba(255,255,255,.78);color:#3f4a5a;',
    'font:650 12px/1 inherit;font-family:inherit;padding:8px 11px;border-radius:999px;transition:transform .18s ease}',
    '.amb-chips button:active{transform:scale(.95)}',
    '.amb-chips button.on{background:linear-gradient(160deg,#2b3a4f,#16202c);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(16,26,44,.28)}',
    '.amb-vol{display:flex;align-items:center;gap:9px;margin:12px 2px 2px;font-size:12px;color:#5b6473}',
    '.amb-vol input{flex:1;accent-color:#0a84ff}',
    '.amb-ft{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:#8b94a3}',
    '.amb-ft button{border:1px solid rgba(11,18,32,.1);background:rgba(255,255,255,.8);color:#3f4a5a;',
    'font:650 11.5px/1 inherit;font-family:inherit;padding:7px 10px;border-radius:10px}',
    '@media print{#ambWrap{display:none!important}}',
    '@media (prefers-color-scheme:dark){',
    '#ambBtn{background:linear-gradient(160deg,rgba(52,60,74,.92),rgba(34,40,52,.78));border-color:rgba(255,255,255,.14)}',
    '#ambSheet{background:linear-gradient(160deg,rgba(40,46,58,.97),rgba(28,33,44,.93));border-color:rgba(255,255,255,.12)}',
    '.amb-hd{color:#f2f5fa}.amb-chips button{background:rgba(255,255,255,.08);color:#cbd5e1;border-color:rgba(255,255,255,.12)}',
    '.amb-chips button.on{background:linear-gradient(160deg,#e9eef7,#cdd6e4);color:#12161d}}'
  ].join('');
  function mount() {
    document.head.appendChild(css);
    document.body.appendChild(ui);
    var chips = ui.querySelector('#ambChips');
    LIST.forEach(function (x) {
      var b = document.createElement('button');
      b.setAttribute('data-k', x.key); b.innerHTML = ic(ICON[x.key] || 'noise') + '<span>' + nameOf(x) + '</span>';
      if (st.sel.indexOf(x.key) >= 0) b.classList.add('on');
      b.onclick = function () {
        var i = st.sel.indexOf(x.key);
        if (i >= 0) { st.sel.splice(i, 1); b.classList.remove('on'); }
        else { st.sel.push(x.key); b.classList.add('on'); st.on = true; }
        save(); ac(); apply(); paintBtn();
      };
      chips.appendChild(b);
    });
    ui.querySelector('#ambVol').value = Math.round(st.vol * 100);
    ui.querySelector('#ambVol').oninput = function () { st.vol = this.value / 100; save(); ac(); apply(); };
    ui.querySelector('#ambClose').onclick = function () { ui.querySelector('#ambSheet').classList.add('hide'); };
    ui.querySelector('#ambAllOff').onclick = function () {
      st.sel = []; st.on = false; save(); apply(); paintBtn();
      chips.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    };
    ui.querySelector('#ambBtn').onclick = function () {
      var sheet = ui.querySelector('#ambSheet');
      if (sheet.classList.contains('hide')) {
        sheet.classList.remove('hide');
        if (st.sel.length) { st.on = true; ac(); apply(); }      // 点开就续播
        paintBtn();
      } else sheet.classList.add('hide');
    };
    paintBtn();
    armGesture();
  }
  function paintBtn() {
    var on = st.on && st.sel.length > 0;
    ui.querySelector('#ambBtn').classList.toggle('on', on);
    var first = LIST.filter(function (x) { return x.key === st.sel[0]; })[0];
    ui.querySelector('#ambIco').innerHTML = ic(on && first ? (ICON[first.key] || 'headphones') : 'headphones') || '音';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.Ambient = {
    state: st,
    set: function (sel) { st.sel = sel || []; st.on = st.sel.length > 0; save(); ac(); apply(); },
    vol: function (v) { st.vol = v; save(); ac(); apply(); }
  };
})();
