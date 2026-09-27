/* srs.js —— 复习排程（艾宾浩斯间隔，按「范围」记，全在本机算，不用再跑脚本）
   · 每个范围记：已复习 n 次、上次日期、下次到期日
   · 默完一轮（工具页自动）或在入口页点「✓ 默完了」→ n+1，下次 = 今天 + 间隔[n]
   · 第一次打开时，用 复习排程.js（JP_SCHED）里的日期做起点；从没排过的新词组 = 今天就该默第 1 次
   存储：localStorage.jp_srs = { setId: { n, last, due, hist:[...], prev } } */
(function () {
  var KEY = 'jp_srs';
  var GAP = [1, 2, 4, 7, 15, 30];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

  var db = {};
  try { db = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { db = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* 用 JP_SCHED 的「9/27」这种日期做起点（只补没记录过的范围） */
  (function seed() {
    var S = window.JP_SCHED; if (!S) return;
    var t = parse(today()), changed = false;
    (S.due || []).concat(S.late || []).forEach(function (x) {
      if (!x || !x.setId || db[x.setId]) return;
      var m = String(x.date || '').match(/^(\d{1,2})\/(\d{1,2})$/);
      var due = today();
      if (m) {
        var d = new Date(t.getFullYear(), +m[1] - 1, +m[2]);
        if (d - t > 180 * 86400000) d.setFullYear(d.getFullYear() - 1);
        due = ymd(d);
      }
      db[x.setId] = { n: Math.max(0, (+x.round || 1) - 1), last: null, due: due, hist: [] };
      changed = true;
    });
    if (changed) save();
  })();

  function ensure(ids) {
    var changed = false;
    ids.forEach(function (id) { if (!db[id]) { db[id] = { n: 0, last: null, due: today(), hist: [] }; changed = true; } });
    if (changed) save();
  }
  function status(id) {
    var r = db[id]; if (!r) return null;
    var t = today();
    return { id: id, n: r.n, last: r.last, due: r.due, days: diff(t, r.due), doneToday: r.last === t,
             next: GAP[Math.min(r.n, GAP.length - 1)], stage: Math.min(r.n, GAP.length) };
  }
  function done(ids) {
    var t = today();
    (ids || []).forEach(function (id) {
      if (!id) return;
      var r = db[id] || { n: 0, last: null, due: t, hist: [] };
      if (r.last === t) return;                       // 同一天默多遍只算一次
      r.prev = { n: r.n, last: r.last, due: r.due };
      r.n = (r.n || 0) + 1;
      r.last = t;
      r.due = addDays(t, GAP[Math.min(r.n - 1, GAP.length - 1)]);
      r.hist = (r.hist || []).concat([t]).slice(-40);
      db[id] = r;
    });
    save();
  }
  function undo(id) {
    var r = db[id]; if (!r || !r.prev) return;
    var h = r.hist || [];
    if (h.length && h[h.length - 1] === r.last) h.pop();
    db[id] = { n: r.prev.n, last: r.prev.last, due: r.prev.due, hist: h };
    save();
  }
  function fmt(s) { var d = parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); }

  window.JPSRS = { GAP: GAP, today: today, ensure: ensure, status: status, done: done, undo: undo, fmt: fmt, addDays: addDays };
})();
