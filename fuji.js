/* fuji.js —— 富士山写实动态场景（WebGL 光追 + Canvas，全部代码生成，不用图片、不用 emoji）
   · 光追：地形光线步进求交、软阴影、天空环境光、大气散射；湖面按菲涅尔反射 + 日月高光；黄昏/清晨有丁达尔光束
   · 不支持 WebGL 的设备自动退回 Canvas 版（网址加 ?rt=0 可强制看 Canvas 版）
   用法：<div data-fuji="hero"></div> 或 data-fuji="banner"，引入本文件即自动绘制。
   · 天色跟真实时间：清晨 5–8 / 白天 8–16 / 黄昏 16–19 / 夜晚 19–5
   · 季节跟月份：春＝樱花瓣 · 夏＝萤火虫/飞絮 · 秋＝红叶 · 冬＝雪
   · 动态：云层漂移、山顶笠云、湖面倒影随波纹抖动、日月碎光、湖面薄雾、飞鸟、三维翻转的落叶/花瓣（带阵风）
   · 省电：离开屏幕或切到后台自动暂停；系统开了「减少动态效果」只画静止的一帧
   · 调试：网址加 ?t=night&season=winter 可强制指定
   对外：window.JPFuji = { phase, season, monthName, mount } */
(function () {
  var Q = {};
  (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('='); if (i > 0) Q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  var NOW = new Date();
  function phase() {
    if (/^(dawn|day|dusk|night)$/.test(Q.t || '')) return Q.t;
    var h = NOW.getHours();
    return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'dusk' : 'night';
  }
  function season() {
    if (/^(spring|summer|autumn|winter)$/.test(Q.season || '')) return Q.season;
    var m = NOW.getMonth() + 1;
    return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
  }
  var MONTHS = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];
  function monthName() { return MONTHS[NOW.getMonth()]; }

  /* ---------------- 工具 ---------------- */
  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function fbmMaker(seed) {
    var r = rng(seed), N = 512, v = []; for (var i = 0; i < N; i++) v.push(r());
    function n(x) { var i = Math.floor(x), f = x - i, a = v[((i % N) + N) % N], b = v[(((i + 1) % N) + N) % N], u = f * f * (3 - 2 * f); return a + (b - a) * u; }
    return function (x, oct) { var s = 0, a = 0.5, f = 1, norm = 0; for (var k = 0; k < (oct || 4); k++) { s += a * n(x * f + k * 17.3); norm += a; f *= 2.03; a *= 0.5; } return s / norm; };
  }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mixA(a, b, t) { var A = hex(a), B = hex(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
  function mix(a, b, t) { var m = mixA(a, b, t); return '#' + m.map(function (v) { var h = Math.round(v).toString(16); return h.length < 2 ? '0' + h : h; }).join(''); }
  function rgba(c, a) { var A = hex(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  /* ---------------- 色板（照真实天色调） ---------------- */
  var PAL = {
    dawn:  { sky: [[0, '#141d38'], [0.42, '#4a4a74'], [0.74, '#c98176'], [0.9, '#f2b183'], [1, '#ffdcb0']],
             sun: { x: 552, y: 206, r: 7, core: '#fff3de', glow: '#ffae78', gs: 150, ga: 0.75 },
             far: ['#6f6a90', '#9a8aa6'], mt: ['#3e4470', '#6a6b93'], lit: '#ffd9cf', shade: '#27294d', snow: '#fff0ea', snowSh: '#b3a6cb',
             haze: '#e7aa98', hills: '#2f3149', water: ['#5d5878', '#232642'], cloudLit: '#ffd6c0', cloudSh: '#7d6b93', fog: '#f0c2b4', stars: 25, fg: '#15141f' },
    day:   { sky: [[0, '#2f6fb6'], [0.5, '#6fa9dd'], [0.85, '#b7d8ef'], [1, '#e2f0f8']],
             sun: { x: 556, y: 36, r: 9, core: '#ffffff', glow: '#fff5d8', gs: 120, ga: 0.55 },
             far: ['#7f9fc0', '#a9c3db'], mt: ['#3d5f8a', '#6f8fb3'], lit: '#e9f1fb', shade: '#22395a', snow: '#fbfdff', snowSh: '#b9cce2',
             haze: '#c9dcec', hills: '#2e4a3a', water: ['#5d88b0', '#274868'], cloudLit: '#ffffff', cloudSh: '#a9bcd2', fog: '#e6f0f7', stars: 0, fg: '#1a2a20' },
    dusk:  { sky: [[0, '#1e1d3c'], [0.38, '#5b3a62'], [0.66, '#c65a4f'], [0.86, '#f39a52'], [1, '#ffc97a']],
             sun: { x: 268, y: 218, r: 11, core: '#fff0c8', glow: '#ff8a3c', gs: 190, ga: 0.9 },
             far: ['#6b4a6d', '#9a5f6a'], mt: ['#2f2a4a', '#553e5c'], lit: '#ffb99a', shade: '#1a1630', snow: '#ffd2bd', snowSh: '#9a7a9c',
             haze: '#e0826a', hills: '#221a2c', water: ['#8a4f5a', '#221a33'], cloudLit: '#ffb07f', cloudSh: '#5b3b5f', fog: '#e89a86', stars: 0, fg: '#130f1a' },
    night: { sky: [[0, '#02040b'], [0.5, '#081330'], [0.85, '#15284f'], [1, '#22375f']],
             sun: { x: 548, y: 60, r: 8.5, core: '#f5f1dc', glow: '#b9c9ea', gs: 90, ga: 0.45, moon: true },
             far: ['#17244a', '#223360'], mt: ['#101a33', '#1c2a4c'], lit: '#8ea3c8', shade: '#070b18', snow: '#b9c7e0', snowSh: '#56668c',
             haze: '#2a3d68', hills: '#070b16', water: ['#16264a', '#050912'], cloudLit: '#6d7ea6', cloudSh: '#1a2440', fog: '#50628c', stars: 240, fg: '#04060c' }
  };
  var FOLIAGE = {
    spring: ['#f7cdd8', '#eeb0c1', '#f9e2e8', '#d99aac', '#6f8f4e'],
    summer: ['#2e5a2b', '#3f7336', '#4f8a3f', '#24461f', '#5d9a47'],
    autumn: ['#b3321c', '#d45a26', '#e79a34', '#8e2416', '#c9772b', '#5e6a2e'],
    winter: ['#1f3a2e', '#28473a', '#e8eef5', '#cfd9e6', '#1a3026']
  };

  /* ---------------- 场景几何（虚拟画布 800×300，cover 裁切，底部对齐） ---------------- */
  var VW = 800, VH = 300, HY = 220, CX = 420, PEAK = 74, R = 262;
  function fujiY(x, f) {
    var dx = Math.abs(x - CX);
    if (dx > R) return HY + 2;
    var t = Math.max(0, dx - 12) / (R - 12);
    var y = HY - (HY - PEAK) * Math.pow(1 - t, 2.05);                      // 富士特有的凹形山坡
    y += (f(x * 0.045, 4) - 0.5) * 3.2 * (1 - t * 0.6);
    if (dx < 12) y += (f(x * 0.4, 2) - 0.5) * 1.6;                         // 火山口的小锯齿
    return y;
  }
  function shoreY(x, f) { return HY - 4 - Math.max(0, f(x * 0.012 + 300, 4) - 0.42) * 70 * (Math.abs(x - CX) < 150 ? 0.25 : 1); }

  function buildLayers(S) {
    var P = S.P, W = S.W, H = S.H, s = S.s, ox = S.ox, oy = S.oy, f = S.f, r = rng(S.seed);
    function tf(ctx) { ctx.setTransform(s, 0, 0, s, ox, oy); }
    var sun = P.sun, lightLeft = sun.x < CX;

    /* ---- 天空 ---- */
    var sky = canvas(W, H), g = sky.getContext('2d');
    tf(g);
    var gr = g.createLinearGradient(0, -200, 0, HY);
    P.sky.forEach(function (st) { gr.addColorStop(st[0], st[1]); });
    g.fillStyle = gr; g.fillRect(-600, -600, VW + 1200, HY + 700);
    var gl = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.gs);
    gl.addColorStop(0, rgba(sun.glow, sun.ga)); gl.addColorStop(0.25, rgba(sun.glow, sun.ga * 0.4)); gl.addColorStop(1, rgba(sun.glow, 0));
    g.fillStyle = gl; g.fillRect(sun.x - sun.gs, sun.y - sun.gs, sun.gs * 2, sun.gs * 2);
    if (sun.moon) {
      g.fillStyle = sun.core; g.beginPath(); g.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(120,130,160,.22)';                                 // 月面暗斑
      [[-2.5, -1.5, 2.2], [2.8, 1.8, 1.6], [0.5, 3.4, 1.2], [-3.2, 2.6, 1]].forEach(function (mm) { g.beginPath(); g.arc(sun.x + mm[0], sun.y + mm[1], mm[2], 0, Math.PI * 2); g.fill(); });
    } else {
      var core = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.r * 1.6);
      core.addColorStop(0, sun.core); core.addColorStop(0.6, rgba(sun.core, 0.95)); core.addColorStop(1, rgba(sun.core, 0));
      g.fillStyle = core; g.beginPath(); g.arc(sun.x, sun.y, sun.r * 1.6, 0, Math.PI * 2); g.fill();
    }

    /* ---- 山 ---- */
    var mtn = canvas(W, H), m = mtn.getContext('2d');
    tf(m);
    // 远山（大气透视：越远越淡）
    [[0, 150, 38, P.far[0]], [0.3, 178, 24, P.far[1]]].forEach(function (L) {
      m.beginPath(); m.moveTo(-300, HY + 4);
      for (var x = -300; x <= VW + 300; x += 3) m.lineTo(x, Math.min(HY + 4, L[1] + (f(x * 0.006 + L[0] * 50, 5) - 0.5) * L[2] * 2));
      m.lineTo(VW + 300, HY + 4); m.closePath();
      var g1 = m.createLinearGradient(0, L[1] - L[2], 0, HY);
      g1.addColorStop(0, L[3]); g1.addColorStop(1, mix(L[3], P.haze, 0.55));
      m.fillStyle = g1; m.fill();
    });
    // 富士主体
    var pts = [];
    for (var x = CX - R - 4; x <= CX + R + 4; x += 1.5) pts.push([x, fujiY(x, f)]);
    function fujiPath(c) { c.beginPath(); c.moveTo(pts[0][0], HY + 6); pts.forEach(function (p) { c.lineTo(p[0], p[1]); }); c.lineTo(pts[pts.length - 1][0], HY + 6); c.closePath(); }
    fujiPath(m);
    var body = m.createLinearGradient(0, PEAK, 0, HY);
    body.addColorStop(0, P.mt[0]); body.addColorStop(1, P.mt[1]);
    m.fillStyle = body; m.fill();
    m.save(); fujiPath(m); m.clip();
    // 受光 / 背光（山脊处明暗交界）
    var side = m.createLinearGradient(CX - R, 0, CX + R, 0);
    side.addColorStop(0, lightLeft ? rgba(P.lit, 0.16) : rgba(P.shade, 0.42));
    side.addColorStop(0.47, lightLeft ? rgba(P.lit, 0.06) : rgba(P.shade, 0.22));
    side.addColorStop(0.53, lightLeft ? rgba(P.shade, 0.22) : rgba(P.lit, 0.06));
    side.addColorStop(1, lightLeft ? rgba(P.shade, 0.42) : rgba(P.lit, 0.16));
    m.fillStyle = side; m.fillRect(CX - R - 10, PEAK - 10, R * 2 + 20, HY - PEAK + 20);
    // 侵蚀沟壑：从山顶放射下来
    var gullies = [];
    for (var i = 0; i < 90; i++) {
      var a = (r() - 0.5) * 2, x0 = CX + a * 16, y0 = PEAK + 4 + r() * 8;
      var x1 = CX + a * R * (0.55 + r() * 0.45), y1 = fujiY(x1, f) + 2;
      gullies.push([x0, y0, (x0 + x1) / 2 + (r() - 0.5) * 14, (y0 + y1) / 2, x1, y1, 0.35 + r() * 0.9]);
    }
    function strokeG(gq, dx, col, w) { m.lineWidth = w; m.strokeStyle = col; m.beginPath(); m.moveTo(gq[0] + dx, gq[1]); m.quadraticCurveTo(gq[2] + dx, gq[3], gq[4] + dx, gq[5]); m.stroke(); }
    gullies.forEach(function (gq) { strokeG(gq, 0, rgba(P.shade, 0.22), gq[6]); strokeG(gq, 0.7, rgba(P.lit, 0.07), gq[6] * 0.6); });
    // 山麓森林带（青木原树海一带）：雾里的深色林线
    var fol0 = FOLIAGE[S.se], darkF = S.ph === 'night' ? 0.85 : S.ph === 'dusk' ? 0.62 : S.ph === 'dawn' ? 0.55 : 0.4;
    function treeLine(x) { return 178 + (f(x * 0.05 + 5, 4) - 0.5) * 16 + (f(x * 0.5 + 9, 2) - 0.5) * 3 + Math.abs(x - CX) / R * 16; }
    m.beginPath(); m.moveTo(CX - R, HY + 6);
    for (var xt = CX - R; xt <= CX + R; xt += 1.5) m.lineTo(xt, treeLine(xt));
    m.lineTo(CX + R, HY + 6); m.closePath();
    var forest = { spring: '#3e5a35', summer: '#2c4a28', autumn: '#4a4a2c', winter: '#2a3d31' }[S.se];
    m.fillStyle = mix(forest, P.mt[1], darkF); m.globalAlpha = 0.8; m.fill(); m.globalAlpha = 1;
    m.save(); m.clip();
    for (var d1 = 0; d1 < 900; d1++) {                                       // 林冠斑点：秋天夹杂红黄
      var fx0 = CX + (r() - 0.5) * 2 * R, fy0 = treeLine(fx0) + r() * (HY - treeLine(fx0));
      var fc = S.se === 'autumn' && r() < 0.35 ? fol0[Math.floor(r() * 4)] : forest;
      m.fillStyle = rgba(mix(fc, P.mt[1], darkF), 0.5);
      m.beginPath(); m.arc(fx0, fy0, 0.5 + r() * 1.1, 0, 6.283); m.fill();
    }
    m.restore();
    // 山体细颗粒（岩屑、植被斑点）
    for (var d0 = 0; d0 < 1800; d0++) {
      var dx0 = CX + (r() - 0.5) * 2 * R, dy0 = fujiY(dx0, f) + r() * (HY - fujiY(dx0, f));
      m.fillStyle = r() < 0.5 ? rgba(P.shade, 0.12) : rgba(P.lit, 0.06);
      m.fillRect(dx0, dy0, 0.6 + r() * 0.8, 0.6 + r() * 0.8);
    }
    // 积雪：雪线随季节变化，边缘碎；雪顺着沟壑往下流成细长雪沟，越往下越细
    var snowLine = { winter: 150, spring: 128, autumn: 116, summer: 98 }[S.se];
    function snowB(x) {
      return snowLine + (f(x * 0.07 + 91, 4) - 0.5) * 12 + (f(x * 0.55 + 7, 3) - 0.5) * 6 - Math.abs(x - CX) / R * 42;
    }
    m.save();
    m.beginPath(); m.moveTo(CX - R, PEAK - 20);
    for (var xs = CX - R; xs <= CX + R; xs += 0.75) m.lineTo(xs, snowB(xs));
    m.lineTo(CX + R, PEAK - 20); m.closePath(); m.clip();
    var sn = m.createLinearGradient(CX - 90, 0, CX + 90, 0);
    sn.addColorStop(0, lightLeft ? P.snow : P.snowSh); sn.addColorStop(0.48, lightLeft ? P.snow : mix(P.snowSh, P.snow, 0.5));
    sn.addColorStop(0.52, lightLeft ? mix(P.snowSh, P.snow, 0.5) : P.snow); sn.addColorStop(1, lightLeft ? P.snowSh : P.snow);
    m.fillStyle = sn; m.fillRect(CX - R, PEAK - 20, R * 2, HY);
    gullies.forEach(function (gq) { strokeG(gq, 0, rgba(P.snowSh, 0.35), gq[6] * 0.7); });   // 雪面上露出的岩脊
    m.restore();
    m.lineCap = 'round';
    gullies.forEach(function (gq, gi) {
      var len = 0.08 + r() * (S.se === 'summer' ? 0.12 : 0.3), w0 = 0.6 + r() * 1.6;
      var col = gq[4] < CX === lightLeft ? P.snow : mix(P.snowSh, P.snow, 0.35);
      var prev = null;
      for (var k = 0; k <= 24; k++) {
        var tt = k / 24, px = (1 - tt) * (1 - tt) * gq[0] + 2 * (1 - tt) * tt * gq[2] + tt * tt * gq[4];
        var py = (1 - tt) * (1 - tt) * gq[1] + 2 * (1 - tt) * tt * gq[3] + tt * tt * gq[5];
        var below = py - snowB(px);
        if (below > 0) {
          var frac = below / (len * (HY - snowLine) + 1);
          if (frac > 1) break;
          if (prev) { m.strokeStyle = rgba(col, 0.9 - frac * 0.5); m.lineWidth = w0 * (1 - frac * 0.85); m.beginPath(); m.moveTo(prev[0], prev[1]); m.lineTo(px, py); m.stroke(); }
        }
        prev = [px, py];
      }
    });
    m.lineCap = 'butt';
    // 山脚雾霭
    var hz = m.createLinearGradient(0, 150, 0, HY + 2);
    hz.addColorStop(0, rgba(P.haze, 0)); hz.addColorStop(1, rgba(P.haze, 0.62));
    m.fillStyle = hz; m.fillRect(CX - R - 10, 140, R * 2 + 20, HY - 138);
    m.restore();
    // 湖对岸的山丘 + 树冠纹理
    m.beginPath(); m.moveTo(-300, HY + 3);
    for (var xh = -300; xh <= VW + 300; xh += 2) m.lineTo(xh, shoreY(xh, f));
    m.lineTo(VW + 300, HY + 3); m.closePath();
    var hg = m.createLinearGradient(0, HY - 30, 0, HY);
    hg.addColorStop(0, mix(P.hills, P.haze, 0.35)); hg.addColorStop(1, mix(P.hills, P.haze, 0.15));
    m.fillStyle = hg; m.fill();
    var fol = FOLIAGE[S.se], dimF = S.ph === 'night' ? 0.8 : S.ph === 'dusk' ? 0.6 : 0.42;
    m.globalAlpha = 0.55;
    for (var k = 0; k < 520; k++) {
      var tx = -300 + r() * (VW + 600), top = shoreY(tx, f), ty = top + r() * (HY - top);
      m.fillStyle = mix(fol[k % fol.length], P.hills, dimF);
      m.beginPath(); m.arc(tx, ty, 0.8 + r() * 1.6, 0, Math.PI * 2); m.fill();
    }
    m.globalAlpha = 1;

    /* ---- 前景：山丘 + 五重塔 + 树（倒影里不出现） ---- */
    var fg = canvas(W, H), q = fg.getContext('2d');
    tf(q);
    function hillY(x) { return 302 - 102 * Math.exp(-Math.pow((x - 222) / 118, 2)) - (f(x * 0.03 + 700, 3) - 0.5) * 6; }
    q.beginPath(); q.moveTo(-300, VH + 5);
    for (var xf = -300; xf <= 420; xf += 2) q.lineTo(xf, Math.min(VH + 5, hillY(xf)));
    q.lineTo(420, VH + 5); q.closePath();
    var fgg = q.createLinearGradient(0, 180, 0, VH);
    fgg.addColorStop(0, mix(P.fg, P.hills, 0.3)); fgg.addColorStop(1, P.fg);
    q.fillStyle = fgg; q.fill();
    q.beginPath(); q.moveTo(VW + 300, VH + 5);
    for (var xr = VW + 300; xr >= 600; xr -= 2) q.lineTo(xr, 262 - Math.pow(Math.min(xr - 600, 260) / 200, 1.6) * 30 + (f(xr * 0.04 + 40, 3) - 0.5) * 6);
    q.lineTo(600, VH + 5); q.closePath(); q.fillStyle = P.fg; q.fill();

    var dark = S.ph === 'night' ? 0.82 : S.ph === 'dusk' ? 0.55 : S.ph === 'dawn' ? 0.45 : 0.22;
    function tree(cx, cy, rad, seed) {
      var tr = rng(seed);
      if (S.se === 'winter') {                                              // 冬：针叶树 + 积雪
        for (var lv = 0; lv < 5; lv++) {
          var wv = rad * (1 - lv * 0.17), yv = cy + rad * 0.9 - lv * rad * 0.42;
          q.fillStyle = mix('#1d3a2c', P.fg, dark); q.beginPath(); q.moveTo(cx - wv, yv); q.lineTo(cx, yv - rad * 0.62); q.lineTo(cx + wv, yv); q.closePath(); q.fill();
          q.fillStyle = mix('#eef3f8', P.snowSh, dark * 0.6); q.beginPath(); q.moveTo(cx - wv * 0.55, yv - rad * 0.28); q.lineTo(cx, yv - rad * 0.62); q.lineTo(cx + wv * 0.4, yv - rad * 0.3); q.closePath(); q.fill();
        }
        return;
      }
      q.fillStyle = mix('#2a1c14', P.fg, 0.4); q.fillRect(cx - rad * 0.06, cy, rad * 0.12, rad * 0.9);
      // 树冠：先铺一层暗色底，再撒上千片细叶（顶部受光、背光面偏暗），边缘不规则
      var lobes = [];
      for (var lb = 0; lb < 6; lb++) { var la = tr() * 6.283, lr = rad * (0.35 + tr() * 0.4); lobes.push([cx + Math.cos(la) * lr, cy + Math.sin(la) * lr * 0.6, rad * (0.45 + tr() * 0.25)]); }
      q.fillStyle = mix(fol[0], P.fg, Math.min(0.95, dark + 0.45));
      lobes.forEach(function (l) { q.beginPath(); q.ellipse(l[0], l[1], l[2], l[2] * 0.8, 0, 0, 6.283); q.fill(); });
      for (var b = 0; b < 260; b++) {
        var lo = lobes[Math.floor(tr() * lobes.length)], ang = tr() * 6.283, rr = Math.sqrt(tr()) * lo[2];
        var bx = lo[0] + Math.cos(ang) * rr, by = lo[1] + Math.sin(ang) * rr * 0.8;
        var lit = 1 - (by - (cy - rad)) / (rad * 1.6) + (lightLeft ? (cx - bx) : (bx - cx)) / rad * 0.3;
        q.fillStyle = mix(fol[Math.floor(tr() * (fol.length - 1))], P.fg, Math.max(0, Math.min(0.94, dark + (1 - lit) * 0.45)));
        q.beginPath(); q.ellipse(bx, by, rad * (0.035 + tr() * 0.05), rad * (0.025 + tr() * 0.035), tr() * 3.14, 0, 6.283); q.fill();
      }
    }
    function pagoda(cx, base) {                                             // 新仓山浅间公园 忠霊塔
      var red = S.ph === 'night' ? '#4a1f1c' : S.ph === 'dusk' ? '#8a2e22' : '#b7412c';
      var roof = S.ph === 'night' ? '#05070d' : '#1e1a1c', y = base;
      q.fillStyle = mix('#5a524c', P.fg, 0.5); q.fillRect(cx - 17, y - 3, 34, 3);
      y -= 3;
      for (var lv = 0; lv < 5; lv++) {
        var w = 15.5 - lv * 1.9, bw = w * 0.74, bh = 7.2 - lv * 0.35;
        q.fillStyle = red; q.fillRect(cx - bw / 2, y - bh, bw, bh);
        q.fillStyle = 'rgba(0,0,0,.28)'; q.fillRect(cx + (lightLeft ? 0 : -bw / 2), y - bh, bw / 2, bh);
        q.fillStyle = 'rgba(255,230,200,.18)';
        for (var c2 = -1; c2 <= 1; c2++) q.fillRect(cx + c2 * bw * 0.28 - 0.4, y - bh + 1.4, 0.8, bh - 2.4);
        var y0 = y - bh;
        q.fillStyle = roof; q.beginPath();
        q.moveTo(cx - w - 1.2, y0 - 1.6);
        q.quadraticCurveTo(cx - w * 0.7, y0 - 0.2, cx - w * 0.45, y0 - 3.4);
        q.lineTo(cx + w * 0.45, y0 - 3.4);
        q.quadraticCurveTo(cx + w * 0.7, y0 - 0.2, cx + w + 1.2, y0 - 1.6);
        q.lineTo(cx + w * 0.8, y0 + 0.9); q.lineTo(cx - w * 0.8, y0 + 0.9); q.closePath(); q.fill();
        y = y0 - 3.4;
      }
      q.strokeStyle = roof; q.lineWidth = 0.9; q.beginPath(); q.moveTo(cx, y); q.lineTo(cx, y - 15); q.stroke();
      for (var k2 = 0; k2 < 6; k2++) { q.fillStyle = roof; q.fillRect(cx - 1.6, y - 3 - k2 * 1.9, 3.2, 0.7); }
      if (S.ph === 'night') { q.fillStyle = 'rgba(255,200,120,.75)'; q.fillRect(cx - 2, base - 9, 4, 3); q.fillRect(cx - 1.6, base - 22, 3.2, 2.4); }
    }
    function onHill(x, rad) { return hillY(x) - rad * 0.35; }
    [[150, 13], [178, 12], [204, 11], [292, 12], [318, 13]].forEach(function (t, i) { tree(t[0], onHill(t[0], t[1]), t[1], 100 + i); });
    pagoda(247, hillY(247) + 2);
    [[120, 18], [160, 17], [338, 16], [364, 18], [96, 20], [270, 14]].forEach(function (t, i) { tree(t[0], onHill(t[0], t[1]) + 10, t[1], 200 + i); });
    [[640, 258, 14], [676, 250, 18], [720, 244, 20], [768, 242, 22], [814, 244, 22]].forEach(function (t, i) { tree(t[0], t[1], t[2], 300 + i); });

    /* ---- 暗角 ---- */
    var ov = canvas(W, H), o = ov.getContext('2d');
    var vg = o.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (S.ph === 'day' ? 0.16 : 0.3) + ')');
    o.fillStyle = vg; o.fillRect(0, 0, W, H);

    /* ---- 倒影源 = 天空 + 山 ---- */
    var up = canvas(W, H), u = up.getContext('2d');
    u.drawImage(sky, 0, 0); u.drawImage(mtn, 0, 0);
    return { sky: sky, mtn: mtn, fg: fg, ov: ov, up: up };
  }

  /* 云朵：许多柔边圆堆出体积，底部阴影、顶部受光 */
  function cloudSprite(w, h, seed, lit, sh, scale) {
    var c = canvas(w * scale, h * scale), g = c.getContext('2d'), r = rng(seed);
    g.scale(scale, scale);
    var puffs = [];
    for (var i = 0; i < 26; i++) {
      var t = r(), bump = Math.sin(t * Math.PI);
      puffs.push([w * (0.12 + t * 0.76), h * (0.62 - bump * 0.3 * r() - 0.05), h * (0.16 + bump * 0.22 * (0.6 + r() * 0.6))]);
    }
    function blob(x, y, rad, col, a) {
      var gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.55, rgba(col, a * 0.7)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    puffs.forEach(function (p) { blob(p[0], p[1] + p[2] * 0.25, p[2] * 1.05, sh, 0.55); });
    puffs.forEach(function (p) { blob(p[0], p[1] - p[2] * 0.15, p[2] * 0.85, lit, 0.6); });
    return c;
  }
  function lenticular(w, h, lit, sh, scale) {                             // 笠云：几层叠起来的透镜状云
    var c = canvas(w * scale, h * scale), g = c.getContext('2d');
    g.scale(scale, scale);
    [[0.5, 0.62, 0.46, 0.2, sh, 0.5], [0.5, 0.5, 0.42, 0.18, lit, 0.7], [0.52, 0.34, 0.3, 0.13, lit, 0.55]].forEach(function (e) {
      g.save(); g.translate(w * e[0], h * e[1]); g.scale(e[2] * w / (e[3] * h), 1);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, e[3] * h * 1.4);
      gr.addColorStop(0, rgba(e[4], e[5])); gr.addColorStop(0.6, rgba(e[4], e[5] * 0.6)); gr.addColorStop(1, rgba(e[4], 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, e[3] * h * 1.4, 0, 6.283); g.fill(); g.restore();
    });
    return c;
  }
  function mistSprite(w, h, col) {
    var c = canvas(w, h), g = c.getContext('2d');
    g.translate(w / 2, h / 2); g.scale(w / h, 1);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, h / 2);
    gr.addColorStop(0, rgba(col, 0.55)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(-h / 2, -h / 2, h, h);
    return c;
  }
  var LEAF = null;
  function leafPath() {
    if (LEAF || typeof Path2D === 'undefined') return LEAF;
    LEAF = new Path2D('M0 -10 L2.2 -4.6 L7 -7.2 L5.4 -2.2 L10 -1.2 L6 1.8 L7.6 5.2 L2.6 4 L0.8 9 L0 5.2 L-0.8 9 L-2.6 4 L-7.6 5.2 L-6 1.8 L-10 -1.2 L-5.4 -2.2 L-7 -7.2 L-2.2 -4.6 Z');
    return LEAF;
  }

  /* ================================================================
     光追渲染（WebGL）：地形用光线步进求交 + 软阴影 + 天空环境光 + 大气散射/空气透视
     静态光照只算一次存进纹理；每帧只算会动的：云、星、湖面波浪反射（菲涅尔）、日月高光、湖雾、丁达尔光束
     ================================================================ */
  var RTP = {
    day:   { zen: [0.16, 0.36, 0.72], hor: [0.66, 0.80, 0.93], sun: [1.55, 1.45, 1.30], fog: [0.64, 0.75, 0.86], light: [-0.78, 0.42, -0.2],
             disk: [556, 36], diskCol: [3, 2.9, 2.6], diskOn: 0, night: 0, cloud: 0.55, god: 0 },
    dawn:  { zen: [0.09, 0.10, 0.24], hor: [1.15, 0.62, 0.42], sun: [1.70, 0.82, 0.52], fog: [0.78, 0.56, 0.52], light: [0.85, 0.12, -0.5],
             disk: [560, 160], diskCol: [2.0, 1.4, 0.95], diskOn: 1, night: 0, cloud: 0.5, god: 0.5 },
    dusk:  { zen: [0.11, 0.07, 0.20], hor: [1.35, 0.55, 0.24], sun: [1.90, 0.76, 0.34], fog: [0.72, 0.42, 0.30], light: null,
             disk: [262, 163], diskCol: [2.3, 1.45, 0.75], diskOn: 1, night: 0, cloud: 0.5, god: 0.6 },
    night: { zen: [0.008, 0.014, 0.04], hor: [0.05, 0.08, 0.16], sun: [0.34, 0.4, 0.55], fog: [0.06, 0.085, 0.15], light: [0.45, 0.5, -0.35],
             disk: [548, 36], diskCol: [1.3, 1.3, 1.25], diskOn: 1, night: 1, cloud: 0.25, god: 0.12 }
  };
  var HYG = 170;                                                          // 光追画面的地平线（虚拟坐标）
  var RT_FOL = { spring: [0.20, 0.24, 0.14], summer: [0.07, 0.17, 0.06], autumn: [0.34, 0.15, 0.06], winter: [0.09, 0.12, 0.09] };
  var RT_SNOW = { winter: 0.8, spring: 1.4, autumn: 2.05, summer: 2.7 };
  var GLSL_COMMON = [
    'precision highp float;',
    'uniform vec2 uRes; uniform vec3 uMap; uniform float uTime;',
    'uniform vec3 uZen, uHor, uSunCol, uFog, uL, uDisk, uDiskCol, uFol;',
    'uniform vec4 uP; uniform vec4 uQ;',                                   // x 夜晚 y 雪线 z 云量 w 是否显示日/月
    'const float K = 0.14 / 150.0;',
    'const vec2 FC = vec2(0.0, 26.0);',
    'const float HZ = 170.0;',
    'float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);',
    'float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = M2 * p; a *= 0.5; } return s / 0.875; }',
    'float fbm5(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = M2 * p; a *= 0.5; } return s / 0.96875; }',
    'vec3 tone(vec3 c){ c *= 0.92; c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114)); return clamp(mix(vec3(l), c, 1.1), 0.0, 1.0); }',
    'vec3 rayDir(vec2 fc){ float vx = (fc.x - uMap.y) / uMap.x; float vy = ((uRes.y - fc.y) - uMap.z) / uMap.x;',
    '  return normalize(vec3((vx - 400.0) * K, (HZ - vy) * K, 1.0)); }',
    /* 天空：瑞利渐变 + 米氏光晕 + 日/月盘 + 星空 + 体积感的云（向光方向再采样一次得到明暗） */
    'vec3 sky(vec3 rd){',
    '  float y = max(rd.y, 0.0);',
    '  vec3 col = mix(uHor, uZen, pow(smoothstep(0.0, 0.4, y), 0.7));',
    '  float ld = max(dot(rd, uL), 0.0), sd = max(dot(rd, uDisk), 0.0);',
    '  col += uSunCol * (0.12 * pow(ld, 5.0) + 0.35 * pow(ld, 60.0)) * (1.0 - uP.x * 0.6);',
    '  col += uDiskCol * uP.w * (0.05 * pow(sd, 16.0) + 0.2 * pow(sd, 260.0)) * (1.0 - uP.x * 0.75);',
    '  col += uDiskCol * uP.w * smoothstep(mix(0.99990, 0.999965, uP.x), mix(0.99996, 0.99999, uP.x), sd) * 3.0;',
    '  if (uP.x > 0.5) { vec2 sp = rd.xy / (1.0 + rd.z) * 260.0; vec2 id = floor(sp); float h = hash(id);',
    '    if (h > 0.982) { vec2 f = fract(sp) - 0.5; float tw = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 80.0);',
    '      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.22, 0.0, length(f)) * tw * 1.5 * smoothstep(0.0, 0.08, y); } }',
    '  if (rd.y > 0.003) {',
    '    float tc = 2.4 / rd.y; vec2 cp = rd.xz * tc * 0.045 + vec2(uTime * 0.004, uTime * 0.0015);',
    '    vec2 wq = vec2(fbm3(cp * 0.7), fbm3(cp * 0.7 + 5.2));',                // 扭曲坐标，云形更自然
    '    float c = fbm5(cp + wq * 1.2);',
    '    float cov = smoothstep(0.6, 0.86, c + uP.z * 0.1 - 0.06) * smoothstep(0.6, 0.18, y) * smoothstep(0.004, 0.035, y);',
    '    float c2 = fbm5(cp + wq * 1.2 + uL.xz * 0.06);',                      // 朝光源再采样一次：云的明暗
    '    float lit = clamp((c - c2) * 5.0 + 0.5, 0.0, 1.0);',
    '    vec3 cc = mix(uHor * 0.55 + uZen * 0.2, uSunCol * 1.15 + uHor * 0.35, lit);',
    '    cc += uSunCol * pow(ld, 8.0) * 0.8 * (1.0 - cov);',                    // 靠近太阳的云边发亮
    '    col = mix(col, cc, cov * exp(-tc * 0.005) * 0.9);',
    '  }',
    '  return col;',
    '}'
  ].join('\n');
  var GLSL_STATIC = GLSL_COMMON + '\n' + [
    'float fujiBase(vec2 p){ float r = length(p - FC); float rim = 2.92 + (noise(p * 5.0) - 0.5) * 0.04; return min(3.1 * exp(-r / 5.0) - 0.06, rim); }',
    'float ridged(vec2 q){ return 1.0 - abs(noise(q) * 2.0 - 1.0); }',
    /* 放射状侵蚀沟：三层粗细叠加，1 = 山脊，0 = 沟底 */
    'float gully(vec2 p){ vec2 d = p - FC; float r = max(length(d), 1e-3); vec2 dir = d / r;',
    '  vec2 w = vec2(noise(p * 0.45), noise(p * 0.45 + 7.1)) * 0.7;',
    '  return ridged(dir * 14.0 + w) * 0.6 + ridged(dir * 33.0 + w * 2.2) * 0.3 + ridged(dir * 70.0 + w * 3.0) * 0.1; }',
    'float fujiDetail(vec2 p){ float r = length(p - FC);',
    '  return (gully(p) - 0.62) * 0.08 * smoothstep(0.25, 1.4, r) * exp(-r / 5.5) + (fbm3(p * 3.0) - 0.5) * 0.03 * exp(-r / 8.0); }',
    'float hills(vec2 p){ return fbm3(p * 0.22) * 0.42 + fbm3(p * 0.9 + 3.0) * 0.04 - 0.1; }',
    'float lakeM(vec2 p){ vec2 q = p - vec2(0.0, 4.2); q.x *= 0.26; return smoothstep(4.8, 6.2, length(q)); }',
    /* 近处湖岸的小山（左下角），上面是一棵棵树冠 */
    'float nearHill(vec2 p){ vec2 q = (p - vec2(-0.5, 1.35)) * vec2(0.8, 2.6); return 0.085 * exp(-dot(q, q) * 2.2) - 0.012; }',
    'vec3 cell(vec2 p){ vec2 c = p * 55.0, i = floor(c), f = fract(c); float m = 8.0; vec2 id = i;',
    '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y));',
    '    vec2 rr = o + vec2(hash(i + o), hash(i + o + 3.7)) * 0.9 - f; float dd = dot(rr, rr); if (dd < m) { m = dd; id = i + o; } }',
    '  return vec3(sqrt(m), id); }',
    'float canopy(vec2 p){ vec3 c = cell(p); return (1.0 - smoothstep(0.0, 0.8, c.x)) * 0.008 * (0.6 + 0.8 * hash(c.yz)); }',
    'float Hlo(vec2 p){ return mix(-0.05, max(fujiBase(p), hills(p)), lakeM(p)); }',
    'float Hhi(vec2 p){ return mix(-0.05, max(fujiBase(p) + fujiDetail(p), hills(p) + (fbm3(p * 5.0) - 0.5) * 0.012), lakeM(p)); }',
    /* 软阴影：朝光源再走一条射线，离地面越近越暗 */
    'float shadow(vec3 ro, vec3 rd){ float res = 1.0, t = 0.02;',
    '  for (int i = 0; i < 48; i++) { vec3 p = ro + rd * t; float h = p.y - Hlo(p.xz); res = min(res, 12.0 * h / t);',
    '    if (res < 0.002) break; t += clamp(h * 0.6, 0.015, 0.7); if (t > 30.0) break; }',
    '  return clamp(res, 0.0, 1.0); }',
    'vec3 treeCol(float h){',
    '  if (uQ.x < 0.5) return h < 0.62 ? mix(vec3(0.92, 0.66, 0.74), vec3(0.98, 0.84, 0.88), h / 0.62) : vec3(0.22, 0.33, 0.16);',   // 春：樱花
    '  if (uQ.x < 1.5) return mix(vec3(0.08, 0.2, 0.06), vec3(0.2, 0.36, 0.12), h);',
    '  if (uQ.x < 2.5) return h < 0.3 ? vec3(0.62, 0.1, 0.04) : h < 0.55 ? vec3(0.82, 0.34, 0.07) : h < 0.78 ? vec3(0.86, 0.6, 0.14) : vec3(0.2, 0.3, 0.12);',  // 秋：红叶/黄叶/常绿
    '  return h < 0.55 ? vec3(0.09, 0.15, 0.11) : vec3(0.86, 0.9, 0.95); }',    // 冬：针叶 + 积雪
    'vec3 shade(vec3 p, vec3 n, vec3 rd){',
    '  vec3 alb; float ao = 1.0, snow = 0.0;',
    '  {',
    '    float g = gully(p.xz); ao = mix(0.78, 1.0, g);',
    '    vec2 d = p.xz - FC; vec2 dir = d / max(length(d), 1e-3);',
    '    float sl = uP.y + (fbm3(p.xz * 1.8) - 0.5) * 0.45 - (1.0 - g) * 0.42 * (0.4 + 1.2 * noise(dir * 9.0 + 3.0)) - (fbm3(p.xz * 7.0) - 0.5) * 0.18;',  // 雪顺沟下流，细纹
    '    snow = smoothstep(sl - 0.09, sl + 0.07, p.y) * smoothstep(0.2, 0.55, n.y);',
    '    vec3 rock = mix(vec3(0.26, 0.17, 0.14), vec3(0.4, 0.28, 0.22), fbm3(p.xz * 4.0) * 0.6 + noise(dir * 60.0) * 0.4) * mix(0.75, 1.0, g);',
    '    float forest = smoothstep(1.35, 0.95, p.y + (fbm3(p.xz * 2.0) - 0.5) * 0.25) * smoothstep(0.3, 0.6, n.y);',
    '    vec3 fol = mix(vec3(0.045, 0.075, 0.05), treeCol(fbm3(p.xz * 2.0)) * 0.22, uQ.x > 1.5 && uQ.x < 2.5 ? 0.3 : 0.12) * (0.85 + 0.3 * fbm3(p.xz * 3.0));',
    '    alb = mix(mix(rock, fol, forest), vec3(0.93, 0.95, 0.98), snow);',
    '  }',
    '  float dif = max(dot(n, uL), 0.0);',
    '  float sh = dif > 0.0 ? shadow(p + n * 0.003, uL) : 0.0;',
    '  vec3 amb = mix(uHor * 0.9, uZen * 1.1, 0.5 + 0.5 * n.y);',
    '  vec3 col = alb * (uSunCol * dif * sh * 1.9 + amb * 0.38 * ao);',
    '  col += alb * uFog * 0.08 * (1.0 - n.y) * ao;',                                   // 湖面反射上来的补光
    '  col += uSunCol * pow(max(dot(reflect(rd, n), uL), 0.0), 28.0) * snow * sh * 0.4;',   // 雪面高光
    '  col += snow * uZen * 0.12 * (1.0 - sh) * ao;',                                    // 阴影里的雪偏蓝
    '  return col;',
    '}',
    'void main(){',
    '  vec3 rd = rayDir(gl_FragCoord.xy), ro = vec3(0.0, 0.035, 0.0);',
    '  float tmax = rd.y < 0.0 ? min(-ro.y / rd.y, 80.0) : 80.0;',
    '  float t = 0.05, lt = 0.05; bool hit = false;',
    '  for (int i = 0; i < 200; i++) { vec3 p = ro + rd * t; float h = p.y - Hlo(p.xz);',
    '    if (h < 0.0008 * t) { hit = true; break; } lt = t; t += max(h * 0.6, 0.004 * t + 0.004);',
    '    if (t > tmax) break; if (i == 199) hit = true; }',                   // 步数用完还没出界：当作打到远处地形
    '  if (hit) { for (int j = 0; j < 7; j++) { float m = 0.5 * (lt + t); vec3 pm = ro + rd * m;',   // 二分细化交点，消掉阶梯纹
    '    if (pm.y - Hlo(pm.xz) < 0.0) t = m; else lt = m; } }',
    '  if (!hit) { gl_FragColor = vec4(0.0, 0.0, 0.0, rd.y < 0.0 ? 0.5 : 0.0); return; }',
    '  vec3 p = ro + rd * t; float e = max(0.002, t * 0.0015);',
    '  vec3 n = normalize(vec3(Hhi(p.xz - vec2(e, 0.0)) - Hhi(p.xz + vec2(e, 0.0)), 2.0 * e, Hhi(p.xz - vec2(0.0, e)) - Hhi(p.xz + vec2(0.0, e))));',
    '  vec3 col = shade(p, n, rd);',
    '  float ld = max(dot(rd, uL), 0.0);',
    '  col = mix(col, uFog + uSunCol * pow(ld, 6.0) * 0.35, 1.0 - exp(-t * 0.021));',   // 空气透视
    '  gl_FragColor = vec4(tone(col), 1.0);',
    '}'
  ].join('\n');
  var GLSL_FRAME = GLSL_COMMON + '\n' + [
    'uniform sampler2D uTex; uniform vec2 uSunUV; uniform float uGod; uniform vec4 uRip[4];',
    'vec2 waves(vec2 p, float d){ vec2 g = vec2(0.0);',
    '  vec2 wp = p + (vec2(noise(p * 3.0 + uTime * 0.2), noise(p * 3.0 - uTime * 0.2)) - 0.5) * 0.4;',
    '  g += vec2(0.8, 0.6) * cos(dot(wp, vec2(0.8, 0.6)) * 23.0 + uTime * 1.6) * 0.5;',
    '  g += vec2(-0.5, 0.86) * cos(dot(wp, vec2(-0.5, 0.86)) * 37.0 + uTime * 2.1) * 0.35;',
    '  g += vec2(0.2, 0.98) * cos(dot(wp, vec2(0.2, 0.98)) * 59.0 - uTime * 2.7) * 0.25;',
    '  g += (vec2(noise(p * 9.0 + uTime * 0.5), noise(p * 9.0 - uTime * 0.4)) - 0.5) * 1.6;',
    '  g += (vec2(noise(p * 31.0 - uTime * 0.9), noise(p * 31.0 + uTime * 0.8)) - 0.5) * 0.9;',
    '  g += (vec2(noise(p * 140.0 + uTime * 1.3), noise(p * 140.0 - uTime * 1.1)) - 0.5) * 2.2 * exp(-d * 1.5);',   // 近处细碎波：日月倒影碎成一条光带
    '  return g * 0.009 / (1.0 + d * d * 0.35); }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes; vec3 rd = rayDir(gl_FragCoord.xy);',
    '  vec4 st = texture2D(uTex, uv); vec3 col;',
    '  if (st.a > 0.75) col = st.rgb;',
    '  else if (rd.y >= 0.0 || st.a < 0.25) col = tone(sky(rd));',
    '  else {',                                                               // 湖面：波浪法线 → 反射射线 → 取反射到的山/天空 → 菲涅尔混合
    '    float tw = -0.035 / rd.y; vec3 p = rd * tw;',
    '    vec2 g = waves(p.xz, tw);',
    '    for (int k = 0; k < 4; k++) { vec4 Rp = uRip[k]; if (Rp.w <= 0.0) continue; float age = uTime - Rp.z; if (age < 0.0 || age > 5.0) continue;',
    '      vec2 dv = p.xz - Rp.xy; float d = length(dv) / Rp.w, x = d - age * 0.16;',       // 点湖面 → 一圈圈涟漪往外扩
    '      g += normalize(dv + 1e-5) * cos(x * 120.0) * exp(-x * x * 300.0) * exp(-age * 0.75) * 0.8; }',
    '    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));',
    '    vec3 rr = reflect(rd, n); rr.y = max(rr.y, 0.0005);',
    '    float vx2 = 400.0 + rr.x / rr.z / K, vy2 = HZ - rr.y / rr.z / K;',
    '    vec2 uv2 = vec2(vx2 * uMap.x + uMap.y, uRes.y - (vy2 * uMap.x + uMap.z)) / uRes;',
    '    vec4 s2 = texture2D(uTex, clamp(uv2, 0.0, 1.0));',
    '    vec3 refl = (s2.a > 0.75 && uv2.y <= 1.0) ? s2.rgb : tone(sky(rr));',
    '    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);',
    '    vec3 deep = tone(uFog * 0.18 + vec3(0.01, 0.03, 0.04));',
    '    col = mix(deep, refl, clamp(fr + 0.15, 0.0, 1.0) * 0.9);',
    '    col += tone(uDiskCol * uP.w * smoothstep(0.99988, 0.99997, dot(rr, uDisk)) * 2.2 + uSunCol * pow(max(dot(rr, uL), 0.0), 900.0) * 3.0 * (1.0 - uP.x));',
    '    col = mix(col, tone(uFog), (1.0 - exp(-tw * 0.04)) * 0.5);',
    '  }',
    '  float hz = exp(-abs(rd.y) * 120.0);',                                // 贴着湖面的薄雾，慢慢流动
    '  float mn = 0.55 + 0.45 * noise(vec2(rd.x / rd.z * 40.0 + uTime * 0.08, uTime * 0.05));',
    '  col = mix(col, tone(uFog * 1.05), hz * 0.35 * mn);',
    '  if (uGod > 0.0) {',                                                   // 丁达尔光束：朝日/月方向采样，被山挡住的地方没有光
    '    vec2 dl = (uSunUV - uv) / 28.0; vec2 q = uv; float il = 0.0, dc = 1.0;',
    '    for (int i = 0; i < 28; i++) { q += dl; float a = texture2D(uTex, clamp(q, 0.0, 1.0)).a; il += (a < 0.25 ? 1.0 : 0.0) * dc; dc *= 0.965; }',
    '    il /= 28.0;',
    '    col += tone(uDiskCol) * il * il * uGod;',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

  function RT(glc, ph, se) {
    var gl = null;
    try { gl = glc.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }) || glc.getContext('experimental-webgl'); } catch (e) {}
    if (!gl) return null;
    function prog(fs) {
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console) console.warn('fuji shader:', gl.getShaderInfoLog(s)); return null; } return s; }
      var v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return null;
      var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      return p;
    }
    var pS = prog(GLSL_STATIC), pF = prog(GLSL_FRAME);
    if (!pS || !pF) return null;
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var texLo = gl.createTexture(), texHi = gl.createTexture(), fbo = gl.createFramebuffer(), cur = texLo;
    var P = RTP[ph], K = 0.14 / 150;
    function dirOf(sx, sy) { var v = [(sx - 400) * K, (HYG - sy) * K, 1], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
    var disk = dirOf(P.disk[0], P.disk[1]);
    var L = P.light ? (function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })(P.light) : disk;
    function common(p, W, H, s, ox, oy, t) {
      function u(n) { return gl.getUniformLocation(p, n); }
      gl.uniform2f(u('uRes'), W, H); gl.uniform3f(u('uMap'), s, ox, oy); gl.uniform1f(u('uTime'), t);
      gl.uniform3fv(u('uZen'), P.zen); gl.uniform3fv(u('uHor'), P.hor); gl.uniform3fv(u('uSunCol'), P.sun); gl.uniform3fv(u('uFog'), P.fog);
      gl.uniform3fv(u('uL'), L); gl.uniform3fv(u('uDisk'), disk); gl.uniform3fv(u('uDiskCol'), P.diskCol); gl.uniform3fv(u('uFol'), RT_FOL[se]);
      gl.uniform4f(u('uP'), P.night, RT_SNOW[se], P.cloud, P.diskOn);
      gl.uniform4f(u('uQ'), { spring: 0, summer: 1, autumn: 2, winter: 3 }[se], 0, 0, 0);
      return u;
    }
    var st = { gl: gl };
    function setup(tx, w, h) {
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    function render(tx, w, h, q, y0, y1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
      gl.viewport(0, 0, w, h);
      if (y0 != null) { gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, w, y1 - y0); }
      gl.useProgram(pS); common(pS, w, h, st.s * q, st.ox * q, st.oy * q, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    st.resize = function (W, H, s, ox, oy) {
      st.W = W; st.H = H; st.s = s; st.ox = ox; st.oy = oy;
      // 先用 0.3× 分辨率马上出一张预览，再按全分辨率分条慢慢补完（避免手机一次算太久卡住）
      var ql = 0.3, LW = Math.max(2, Math.round(W * ql)), LH = Math.max(2, Math.round(H * ql));
      setup(texLo, LW, LH); render(texLo, LW, LH, ql); cur = texLo;
      var qh = Math.min(1, Math.sqrt(1500000 / (W * H)));
      var HW = Math.max(2, Math.round(W * qh)), HH = Math.max(2, Math.round(H * qh));
      setup(texHi, HW, HH);
      st.pend = { w: HW, h: HH, q: qh, y: 0, step: Math.max(8, Math.ceil(HH / Math.max(1, Math.ceil(HW * HH / 110000)))) };
      if (Q.still) { while (st.pend) st.refine(); }
      var sx = ox + P.disk[0] * s, sy = oy + P.disk[1] * s;
      st.sunUV = [sx / W, 1 - sy / H];
    };
    st.refine = function () {
      var p = st.pend; if (!p) return;
      render(texHi, p.w, p.h, p.q, p.y, Math.min(p.h, p.y + p.step));
      p.y += p.step;
      if (p.y >= p.h) { st.pend = null; cur = texHi; }
    };
    var ripBuf = new Float32Array(16);
    st.frame = function (t, rips) {
      if (st.pend) st.refine();
      gl.viewport(0, 0, st.W, st.H);
      gl.useProgram(pF);
      var u = common(pF, st.W, st.H, st.s, st.ox, st.oy, t);
      ripBuf.fill(0);
      (rips || []).slice(-4).forEach(function (r, i) { ripBuf[i * 4] = r.wx; ripBuf[i * 4 + 1] = r.wz; ripBuf[i * 4 + 2] = r.t0; ripBuf[i * 4 + 3] = r.dist; });
      gl.uniform4fv(u('uRip'), ripBuf);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1i(u('uTex'), 0); gl.uniform2f(u('uSunUV'), st.sunUV[0], st.sunUV[1]); gl.uniform1f(u('uGod'), P.god);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    return st;
  }

  /* ---------------- 一个场景实例 ---------------- */
  var ALL = [];
  function Scene(host) {
    this.host = host;
    this.ph = host.getAttribute('data-phase') || phase();
    this.se = host.getAttribute('data-season') || season();
    this.P = PAL[this.ph];
    this.kind = host.getAttribute('data-fuji') || 'hero';
    this.cv = document.createElement('canvas');
    this.cv.className = 'fj-cv';
    this.cv.setAttribute('aria-hidden', 'true');
    host.insertBefore(this.cv, host.firstChild);
    host.classList.add('fj-' + this.ph, 'fj-' + this.se);
    if (Q.rt !== '0') {                                                     // 优先用光追；不支持 WebGL 就退回 Canvas 版
      var glc = document.createElement('canvas');
      glc.className = 'fj-gl'; glc.setAttribute('aria-hidden', 'true');
      host.insertBefore(glc, host.firstChild);
      this.glc = glc; this.rt = RT(glc, this.ph, this.se);
      if (!this.rt) { host.removeChild(glc); this.glc = null; }
      else host.classList.add('fj-rt');
    }
    this.t0 = performance.now(); this.visible = true;
    this.rips = []; this.gust = 0; this.shoot = null;
    this.bind();
    this.resize();
  }
  /* ---- 交互：点一下 → 落叶/花瓣炸开 + 光点；点湖面 → 涟漪；手指划过 → 带起一阵风 ---- */
  Scene.prototype.bind = function () {
    var self = this, host = this.host, last = null;
    function pos(e) { var r = host.getBoundingClientRect(); return [(e.clientX - r.left) * self.dpr, (e.clientY - r.top) * self.dpr, performance.now()]; }
    host.addEventListener('pointerdown', function (e) {
      var p = pos(e); last = p;
      if (!self.dpr) return;
      if (p[1] > self.HYd + 2) self.ripple(p[0], p[1]);
      self.burst(p[0], p[1], p[1] > self.HYd + 2);
      if (!running) self.draw(self.lastT || 0);
    }, { passive: true });
    host.addEventListener('pointermove', function (e) {
      var p = pos(e);
      if (last) {
        var dt = Math.max(8, p[2] - last[2]) / 1000, vx = (p[0] - last[0]) / dt, vy = (p[1] - last[1]) / dt;
        self.gust = Math.max(-260, Math.min(260, self.gust * 0.6 + vx * 0.12));
        self.parts.forEach(function (q) {                                    // 手指附近的粒子被推开
          var dx = q.x - p[0], dy = q.y - p[1], d2 = dx * dx + dy * dy, rr = 70 * self.dpr;
          if (d2 < rr * rr) { var k = (1 - Math.sqrt(d2) / rr); q.ix = (q.ix || 0) + vx * 0.25 * k; q.iy = (q.iy || 0) + vy * 0.25 * k; }
        });
      }
      last = p;
    }, { passive: true });
    host.addEventListener('pointerleave', function () { last = null; }, { passive: true });
  };
  Scene.prototype.ripple = function (x, y) {
    var t = this.lastT || 0, vx = (x - this.ox) / this.s, vy = (y - this.oy) / this.s, K = 0.14 / 150;
    var d = [(vx - 400) * K, ((this.rt ? HYG : HY) - vy) * K, 1], l = Math.hypot(d[0], d[1], d[2]);
    d = [d[0] / l, d[1] / l, d[2] / l];
    if (d[1] >= -0.0005) return;
    var tw = -0.035 / d[1];
    this.rips.push({ wx: d[0] * tw, wz: d[2] * tw, dist: tw, t0: t, x: x, y: y });
    if (this.rips.length > 4) this.rips.shift();
  };
  Scene.prototype.burst = function (x, y, water) {
    var n = water ? 6 : 14;
    for (var i = 0; i < n; i++) {
      var q = this.spawn(false), a = Math.random() * 6.283, sp = (60 + Math.random() * 160) * this.dpr;
      if (q.k === 'fly' || q.k === 'seed') q.k = 'mote';
      q.tmp = true; q.x = x; q.y = y; q.ix = Math.cos(a) * sp; q.iy = Math.sin(a) * sp - 40 * this.dpr; q.z = 0.7 + Math.random() * 0.6;
      this.parts.push(q);
    }
    for (var j = 0; j < 12; j++) {                                          // 光点
      var b = Math.random() * 6.283, v = (30 + Math.random() * 120) * this.dpr;
      this.parts.push({ k: 'spark', x: x, y: y, ix: Math.cos(b) * v, iy: Math.sin(b) * v, life: 0.7 + Math.random() * 0.8, age: 0, z: 1, size: (1 + Math.random() * 2) * this.dpr });
    }
    var cap = (this.kind === 'banner' ? 14 : 34) + 16 + 60;
    if (this.parts.length > cap) this.parts.splice(0, this.parts.length - cap);
  };
  Scene.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = this.host.clientWidth || 390, ch = this.host.clientHeight || 300;
    var W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (this.W === W && this.H === H) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = W; this.cv.height = H;
    var head = this.kind === 'hero' ? (this.rt ? 150 : 78) : 0;                              // 顶部多留一截天空放标题文字
    var s = Math.max(W / VW, H / (VH + head));
    this.s = s; this.ox = (W - VW * s) / 2; this.oy = H - VH * s;
    if (this.rt) { this.glc.width = W; this.glc.height = H; this.rt.resize(W, H, s, this.ox, this.oy); }
    this.f = fbmMaker(11);
    this.L = buildLayers({ P: this.P, W: W, H: H, s: s, ox: this.ox, oy: this.oy, f: this.f, seed: 29, se: this.se, ph: this.ph });
    this.HYd = Math.round(this.oy + (this.rt ? HYG : HY) * s);
    var P = this.P, r = rng(77);
    this.clouds = [];
    var nc = this.ph === 'night' ? 2 : 4;
    for (var i = 0; i < nc; i++) {
      var cw2 = 150 + r() * 120, chh = 40 + r() * 26;
      this.clouds.push({ img: cloudSprite(cw2, chh, 300 + i, P.cloudLit, P.cloudSh, s), x: r() * VW, y: 20 + r() * 90, w: cw2,
                         v: (1.2 + r() * 1.6) * (i % 2 ? 1 : 0.7), a: this.ph === 'night' ? 0.35 : 0.85 });
    }
    this.cap = lenticular(120, 20, P.cloudLit, P.cloudSh, s);                  // 山顶的笠云
    this.mist = mistSprite(Math.round(400 * s), Math.max(4, Math.round(24 * s)), P.fog);
    this.stars = [];
    for (var k = 0; k < P.stars; k++) this.stars.push([r() * VW, r() * (HY - 40) - 60, 0.25 + r() * 0.8, r() * 6.28, 0.6 + r() * 2.2]);
    this.birds = [];
    if (this.ph !== 'night') for (var b = 0; b < 5; b++) this.birds.push([560 + b * 14 + r() * 8, 50 + r() * 22 + b * 3, r() * 6.28, 0.8 + r() * 0.4]);
    this.parts = [];
    var n = this.kind === 'banner' ? 14 : 34;
    for (var p = 0; p < n; p++) this.parts.push(this.spawn(true));
    var nm = this.ph === 'night' ? 0 : (this.kind === 'banner' ? 5 : 12);          // 光里漂浮的微尘
    for (var p2 = 0; p2 < nm; p2++) { var mo = this.spawn(true); mo.k = 'mote'; mo.vy = -2 * this.dpr; mo.size = (0.8 + Math.random() * 1.6) * this.dpr; this.parts.push(mo); }
    this.lastT = 0; this.dt = 0;
    this.draw(0);
  };
  Scene.prototype.spawn = function (anywhere) {
    var r = Math.random, W = this.W, H = this.H, z = 0.4 + r() * 0.9;
    var kind = this.se === 'spring' ? 'petal' : this.se === 'autumn' ? 'leaf' : this.se === 'winter' ? 'snow' : (this.ph === 'night' || this.ph === 'dusk') ? 'fly' : 'seed';
    var cols = kind === 'leaf' ? FOLIAGE.autumn.slice(0, 5) : ['#ffe3ea', '#f8c7d4', '#fbd9e2'];
    return { k: kind, z: z, x: anywhere ? r() * W : -20, y: anywhere ? r() * H : -20,
             vy: (kind === 'snow' ? 14 : kind === 'fly' ? 0 : kind === 'seed' ? 3 : 20) * z * this.dpr,
             rot: r() * 6.28, vr: (r() - 0.5) * 1.6, flip: r() * 6.28, vf: 1.5 + r() * 3, sway: r() * 6.28,
             size: (kind === 'leaf' ? 0.75 : kind === 'petal' ? 3.4 : 1.6) * z * this.dpr,
             col: cols[Math.floor(r() * cols.length)], ph: r() * 6.28 };
  };
  Scene.prototype.draw = function (t) {
    var c = this.cv.getContext('2d'), L = this.L, W = this.W, H = this.H, s = this.s, ox = this.ox, oy = this.oy, P = this.P;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.rt) {                                                          // 光追模式：背景交给 WebGL，这层只画前景、落叶和暗角
      this.rt.frame(t, this.rips);
      c.clearRect(0, 0, W, H);
      this.drawParts(c, t);
      c.drawImage(L.ov, 0, 0);
      return;
    }
    c.drawImage(L.sky, 0, 0);
    if (this.stars.length) {                                                // 星星闪烁
      c.setTransform(s, 0, 0, s, ox, oy);
      for (var i = 0; i < this.stars.length; i++) {
        var st = this.stars[i], a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st[4] + st[3]));
        c.fillStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(3) + ')';
        c.fillRect(st[0], st[1], st[2], st[2]);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    function cloud(cl) {
      var x = ((cl.x + t * cl.v) % (VW + cl.w * 1.4)) - cl.w * 0.7;
      c.globalAlpha = cl.a; c.drawImage(cl.img, ox + x * s, oy + cl.y * s); c.globalAlpha = 1;
    }
    this.clouds.forEach(function (cl, i) { if (i % 2 === 0) cloud(cl); });    // 山后的云
    c.drawImage(L.mtn, 0, 0);
    if (this.ph !== 'night') {                                              // 笠云缓慢呼吸
      c.globalAlpha = 0.42 + 0.1 * Math.sin(t * 0.15);
      c.drawImage(this.cap, ox + (CX - 60 + Math.sin(t * 0.05) * 6) * s, oy + (PEAK - 30) * s);
      c.globalAlpha = 1;
    }
    this.clouds.forEach(function (cl, i) { if (i % 2 === 1) cloud(cl); });    // 山前的云
    if (this.birds.length) {                                                // 飞鸟扇翅
      c.setTransform(s, 0, 0, s, ox, oy);
      c.strokeStyle = this.ph === 'day' ? 'rgba(30,40,55,.7)' : 'rgba(25,18,30,.75)'; c.lineWidth = 0.9; c.lineCap = 'round';
      this.birds.forEach(function (b) {
        var span = VW + 200, bx = ((b[0] - t * 6 * b[3]) % span + span) % span - 100, by = b[1] + Math.sin(t * 0.4 + b[2]) * 3;
        var fl = Math.sin(t * 7 * b[3] + b[2]) * 2.2;
        c.beginPath(); c.moveTo(bx - 4, by - fl); c.quadraticCurveTo(bx - 2, by - 1.5 - fl * 0.3, bx, by); c.quadraticCurveTo(bx + 2, by - 1.5 - fl * 0.3, bx + 4, by - fl); c.stroke();
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    // 湖面：逐行镜像 + 两组波纹扰动
    var HYd = this.HYd, depthH = H - HYd;
    if (depthH > 2) {
      for (var y = HYd; y < H; y += 1) {
        var d = (y - HYd) / depthH, src = Math.max(0, HYd - (y - HYd) * 1.02 - 1);
        var dx = Math.sin(y * (0.35 / this.dpr) * (1 + d * 0.6) - t * 1.9) * (0.6 + d * 5.5) * this.dpr
               + Math.sin(y * 0.09 / this.dpr + t * 0.7) * d * 3 * this.dpr;
        c.drawImage(L.up, 0, src, W, 1, dx, y, W, 1);
      }
      var wg = c.createLinearGradient(0, HYd, 0, H);
      wg.addColorStop(0, rgba(P.water[0], 0.35)); wg.addColorStop(1, rgba(P.water[1], 0.82));
      c.fillStyle = wg; c.fillRect(0, HYd, W, depthH);
      var sx = ox + P.sun.x * s, gw = (this.ph === 'day' ? 60 : 34) * s;    // 日/月碎光
      c.globalCompositeOperation = 'lighter';
      for (var g2 = 0; g2 < 46; g2++) {
        var gy = HYd + (g2 / 46) * depthH, spread = gw * (0.3 + (g2 / 46) * 1.4);
        var jit = Math.sin(g2 * 12.9898 + Math.floor(t * 6) * 3.1) * 43758.5453; jit -= Math.floor(jit);
        var ga = (0.18 + 0.5 * Math.abs(Math.sin(t * 3 + g2 * 1.7))) * (this.ph === 'day' ? 0.5 : 0.8);
        c.fillStyle = rgba(P.sun.core, ga.toFixed(3));
        c.fillRect(sx + (jit - 0.5) * spread, gy, (2 + jit * 7) * s * 0.6, Math.max(1, s * 0.5));
      }
      c.globalCompositeOperation = 'source-over';
      for (var m2 = 0; m2 < 2; m2++) {                                      // 湖面薄雾
        var mw = this.mist.width, mx = ((t * (3 + m2 * 2) * s + m2 * 300 * s) % (W + mw)) - mw;
        c.globalAlpha = this.ph === 'night' ? 0.35 : 0.6;
        c.drawImage(this.mist, mx, HYd - this.mist.height * (0.55 - m2 * 0.25));
      }
      c.globalAlpha = 1;
    }
    var self2 = this;
    this.rips.forEach(function (r) {                                        // Canvas 版的涟漪
      var age = t - r.t0; if (age < 0 || age > 2.6) return;
      for (var k = 0; k < 3; k++) {
        var rad = (age * 70 - k * 12) * self2.dpr; if (rad <= 0) continue;
        c.strokeStyle = 'rgba(255,255,255,' + (0.4 * (1 - age / 2.6) * (1 - k * 0.25)).toFixed(3) + ')';
        c.lineWidth = self2.dpr; c.beginPath(); c.ellipse(r.x, r.y, rad, rad * 0.2, 0, 0, 6.283); c.stroke();
      }
    });
    c.drawImage(L.fg, 0, 0);
    this.drawParts(c, t);
    c.drawImage(L.ov, 0, 0);
  };
  Scene.prototype.drawParts = function (c, t) {
    var dt = this.dt || 0, W = this.W, H = this.H, dpr = this.dpr;
    this.gust *= Math.pow(0.25, dt);
    var wind = (8 + Math.sin(t * 0.23) * 10 + Math.max(0, Math.sin(t * 0.61)) * 16) * dpr + this.gust * dpr;   // 基础风 + 阵风 + 手指带起的风
    var leaf = leafPath(), damp = Math.pow(0.18, dt);
    if (this.ph === 'night' && this.kind !== 'banner') {                   // 流星
      if (!this.shoot && Math.random() < dt * 0.12) this.shoot = { x: Math.random() * W * 0.8 + W * 0.1, y: Math.random() * this.HYd * 0.4, a: 0 };
      if (this.shoot) {
        var sh = this.shoot; sh.a += dt;
        var len = 60 * dpr, px = sh.x + sh.a * 420 * dpr, py = sh.y + sh.a * 160 * dpr, al = Math.max(0, 1 - sh.a / 0.9);
        var lg = c.createLinearGradient(px, py, px - len, py - len * 0.38);
        lg.addColorStop(0, 'rgba(255,255,255,' + al + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = lg; c.lineWidth = 1.4 * dpr; c.beginPath(); c.moveTo(px, py); c.lineTo(px - len, py - len * 0.38); c.stroke();
        if (sh.a > 0.9) this.shoot = null;
      }
    }
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (p.ix || p.iy) { p.x += (p.ix || 0) * dt; p.y += (p.iy || 0) * dt; p.ix *= damp; p.iy *= damp; if (Math.abs(p.ix) < 1) p.ix = 0; if (Math.abs(p.iy) < 1) p.iy = 0; }
      if (p.k === 'spark') {
        p.age += dt; if (p.age > p.life) { this.parts.splice(i, 1); i--; continue; }
        var lf = 1 - p.age / p.life, rs2 = p.size * (1.5 + lf * 3);
        var sg2 = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rs2);
        sg2.addColorStop(0, 'rgba(255,246,214,' + (0.95 * lf).toFixed(3) + ')'); sg2.addColorStop(1, 'rgba(255,200,120,0)');
        c.globalCompositeOperation = 'lighter'; c.fillStyle = sg2; c.fillRect(p.x - rs2, p.y - rs2, rs2 * 2, rs2 * 2); c.globalCompositeOperation = 'source-over';
        continue;
      }
      if (p.k === 'mote') {
        p.x += (wind * 0.25 + Math.sin(t * 0.5 + p.ph) * 5 * dpr) * dt; p.y += (p.vy + Math.cos(t * 0.4 + p.ph) * 4 * dpr) * dt;
        if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H * 0.8; if (p.y > H + 10) p.y = 0;
        var ma = (0.25 + 0.35 * Math.max(0, Math.sin(t * 1.3 + p.ph))) * p.z, mr = p.size * 2.2;
        var mg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, mr);
        mg.addColorStop(0, 'rgba(255,244,220,' + ma.toFixed(3) + ')'); mg.addColorStop(1, 'rgba(255,244,220,0)');
        c.globalCompositeOperation = 'lighter'; c.fillStyle = mg; c.fillRect(p.x - mr, p.y - mr, mr * 2, mr * 2); c.globalCompositeOperation = 'source-over';
        continue;
      }
      if (p.k === 'fly') {
        p.x += Math.sin(t * 0.7 + p.ph) * 6 * dt * dpr; p.y += Math.cos(t * 0.5 + p.ph * 2) * 4 * dt * dpr;
        if (p.y < H * 0.35) p.y = H * 0.35;
        var fa = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.8 + p.ph)), fr = 5 * dpr * p.z;
        var gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, fr);
        gr.addColorStop(0, 'rgba(255,248,170,' + fa.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,230,120,0)');
        c.fillStyle = gr; c.fillRect(p.x - fr, p.y - fr, fr * 2, fr * 2);
        continue;
      }
      p.sway += dt * 1.3;
      p.x += (wind * p.z * (p.k === 'snow' ? 0.35 : 1) + Math.sin(p.sway) * 12 * dpr * p.z) * dt;
      p.y += (p.vy + Math.cos(p.sway * 0.8) * 4 * dpr) * dt;
      p.rot += p.vr * dt; p.flip += p.vf * dt;
      if (p.y > H + 20 || p.x > W + 30 || p.x < -60) {
        if (p.tmp) { this.parts.splice(i, 1); i--; continue; }
        var np = this.spawn(false);
        if (Math.random() < 0.65) { np.x = Math.random() * W * 0.85; np.y = -20; } else { np.x = -20; np.y = Math.random() * H * 0.6; }
        this.parts[i] = np; continue;
      }
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      var fx = Math.cos(p.flip);                                            // 三维翻转：宽度随翻面变化，正反面颜色不同
      c.scale(Math.max(0.12, Math.abs(fx)), 1);
      c.globalAlpha = Math.min(1, 0.45 + p.z * 0.6);
      if (p.k === 'petal') {
        var sz = p.size;
        c.fillStyle = fx > 0 ? p.col : mix(p.col, '#d98aa0', 0.45);
        c.beginPath(); c.moveTo(0, -sz * 1.25); c.bezierCurveTo(sz * 1.1, -sz * 0.9, sz * 0.9, sz * 0.8, 0, sz * 1.1);
        c.bezierCurveTo(-sz * 0.9, sz * 0.8, -sz * 1.1, -sz * 0.9, 0, -sz * 1.25); c.fill();
        c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, -sz * 1.25); c.lineTo(sz * 0.2, -sz * 0.9); c.lineTo(-sz * 0.2, -sz * 0.9); c.fill();
      } else if (p.k === 'leaf' && leaf) {
        c.scale(p.size, p.size);
        c.fillStyle = fx > 0 ? p.col : mix(p.col, '#3a1a10', 0.35);
        c.fill(leaf);
        c.strokeStyle = 'rgba(60,20,10,.35)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(0, 8); c.lineTo(0, -6); c.stroke();
      } else if (p.k === 'snow') {
        var rs = p.size * 1.6, sg = c.createRadialGradient(0, 0, 0, 0, 0, rs);
        sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(-rs, -rs, rs * 2, rs * 2);
      } else if (p.k === 'seed') {
        c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(0, 0, p.size * 0.7, 0, 6.28); c.fill();
      }
      c.restore();
    }
    c.globalAlpha = 1;
  };
  Scene.prototype.frame = function (now) {
    var t = (now - this.t0) / 1000;
    this.dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    this.lastT = t;
    this.draw(t);
  };

  /* ---------------- 调度：约 30fps，离屏/后台暂停 ---------------- */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = false, lastTick = 0;
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - lastTick < 32) return;
    lastTick = now;
    ALL.forEach(function (sc) { if (sc.visible) sc.frame(now); });
  }
  function start() { if (running || reduce || document.hidden || Q.still) return; running = true; requestAnimationFrame(loop); }
  function stop() { running = false; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else { ALL.forEach(function (sc) { sc.lastT = 0; }); start(); } });
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { ALL.forEach(function (sc) { sc.resize(); }); }, 180); });

  var BASE = document.createElement('style');
  BASE.textContent = '[data-fuji]{position:relative;overflow:hidden;isolation:isolate;background:#1b2440;touch-action:pan-y;cursor:crosshair}' +
    '.fj-cv,.fj-gl{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:-1}.fj-gl{z-index:-2}' +
    '@media print{[data-fuji]{display:none!important}}';

  function mount(el) {
    if (el._fj) return el._fj;
    var sc = new Scene(el); el._fj = sc; ALL.push(sc);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { sc.visible = e.isIntersecting; }); }).observe(el);
    }
    start();
    return sc;
  }
  function mountAll() {
    if (!BASE.parentNode) document.head.appendChild(BASE);
    document.querySelectorAll('[data-fuji]').forEach(mount);
  }
  window.JPFuji = { phase: phase, season: season, monthName: monthName, mount: mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();
})();
