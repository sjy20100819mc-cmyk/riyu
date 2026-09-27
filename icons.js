/* icons.js —— 全站线条图标（手写 SVG，不用 emoji）
   用法：<button data-ic="speaker">听一遍</button> → 自动在文字前插入图标
         JS 里：JPI('check') 返回 SVG 字符串
   图标一律 24×24、描边 currentColor，跟随文字颜色，深色模式自动适配。 */
(function () {
  var P = {
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 14.5h3v6H5.5A1.5 1.5 0 0 1 4 19z"/><path d="M20 14.5h-3v6h1.5A1.5 1.5 0 0 0 20 19z"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
    slow: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l-2.5 2"/><path d="M9.5 2.5h5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    repeat: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5V10a4.5 4.5 0 0 1 4.5-4.5H20"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 12.5V14a4.5 4.5 0 0 1-4.5 4.5H4"/>',
    bulb: '<path d="M9.5 18h5"/><path d="M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
    shuffle: '<path d="M16 3.5h4.5V8"/><path d="M4 20L20.5 3.5"/><path d="M20.5 16v4.5H16"/><path d="M15 15l5.5 5.5"/><path d="M4 4l5 5"/>',
    camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.7-2.5h5.6l1.7 2.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cross: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>',
    ear: '<path d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 3.2-3.2 4-3.2 7.2a3 3 0 0 1-5.8 1"/><path d="M10.2 10a1.8 1.8 0 0 1 3.6 0c0 1.2-1 1.6-1.4 2.3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    bolt: '<path d="M13 2.5L4.5 13.5h6.5l-1 8 8.5-11H12z"/>',
    type: '<path d="M4.5 7V5h15v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    flame: '<path d="M12 2.8c.8 3.4 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.6 1.5-3.8 2.1-5.7.8 1.5 1.5 2.1 2.4 2.3.1-2.7-.3-4.6.7-6.8z"/>',
    cards: '<rect x="3.5" y="7" width="13" height="13.5" rx="2"/><path d="M7.5 3.5H18a2.5 2.5 0 0 1 2.5 2.5v10.5"/>',
    torii: '<path d="M2.5 5.5c3.5 1 15.5 1 19 0"/><path d="M4 9h16"/><path d="M6.8 6.4V21"/><path d="M17.2 6.4V21"/><path d="M12 6.8V9"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 1.5"/><path d="M9.5 2.5h5"/>',
    close: '<path d="M7 7l10 10"/><path d="M17 7L7 17"/>',
    /* 环境音 */
    rain: '<path d="M7 15.5a4.2 4.2 0 0 1-.4-8.4A5.8 5.8 0 0 1 17.8 8.6 3.5 3.5 0 0 1 17 15.5z"/><path d="M8.5 18.5l-1 2"/><path d="M12.5 18.5l-1 2"/><path d="M16.5 18.5l-1 2"/>',
    wave: '<path d="M2 9c2.5 0 2.5-2.5 5-2.5S9.5 9 12 9s2.5-2.5 5-2.5S19.5 9 22 9"/><path d="M2 15c2.5 0 2.5-2.5 5-2.5S9.5 15 12 15s2.5-2.5 5-2.5 2.5 2.5 5 2.5"/><path d="M2 20.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
    wind: '<path d="M3 8.5h10.5a3 3 0 1 0-3-3"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>',
    fire: '<path d="M12 2.8c.8 3.4 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.6 1.5-3.8 2.1-5.7.8 1.5 1.5 2.1 2.4 2.3.1-2.7-.3-4.6.7-6.8z"/><path d="M12 20.5a2.4 2.4 0 0 1-2.4-2.4c0-1.6 1.6-2.4 2.4-4 .8 1.6 2.4 2.4 2.4 4a2.4 2.4 0 0 1-2.4 2.4z"/>',
    bird: '<path d="M3 13.5c2.5.5 4.5-.5 6.5-3 1.4-1.8 3-2.5 5-2.5 1.6 0 2.7.6 3.5 1.5l3-.5-2.2 2c0 4.5-3.3 7.5-8 7.5-3.3 0-5.9-1.6-7.8-5z"/><circle cx="16" cy="9.6" r=".6" fill="currentColor"/>',
    cafe: '<path d="M4 9h13v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10.5h1.2a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5v2.5"/><path d="M12 3.5v2.5"/>',
    noise: '<path d="M2.5 12h2l1.5-4 2 8 2-11 2 14 2-9 2 5 1.5-3h4"/>'
  };
  function JPI(name, cls) {
    var p = P[name]; if (!p) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function deco(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
      if (el.querySelector(':scope > svg.ic')) return;
      el.insertAdjacentHTML('afterbegin', JPI(el.getAttribute('data-ic')));
    });
  }
  var css = document.createElement('style');
  css.textContent = 'svg.ic{display:inline-block;vertical-align:-.16em;flex:0 0 auto}[data-ic]>svg.ic{margin-right:.38em}[data-ic]:empty>svg.ic,.home>svg.ic,.spk>svg.ic,.x>svg.ic{margin-right:0}' +
    '.ink-host{position:relative;overflow:hidden}' +
    '.ink{position:absolute;border-radius:50%;pointer-events:none;background:currentColor;opacity:.22;transform:scale(0);animation:jpink .6s cubic-bezier(.2,.7,.3,1) forwards}' +
    '@keyframes jpink{to{transform:scale(1);opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.ink{display:none}}';
  (document.head || document.documentElement).appendChild(css);
  window.JPI = JPI; JPI.deco = deco; JPI.names = Object.keys(P);
  /* 按下任何按钮 / 卡片：从手指处晕开一圈墨（交互反馈） */
  var INK = 'button, a.link, a.tool, .tile, .ch, .tg, .cell, .wc, .sent, .pair .side, .chip, .flash, .hit';
  document.addEventListener('pointerdown', function (e) {
    var el = e.target && e.target.closest ? e.target.closest(INK) : null;
    if (!el || el.closest('[data-fuji]') === el) return;
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.classList.add('ink-host'); else if (cs.overflow !== 'hidden') el.style.overflow = 'hidden';
    var r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    var ink = document.createElement('span'); ink.className = 'ink';
    ink.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    el.appendChild(ink);
    setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink); }, 650);
  }, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { deco(); }); else deco();
})();
