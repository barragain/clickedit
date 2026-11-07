// clickedit: edit your local dev page in the browser and hand the changes to your AI coding agent as text.
// One pointer, no modes. Hover outlines what a click would pick. A click edits words (buttons and links included)
// or selects; the bottom bar acts on the selection. Ctrl + click uses a button or link like a visitor. Right-click
// comments. Shift + drag draws: a loop is saved as "around X", a straight stroke as an arrow "from X to Y", because the
// AI reads the saved result as text, not as a picture. Esc pauses. Also: a badge for saves the AI has not applied,
// a phone view (390px frame running its own editor, one bar), style tweaks, drag to reorder, one Publish for every
// page, and unsaved edits kept across reloads.
(() => {
  if (window.__clickedit) return;
  window.__clickedit = true;
  // The save server: where this script came from (the save server itself, or the proxy's /__clickedit path).
  const SERVER = (document.currentScript?.src || 'http://localhost:4399/clickedit.js').replace(/\/[^/]*$/, '');
  // Phone view: this page runs inside the editor's 390px frame; its bar lives in the parent page, so there is one bar.
  const host = (() => { try { return window.parent !== window ? window.parent.__cePhoneHost ?? null : null; } catch { return null; } })();
  const UI = '#ce-edit,#ce-note,.ce-pin,#ce-canvas,#ce-drop,#ce-phone';
  const INTERACTIVE = 'a,button,summary,label,input,select,textarea,[role=button]';
  const HINT = 'Click: edit or select · Ctrl+click: use it · Esc: pause';
  const TINTS = ['ce-changed', 'ce-tweaked'];
  // Unsaved edits live in localStorage per page (paths and values only), so a reload, a page change or a closed tab loses
  // nothing; saving clears them. Two tabs of one page share the entry: the last one to change something wins.
  const KEY = 'ce-unsaved:' + location.pathname + (host ? '#phone' : '');
  const ss = (fn) => { try { return fn(localStorage); } catch { return null; } };
  const changes = [];
  let justDrew = 0, tool = null, paused = false, sent = 0, target = null, over = null, editing = null, drawing = null;
  // The click that ends a drag or a drawing comes in the same task as the release; a later click is a real one.
  const swallow = () => { justDrew = Date.now(); setTimeout(() => { justDrew = 0; }, 0); };
  const layer = () => document.querySelector('dialog[open]:modal') ?? document.body;
  const ours = (el) => !el || el.nodeType !== 1 || !!el.closest(UI) || el === document.body || el === document.documentElement;
  // Where an element sits as child indexes from <body>, recorded before each change so a reload can replay them in order.
  const locOf = (el) => { const l = []; for (let e = el; e && e !== document.body && e.parentElement; e = e.parentElement) l.unshift([...e.parentElement.children].indexOf(e)); return l; };
  const atLoc = (l) => l.reduce((e, i) => e?.children[i], document.body) ?? null;
  const kids = (p) => [...p.children].filter((x) => !x.matches(UI) && !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(x.tagName));
  // A full-page effect canvas over the content (with the content set to pointer-events:none) would swallow every pick:
  // under a canvas, the editor picks the deepest page element whose box holds the point instead.
  const hit = (el, x, y) => {
    if (el?.tagName !== 'CANVAS' || el.closest(UI)) return el;
    let best = el;
    for (const c of document.body.querySelectorAll('*')) {
      if (c.tagName === 'CANVAS' || c.tagName === 'SCRIPT' || c.closest(UI)) continue;
      const r = c.getBoundingClientRect();
      if (r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && getComputedStyle(c).visibility !== 'hidden') best = c;
    }
    return best;
  };
  const norm = (t) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  // A path the AI can find in the source: tags with classes, ids, nth-of-type where siblings share a tag.
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && e.nodeType === 1; e = e.parentElement) {
      if (e.id) { parts.unshift(`${e.tagName.toLowerCase()}#${e.id}`); break; }
      let s = e.tagName.toLowerCase() + [...e.classList].filter((c) => !c.startsWith('ce-')).map((c) => '.' + c).join('');
      const same = [...(e.parentElement?.children ?? [])].filter((x) => x.tagName === e.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
      if (e.tagName === 'SECTION' || e.tagName === 'HEADER') break;
    }
    return parts.join(' > ');
  };
  const snip = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const ref = (el) => ({ path: path(el), snippet: snip(el) });
  // What a click types into: a button or link as a whole, else the element whose own text nodes hold words.
  const typable = (el) => {
    const ctl = el.closest(INTERACTIVE);
    if (ctl) return ctl.innerText.trim() && !ctl.matches('input,select,textarea') ? ctl : null;
    let t = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? el : null;
    // Headings split into one span per letter (for animation) are typed as a whole, not letter by letter.
    const wrapper = (p) => p.children.length >= 2 && ![...p.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    while (t && t.parentElement && t.parentElement !== document.body && getComputedStyle(t).display.startsWith('inline') && (norm(t.innerText).length <= 2 || wrapper(t.parentElement))) t = t.parentElement;
    return t;
  };

  // ---------- icons (drawn here, nothing loads from outside) ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    use: '<path d="M9 9l5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1"/><path d="m5.1 8-2.9-.8"/><path d="M14 4.1 12 6"/><path d="m6 12-1.9 2"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    remove: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    parent: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    save: '<path d="M20 6 9 17l-5-5"/>',
    publish: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
    style: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  };
  const btn = (attr, icon, label) => `<button ${attr} aria-label="${label}" data-tip="${label}">${svg(ICON[icon])}</button>`;

  // ---------- theme: read from each site (body font, main button colour, light or dark page), never one fixed brand ----------
  const rgb = (c) => { const m = (c || '').match(/[\d.]+/g)?.map(Number); return m && m.length >= 3 ? { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } : null; };
  const lum = ({ r, g, b }) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
  const chroma = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const rgba = ({ r, g, b }, a = 1) => `rgba(${r},${g},${b},${a})`;
  const T = (() => {
    const cs = (e) => getComputedStyle(e);
    const bg = [document.body, document.documentElement].map((e) => rgb(cs(e).backgroundColor)).find((c) => c && c.a > 0.5) ?? { r: 255, g: 255, b: 255 };
    const text = rgb(cs(document.body).color) ?? { r: 20, g: 20, b: 20 };
    // The main button: the first sizeable button or link with its own fill that stands apart from the page.
    const main = [...document.querySelectorAll('button, a, [role=button]')].find((e) => {
      if (e.closest(UI)) return false;
      const r = e.getBoundingClientRect(), c = rgb(cs(e).backgroundColor);
      return r.width > 40 && r.height > 24 && c && c.a > 0.5 && contrast(c, bg) > 1.1;
    });
    const fill = main && rgb(cs(main).backgroundColor), label = main && rgb(cs(main).color);
    const link = [...document.querySelectorAll('a[href]')].map((a) => rgb(cs(a).color)).find((c) => c && chroma(c) > 0.25);
    // Its fill if that has a hue; a black or white button lends its label colour; then the link colour; then neutral.
    const accent = [fill, label, link].find((c) => c && chroma(c) > 0.25) ?? fill ?? text;
    const light = lum(bg) > 0.4;
    const surface = light ? { r: 24, g: 24, b: 27 } : { r: 244, g: 244, b: 245 };
    const ink = (c) => (contrast(c, { r: 0, g: 0, b: 0 }) >= contrast(c, { r: 255, g: 255, b: 255 }) ? '#000' : '#fff');
    return {
      font: cs(document.body).fontFamily || 'system-ui, sans-serif', light,
      s: rgba(surface), fg: light ? '#FAFAFA' : '#18181B', r: light ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)', rh: light ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.14)',
      a: rgba(accent), on: ink(accent),
      // The accent where it reads on the bar, else the bar's own text colour.
      aBar: contrast(accent, surface) >= 3 ? rgba(accent) : (light ? '#FAFAFA' : '#18181B'),
      // Outlines must show on the page: the accent if it does, else the page's text colour.
      line: rgba(contrast(accent, bg) >= 2.2 ? accent : text),
      // Waiting changes: yellow where it stays readable (light pages), else the accent, faint.
      tint: light ? 'rgba(255,212,0,.35)' : rgba(accent, 0.25), ring: light ? 'rgba(255,212,0,.9)' : rgba(accent, 0.8),
    };
  })();
  window.__ceTheme = T;

  const css = document.createElement('style');
  css.textContent = `
  #ce-edit,#ce-note,#ce-style,.ce-pin{--ce-font:${T.font}}
  #ce-edit{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646;display:flex;gap:6px;align-items:center;padding:6px 6px 6px 12px;border-radius:14px;background:${T.s};color:${T.fg};font:600 13px/1.2 var(--ce-font);box-shadow:0 8px 30px rgba(0,0,0,.3);max-width:calc(100vw - 16px);flex-wrap:nowrap;white-space:nowrap}
  #ce-edit button,#ce-note button{all:unset;cursor:pointer;border-radius:9px;background:${T.r};color:${T.fg};font:600 13px var(--ce-font)}
  #ce-edit button{display:inline-grid;place-items:center;width:34px;height:34px;position:relative}
  #ce-edit .ce-badge{position:relative;padding:4px 8px;border-radius:999px;background:${T.a};color:${T.on};font:700 11px/1.2 var(--ce-font);cursor:default}
  #ce-edit .ce-badge.ce-done{background:#15803D;color:#fff}
  #ce-edit .ce-badge[hidden]{display:none}
  #ce-edit .ce-badge[data-tip]:hover::after{left:0;transform:none}
  #ce-edit [data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);padding:6px 9px;border-radius:8px;background:${T.s};color:${T.fg};font:500 12px/1.3 var(--ce-font);white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none}
  #ce-edit button[data-tip]:nth-last-of-type(-n+3):hover::after{left:auto;right:0;transform:none}
  #ce-edit button[data-tip]:nth-of-type(-n+2):hover::after{left:0;transform:none}
  #ce-edit button:hover{background:${T.rh}}
  #ce-edit button:disabled{opacity:.3;cursor:default;background:${T.r}}
  #ce-edit button[aria-pressed=true]{background:${T.a};color:${T.on}}
  html.ce-tool-draw,html.ce-tool-draw *{cursor:crosshair!important;user-select:none!important}
  html.ce-tool-comment,html.ce-tool-comment *{cursor:copy!important}
  #ce-edit button.ce-save{background:${T.a};color:${T.on}}
  #ce-edit button.ce-save:hover{filter:brightness(1.08)}
  #ce-edit .ce-sep{width:1px;height:22px;background:${T.rh};margin:0 2px}
  #ce-edit .ce-count{color:${T.aBar};min-width:1.5rem;text-align:center}
  #ce-edit .ce-status{font-weight:400;font-size:12px;opacity:.8;padding:0 6px;overflow:hidden;text-overflow:ellipsis;min-width:0}
  #ce-edit .ce-status.ce-msg{opacity:1;color:${T.aBar}}
  @media (max-width:1100px){#ce-edit .ce-status:not(.ce-msg){display:none}}
  #ce-note button{padding:8px 11px}
  .ce-over{outline:2px dashed ${T.line}!important;outline-offset:2px}
  .ce-sel{outline:3px solid ${T.line}!important;outline-offset:2px}
  .ce-sel:not(.ce-typing){cursor:grab}
  html.ce-grip,html.ce-grip *{cursor:grab!important}
  .ce-removed{opacity:.3!important;outline:3px dashed #D92D20!important;outline-offset:2px}
  .ce-typing{cursor:text}
  .ce-changed{background:${T.tint}!important}
  .ce-tweaked{box-shadow:0 0 0 3px ${T.ring}!important}
  html.ce-dragging,html.ce-dragging *{cursor:grabbing!important;user-select:none!important}
  #ce-drop{position:fixed;z-index:2147483645;background:${T.line};border-radius:3px;pointer-events:none;box-shadow:0 0 0 2px ${T.light ? '#fff' : '#000'}}
  #ce-style{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);width:310px;display:grid;gap:8px;padding:12px;border-radius:12px;background:${T.s};box-shadow:0 8px 30px rgba(0,0,0,.3);white-space:normal;cursor:default}
  #ce-style[hidden]{display:none}
  #ce-style b{font:700 12px var(--ce-font);color:${T.aBar}}
  #ce-style label{display:grid;grid-template-columns:104px 1fr 62px;gap:8px;align-items:center;font:500 12px var(--ce-font)}
  #ce-style input[type=range]{width:100%;accent-color:${T.a}}
  #ce-style input[type=number]{width:62px;box-sizing:border-box;border:0;border-radius:6px;padding:4px 6px;font:500 12px var(--ce-font);color:#18181B;background:#FAFAFA}
  #ce-style input[type=color]{grid-column:2/4;width:100%;height:26px;border:0;padding:0;background:none;cursor:pointer}
  #ce-phone{position:fixed;inset:0;z-index:2147483640;display:flex;justify-content:center;align-items:flex-start;padding-top:16px;background:rgba(0,0,0,.55);overflow:hidden}
  #ce-phone .ce-frame{flex:none;width:390px;height:844px;transform-origin:top center;border-radius:28px;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  #ce-phone iframe{display:block;width:390px;height:844px;border:0}
  #ce-note{position:fixed;z-index:2147483646;background:${T.s};color:${T.fg};border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px;width:min(280px,80vw);box-shadow:0 8px 30px rgba(0,0,0,.3)}
  #ce-note p{margin:0;font:500 14px/1.45 var(--ce-font);color:${T.fg}}
  #ce-note textarea{font:14px var(--ce-font);min-height:70px;border-radius:8px;border:0;padding:8px;color:#18181B;background:#fff}
  #ce-note div{display:flex;gap:6px;justify-content:flex-end}
  #ce-note button[data-n=ok],#ce-note button[data-n=yes]{background:${T.a};color:${T.on}}
  .ce-pin{position:absolute;z-index:2147483645;width:26px;height:26px;border-radius:50%;background:${T.s};color:${T.aBar};display:grid;place-items:center;font:700 13px var(--ce-font);transform:translate(-50%,-50%);box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer}
  .ce-pin:hover{outline:2px solid ${T.line}}
  #ce-canvas{position:absolute;left:0;top:0;z-index:2147483644;pointer-events:none}
  html.ce-drawing,html.ce-drawing *{cursor:crosshair!important;user-select:none!important}
  @keyframes ce-pop{from{opacity:0;translate:0 6px;scale:.97}}
  @keyframes ce-fade{from{opacity:0}}
  #ce-note,#ce-style,.ce-badge.ce-anim,.ce-pin{animation:ce-pop .16s ease-out}
  #ce-edit [data-tip]:hover::after{animation:ce-pop .14s ease-out}
  #ce-phone{animation:ce-fade .16s ease-out}
  #ce-phone .ce-frame{animation:ce-pop .18s ease-out}
  @media (prefers-reduced-motion:reduce){#ce-note,#ce-style,#ce-edit .ce-badge,.ce-pin,#ce-edit [data-tip]:hover::after,#ce-phone,#ce-phone .ce-frame{animation:none!important}}`;
  document.head.append(css);

  // ---------- bottom bar: selection actions, then undo, pause, save ----------
  const bar = document.createElement('div');
  bar.id = 'ce-edit';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Page editor');
  const SEL = [['use', 'Use it like a visitor (Ctrl + click)'], ['remove', 'Remove'], ['up', 'Move up (or drag the selection)'], ['down', 'Move down (or drag the selection)'], ['parent', 'Select the bigger block'], ['style', 'Style: spacing, text size, colours']];
  bar.innerHTML = `<span class="ce-count" aria-label="Unsaved changes">0</span><span class="ce-badge" hidden></span><span class="ce-status" role="status">${HINT}</span>`
    + btn('data-tool="comment" aria-pressed="false"', 'comment', 'Comment: on the selection, or click where it goes (right-click works too)')
    + btn('data-tool="draw" aria-pressed="false"', 'pen', 'Draw: circle something or drag an arrow (Shift + drag works too)') + '<span class="ce-sep"></span>'
    + SEL.map(([k, l]) => btn(`data-k="${k}" disabled`, k, l)).join('') + '<span class="ce-sep"></span>'
    + btn('data-act="undo"', 'undo', 'Undo') + btn('data-act="pause"', 'pause', 'Pause (Esc)')
    + btn(`data-act="phone" aria-pressed="${!!host}"`, 'phone', host ? 'Back to the desktop view' : 'Phone view: edit the page at phone width')
    + btn('class="ce-save" data-act="save"', 'save', 'Save, send to your AI')
    + btn('data-act="publish"', 'publish', 'Publish live: your AI applies your saves on every page and deploys');
  (host ? host.root : document.body).append(bar);
  const count = bar.querySelector('.ce-count'), status = bar.querySelector('.ce-status'), badge = bar.querySelector('.ce-badge');
  const panel = document.createElement('div');
  panel.id = 'ce-style';
  panel.hidden = true;
  bar.append(panel);
  let quiet = null;
  const say = (t) => {
    clearTimeout(quiet);
    status.textContent = t || HINT;
    status.classList.toggle('ce-msg', !!t);
    if (t) quiet = setTimeout(() => say(''), 5000);
  };
  const clean = ({ el, pin, stroke, prev, back, at, r, ...c }) => c;
  const persist = () => ss((s) => {
    const u = changes.slice(sent);
    if (u.length) s.setItem(KEY, JSON.stringify({ url: location.href, viewport: `${innerWidth}x${innerHeight}`, phone: !!host, changes: u.map((c) => ({ ...clean(c), r: c.r })) }));
    else s.removeItem(KEY);
  });
  const tick = () => { count.textContent = String(changes.length - sent); persist(); };
  // A modal dialog makes the rest of the page inert, so the bar moves into it while it is open (in phone view it stays in the parent page).
  if (!host) new MutationObserver(() => { const l = layer(); if (bar.parentElement !== l) l.append(bar); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  // Pressing a bar button must not take the focus away from the words being typed (the style panel's inputs still take focus).
  bar.addEventListener('mousedown', (e) => { if (!e.target.closest('#ce-style')) e.preventDefault(); });

  // ---------- saves waiting for the AI: badge, polled while any is waiting; applied changes lose their yellow tint ----------
  let polling = null;
  const serverState = async () => { try { return await (await fetch(SERVER + '/status')).json(); } catch { return null; } };
  const poll = async () => {
    clearTimeout(polling);
    const st = await serverState();
    if (!st) return;
    if (st.applied != null) changes.slice(0, sent).forEach((c) => { if (c.at && c.at <= st.applied) c.el?.classList.remove(...TINTS); });
    badge.hidden = false;
    const word = st.pending ? `${st.pending} waiting` : 'All applied';
    if (badge.textContent !== word) { badge.classList.remove('ce-anim'); void badge.offsetWidth; badge.classList.add('ce-anim'); }
    badge.textContent = word;
    badge.classList.toggle('ce-done', !st.pending);
    badge.dataset.tip = st.pending ? `Your AI has not applied ${st.pending} of your saves yet` : 'Your AI has applied all your saves';
    if (st.pending) polling = setTimeout(poll, 3000);
  };
  if (ss((s) => s.getItem('ce-saved'))) poll();

  const setTool = (t) => {
    tool = tool === t ? null : t;
    bar.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    document.documentElement.classList.toggle('ce-tool-draw', tool === 'draw');
    document.documentElement.classList.toggle('ce-tool-comment', tool === 'comment');
    say(tool === 'draw' ? 'Drawing: circle something or drag an arrow. Esc stops.' : tool === 'comment' ? 'Click where your comment goes.' : '');
  };
  const aim = (el) => {
    if (el === target) return;
    target?.classList.remove('ce-sel');
    target = el;
    el?.classList.add('ce-sel');
    bar.querySelectorAll('[data-k]').forEach((b) => { b.disabled = !el; });
    if (!panel.hidden) styles(el);
  };

  // ---------- style tweaks: a panel above the bar, live on the selection, one 'style' change per property ----------
  const PROPS = [['padding-block', 'Padding top, bottom', 0, 160], ['padding-inline', 'Padding sides', 0, 160], ['margin-block', 'Margin top, bottom', -80, 200], ['margin-inline', 'Margin sides', -80, 200], ['font-size', 'Text size', 8, 120], ['color', 'Text colour'], ['background-color', 'Background']];
  const hex = (c) => { const m = c.match(/[\d.]+/g); return m && m.length >= 3 && +(m[3] ?? 1) > 0 ? '#' + m.slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('') : null; };
  const styles = (el) => {
    panel.hidden = !el;
    bar.querySelector('[data-k=style]').setAttribute('aria-pressed', String(!!el));
    if (!el) return;
    const cs = getComputedStyle(el);
    panel.innerHTML = `<b>Style of the selection</b>` + PROPS.map(([p, label, min, max]) => min === undefined
      ? `<label><span>${label}</span><input type="color" data-p="${p}" value="${hex(cs.getPropertyValue(p)) ?? '#ffffff'}"></label>`
      : `<label><span>${label}</span><input type="range" data-p="${p}" min="${min}" max="${max}" value="${Math.round(parseFloat(cs.getPropertyValue(p)))}"><input type="number" data-p="${p}" value="${Math.round(parseFloat(cs.getPropertyValue(p)))}" aria-label="${label} in px"></label>`).join('');
  };
  const setStyle = (el, prop, val) => {
    let c = changes.slice(sent).find((x) => x.type === 'style' && x.el === el && x.prop === prop);
    if (!c) { c = { type: 'style', el, ...ref(el), prop, before: getComputedStyle(el).getPropertyValue(prop), prev: el.style.getPropertyValue(prop), r: { loc: locOf(el) } }; changes.push(c); }
    el.style.setProperty(prop, val);
    c.after = val;
    // Back where it started: not a change any more.
    if (getComputedStyle(el).getPropertyValue(prop) === c.before) { changes.splice(changes.indexOf(c), 1); if (c.prev) el.style.setProperty(prop, c.prev); else el.style.removeProperty(prop); }
    el.classList.toggle('ce-tweaked', changes.some((x) => x.el === el && (x.type === 'style' || x.type === 'move')));
    tick();
  };
  panel.addEventListener('input', (e) => {
    const p = e.target.dataset.p;
    if (!p || !target) return;
    const val = e.target.type === 'color' ? e.target.value : `${e.target.value}px`;
    panel.querySelectorAll(`[data-p="${p}"]`).forEach((i) => { if (i !== e.target) i.value = e.target.value; });
    setStyle(target, p, val);
  });

  // ---------- hover outline ----------
  const hover = (e) => {
    const t = hit(e.target, e.clientX, e.clientY);
    if (paused || drawing || ours(t) || t === over) return;
    over?.classList.remove('ce-over');
    over = t;
    over.classList.add('ce-over');
  };
  document.addEventListener('mouseover', hover);
  // Over an effect canvas no mouseover fires while moving, so the outline follows the pointer once a frame.
  let hoverFrame = 0;
  document.addEventListener('mousemove', (e) => { if (e.target.tagName === 'CANVAS' && !hoverFrame) hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; hover(e); }); }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (e.target === over && !e.relatedTarget) { over.classList.remove('ce-over'); over = null; } });

  // ---------- typing ----------
  const startTyping = (el) => {
    if (editing === el) return;
    editing?.blur();
    editing = el;
    aim(el);
    el.dataset.ceBefore ??= el.innerText;
    el.dataset.ceBeforeHtml ??= el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('ce-typing');
    say('Typing. To move it, drag its outline, or press Esc and drag it.');
    el.focus();
    // Focus alone can leave the caret in the element typed before, so typing would go nowhere; put it at the end here.
    const s = getSelection();
    if (s && !el.contains(s.anchorNode)) { s.selectAllChildren(el); s.collapseToEnd(); }
  };
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el !== editing) return;
    editing = null;
    el.removeAttribute('contenteditable');
    el.classList.remove('ce-typing');
    // Typing can swap spaces for non-breaking ones; those are not a change. Bold or italic added with Ctrl+B / Ctrl+I is.
    // Only the bold or italic runs count here; plain word changes are already in before/after.
    const marks = (h) => (h.replace(/&nbsp;/g, ' ').match(/<(b|strong|i|em)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? []).map((m) => norm(m.replace(/<(?!\/?(b|strong|i|em)\b)[^>]*>/gi, ''))).join('|');
    const before = el.dataset.ceBefore, beforeHtml = el.dataset.ceBeforeHtml;
    const textSame = norm(el.innerText) === norm(before), htmlSame = marks(el.innerHTML) === marks(beforeHtml);
    const after = textSame ? before : el.innerText, same = textSame && htmlSame;
    const old = changes.slice(sent).find((c) => c.type === 'text' && c.el === el);
    const extra = htmlSame ? {} : { beforeHtml, afterHtml: el.innerHTML };
    if (same) { if (old) changes.splice(changes.indexOf(old), 1); el.classList.remove('ce-changed'); }
    else if (old) Object.assign(old, { after }, extra);
    else changes.push({ type: 'text', el, ...ref(el), snippet: before.slice(0, 80), before, after, ...extra, r: { loc: locOf(el) } });
    if (!same) el.classList.add('ce-changed');
    tick();
  });
  // A click edits or selects; Ctrl + click (Cmd on a Mac) is a visitor's click. A Ctrl-clicked link opens here, not in a new tab.
  document.addEventListener('click', (e) => {
    if (Date.now() - justDrew < 400) { justDrew = 0; if (!ours(e.target)) { e.preventDefault(); e.stopPropagation(); } return; } // the end of a drag, not a click
    if (paused || ours(e.target)) return;
    if (e.target === document.body || e.target === document.documentElement) { editing?.blur(); aim(null); return; }
    const t = e.ctrlKey || e.metaKey ? e.target : hit(e.target, e.clientX, e.clientY);
    if (tool === 'comment') { e.preventDefault(); e.stopPropagation(); setTool(null); comment(t, e.clientX, e.clientY); return; }
    if (e.ctrlKey || e.metaKey) {
      editing?.blur();
      const a = e.target.closest('a[href]');
      if (a && a.target !== '_blank') { e.preventDefault(); location.assign(a.href); }
      return;
    }
    if (editing && editing.contains(t)) { if (t.closest(INTERACTIVE)) { e.preventDefault(); e.stopPropagation(); } return; }
    e.preventDefault(); e.stopPropagation();
    const el = typable(t);
    if (el) startTyping(el); else { editing?.blur(); aim(t); }
  }, true);

  // ---------- note popup and comments ----------
  const note = (x, y, label, done, opts = {}) => {
    document.getElementById('ce-note')?.remove();
    const box = document.createElement('div');
    box.id = 'ce-note';
    box.style.left = Math.max(8, Math.min(x, innerWidth - 300)) + 'px';
    box.style.top = Math.max(8, Math.min(y + 12, innerHeight - 160)) + 'px';
    box.innerHTML = `<textarea aria-label="${label}" placeholder="${label}"></textarea><div>${opts.onDelete ? '<button data-n="del">Delete</button>' : ''}<button data-n="skip">${opts.value ? 'Cancel' : 'Skip'}</button><button data-n="ok">${opts.value ? 'Save' : 'Add'}</button></div>`;
    layer().append(box);
    const ta = box.querySelector('textarea');
    if (opts.value) ta.value = opts.value;
    ta.focus();
    // An empty box closes on a click anywhere outside it; one with text stays, so a note is never lost by accident.
    const away = (ev) => { if (!box.contains(ev.target) && !ta.value.trim()) close(false); };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    const close = (ok) => { document.removeEventListener('pointerdown', away, true); if (ok && ta.value.trim()) done(ta.value.trim()); box.remove(); };
    box.addEventListener('click', (ev) => { const n = ev.target.dataset?.n; if (n === 'del') { opts.onDelete(); box.remove(); } else if (n) close(n === 'ok'); });
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) close(true); if (ev.key === 'Escape') { ev.stopPropagation(); close(false); } });
  };
  // Ctrl+B / Ctrl+I while typing: bold and italic, kept in the save as HTML.
  document.addEventListener('keydown', (e) => {
    if (!editing || !(e.ctrlKey || e.metaKey) || !['b', 'i'].includes(e.key.toLowerCase())) return;
    e.preventDefault();
    document.execCommand(e.key.toLowerCase() === 'b' ? 'bold' : 'italic');
  }, true);
  // Text selected on the page when a comment starts is saved with it, so the note points at those exact words.
  const picked = () => { const t = getSelection()?.toString().trim() ?? ''; return t && !getSelection().anchorNode?.parentElement?.closest(UI) ? t.slice(0, 300) : ''; };
  const comment = (el, cx, cy) => { const quote = picked(); note(cx, cy, quote ? `Your comment on “${quote.slice(0, 40)}${quote.length > 40 ? '...' : ''}”` : 'Your comment', (t) => {
    const fixed = layer() !== document.body, x = fixed ? cx : cx + scrollX, y = fixed ? cy : cy + scrollY;
    const c = { type: 'comment', el, ...ref(el), note: t, ...(quote ? { quote } : {}), r: { loc: locOf(el), x, y, fixed } };
    changes.push(c); addPin(c, x, y, fixed); tick();
  }); };
  const addPin = (c, x, y, fixed) => {
    const pin = document.createElement('div');
    pin.className = 'ce-pin';
    pin.style.position = fixed ? 'fixed' : 'absolute';
    pin.style.left = x + 'px';
    pin.style.top = y + 'px';
    c.pin = pin; pin.textContent = String(changes.indexOf(c) + 1);
    pin.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const r = pin.getBoundingClientRect(), was = changes.indexOf(c) < sent;
      note(r.left, r.bottom, 'Edit your comment', (t) => {
        if (was) changes.push({ ...c, pin: undefined, note: `(replaces comment ${pin.textContent}) ${t}` }); else c.note = t;
        tick();
      }, { value: c.note, onDelete: () => {
        if (was) changes.push({ ...c, pin: undefined, note: `(delete comment ${pin.textContent}, ignore it)` });
        else changes.splice(changes.indexOf(c), 1);
        pin.remove(); tick();
      } });
    });
    layer().append(pin);
  };
  // Right-click selects what is under the pointer (outline plus the bar's actions), then opens its comment box.
  document.addEventListener('contextmenu', (e) => {
    if (paused || ours(e.target)) return;
    e.preventDefault();
    const el = hit(e.target, e.clientX, e.clientY);
    if (editing && !editing.contains(el)) editing.blur();
    aim(el);
    comment(el, e.clientX, e.clientY);
  });

  // ---------- selection actions (bottom bar) ----------
  const act = (k) => {
    const el = target;
    if (!el) return;
    const b = el.getBoundingClientRect();
    if (k === 'use') { editing?.blur(); aim(null); paused = true; el.click(); paused = false; return; }
    if (k === 'comment') return comment(el, b.left + 12, Math.max(12, b.top + 12));
    if (k === 'parent') { const p = el.parentElement; if (p && p !== document.body && p.tagName !== 'MAIN') { editing?.blur(); aim(p); } return; }
    if (k === 'style') return styles(panel.hidden ? el : null);
    editing?.blur();
    if (k === 'remove') { changes.push({ type: 'remove', el, ...ref(el), r: { loc: locOf(el) } }); el.classList.add('ce-removed'); }
    if (k === 'up' || k === 'down') { const c = { type: 'move', dir: k, el, ...ref(el), r: { loc: locOf(el) } }; if (step(c)) changes.push(c); }
    tick();
  };
  // One step up or down among the siblings; also replays a restored move.
  const step = (c) => {
    const other = c.dir === 'up' ? c.el.previousElementSibling : c.el.nextElementSibling;
    if (!other || other.matches(UI)) return false;
    c.other ??= ref(other);
    if (c.dir === 'up') c.el.after(other); else other.after(c.el);
    c.el.classList.add('ce-tweaked');
    return true;
  };

  // ---------- drag the selection among its siblings ----------
  // Press on the selection and move 6px: it moves. While its words are being typed, a drag inside selects words, so the
  // grip is its outline (a band from 3px inside to 9px outside the edge), or Esc stops typing and the whole block drags.
  const dropLine = document.createElement('div');
  dropLine.id = 'ce-drop';
  let press = null, dragging = null;
  const spot = (el, x, y) => {
    const er = el.getBoundingClientRect();
    let best = null, bd = Infinity;
    for (const k of kids(el.parentElement)) {
      if (k === el) continue;
      // Distance to the sibling's box (0 when the pointer is over it), so tall blocks like sections are found too.
      const r = k.getBoundingClientRect(), d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bd) { bd = d; best = { k, r }; }
    }
    if (!best) return null;
    // Side by side with the dragged block means a row: left or right decides; otherwise above or below does.
    const row = best.r.top < er.bottom && best.r.bottom > er.top && (best.r.right <= er.left || best.r.left >= er.right);
    const after = row ? x > best.r.left + best.r.width / 2 : y > best.r.top + best.r.height / 2;
    Object.assign(dropLine.style, row
      ? { left: (after ? best.r.right : best.r.left) - 3 + 'px', top: best.r.top + 'px', width: '6px', height: best.r.height + 'px' }
      : { left: best.r.left + 'px', top: (after ? best.r.bottom : best.r.top) - 3 + 'px', width: best.r.width + 'px', height: '6px' });
    return { k: best.k, after };
  };
  const onEdge = (el, x, y) => {
    const r = el.getBoundingClientRect();
    const near = x > r.left - 9 && x < r.right + 9 && y > r.top - 9 && y < r.bottom + 9;
    return near && !(x > r.left + 3 && x < r.right - 3 && y > r.top + 3 && y < r.bottom - 3);
  };
  document.addEventListener('pointerdown', (e) => {
    if (paused || drawing || tool || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || !target || e.target.closest?.(UI)) return;
    const edge = onEdge(target, e.clientX, e.clientY);
    if (target === editing ? !edge : !(target.contains(hit(e.target, e.clientX, e.clientY)) || edge)) return;
    press = { x: e.clientX, y: e.clientY };
    // On the grip of a block being typed, the press must not move the caret or start selecting words.
    if (target === editing) e.preventDefault();
  }, true);
  // The grab cursor shows where a press picks the selection up.
  document.addEventListener('mousemove', (e) => {
    document.documentElement.classList.toggle('ce-grip', !press && !paused && !!target && target === editing && onEdge(target, e.clientX, e.clientY));
  }, { passive: true });
  document.addEventListener('dragstart', (e) => { if (press) e.preventDefault(); }, true);
  document.addEventListener('pointermove', (e) => {
    if (!press) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
      // An only child moves with its nearest wrapper that has siblings (a lone paragraph in a quote moves the quote).
      let el = target;
      while (el.parentElement && el.parentElement !== document.body && kids(el.parentElement).length < 2) el = el.parentElement;
      if (!el.parentElement || el.parentElement === document.documentElement || kids(el.parentElement).length < 2) { press = null; return; }
      editing?.blur();
      if (el !== target) aim(el);
      getSelection()?.removeAllRanges();
      dragging = { el };
      document.documentElement.classList.add('ce-dragging');
      layer().append(dropLine);
    }
    e.preventDefault();
    // Near the top or bottom of the window the page scrolls, so a block can travel past the screen.
    const dy = e.clientY > innerHeight - 48 ? 24 : e.clientY < 48 ? -24 : 0;
    if (dy) scrollBy({ top: dy, behavior: 'instant' }); // instant: a smooth-scrolling site would stall on repeated calls
    dragging.spot = spot(dragging.el, e.clientX, e.clientY);
    dropLine.style.display = dragging.spot ? '' : 'none';
  }, true);
  document.addEventListener('pointerup', (e) => {
    if (!press) return;
    const d = dragging;
    press = dragging = null;
    dropLine.remove();
    document.documentElement.classList.remove('ce-dragging');
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    swallow();
    if (!d.spot) return;
    const { el } = d, p = el.parentElement, from = kids(p).indexOf(el), at = ref(el), loc = locOf(el);
    const back = { next: el.nextElementSibling, prev: el.previousElementSibling };
    if (d.spot.after) d.spot.k.after(el); else d.spot.k.before(el);
    const sibs = kids(p), to = sibs.indexOf(el);
    if (to === from) return;
    changes.push({ type: 'move', dir: 'drag', el, ...at, ...place(el), from: from + 1, back, r: { loc, to } });
    el.classList.add('ce-tweaked');
    tick();
  }, true);
  // Where a dragged block landed, in words: its position and the sibling it now follows (or precedes, when first).
  const place = (el) => {
    const sibs = kids(el.parentElement), to = sibs.indexOf(el);
    return { to: to + 1, of: sibs.length, ...(to > 0 ? { side: 'after', other: ref(sibs[to - 1]) } : { side: 'before', other: ref(sibs[1]) }) };
  };

  // ---------- Shift + drag to draw ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'ce-canvas';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const strokes = [];
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = T.line; ctx.fillStyle = T.line; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      if (s.shape !== 'arrow') continue;
      const [a, b] = [s.pts[Math.max(0, s.pts.length - 6)], s.pts[s.pts.length - 1]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - 18 * Math.cos(ang - .45), b[1] - 18 * Math.sin(ang - .45));
      ctx.lineTo(b[0] - 18 * Math.cos(ang + .45), b[1] - 18 * Math.sin(ang + .45)); ctx.closePath(); ctx.fill();
    }
  };
  const size = () => {
    const w = document.documentElement.scrollWidth, h = document.documentElement.scrollHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; draw(); }
  };
  new ResizeObserver(size).observe(document.body);
  size();
  const under = (px, py) => { const el = hit(document.elementFromPoint(px - scrollX, py - scrollY), px - scrollX, py - scrollY); return ours(el) ? null : el; };
  // Elements a loop covers: the smallest elements at a few points inside its box, deduplicated, at most 4.
  const covered = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const probes = [[.5, .5], [.25, .5], [.75, .5], [.5, .3], [.5, .7]].map(([fx, fy]) => [x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy]);
    const els = [...new Set(probes.map(([x, y]) => under(x, y)).filter(Boolean))];
    return els.filter((e) => !els.some((o) => o !== e && e.contains(o))).slice(0, 4).map(ref);
  };
  document.addEventListener('pointerdown', (e) => {
    if (paused || !(e.shiftKey || tool === 'draw') || e.button !== 0 || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    over?.classList.remove('ce-over'); over = null;
    drawing = { pts: [[e.pageX, e.pageY]] };
    strokes.push(drawing);
    document.documentElement.classList.add('ce-drawing');
  }, true);
  document.addEventListener('pointermove', (e) => { if (!drawing) return; drawing.pts.push([e.pageX, e.pageY]); draw(); }, true);
  document.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    const s = drawing; drawing = null;
    document.documentElement.classList.remove('ce-drawing');
    // A press without a drag is a normal click (select or type), even with Draw on.
    if (s.pts.length < 4) { strokes.pop(); draw(); return; }
    e.preventDefault(); e.stopPropagation();
    swallow();
    // Straight enough (end-to-end distance close to the path length) means an arrow.
    let len = 0;
    for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
    const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
    s.shape = Math.hypot(b[0] - a[0], b[1] - a[1]) > .8 * len ? 'arrow' : 'circle';
    draw();
    const c = s.shape === 'arrow'
      ? { type: 'mark', shape: 'arrow', from: ref(under(...a) ?? document.body), to: ref(under(...b) ?? document.body) }
      : { type: 'mark', shape: 'circle', covers: covered(s.pts) };
    c.stroke = s;
    c.r = { pts: s.pts, shape: s.shape };
    changes.push(c); tick();
    note(e.clientX, e.clientY, 'Your comment (optional)', (t) => { c.note = t; tick(); });
  }, true);

  // ---------- undo, pause, save ----------
  const undo = () => {
    const c = changes.pop();
    if (!c) return;
    if (c.type === 'text') { if (c.beforeHtml) c.el.innerHTML = c.beforeHtml; else c.el.innerText = c.before; c.el.classList.remove('ce-changed'); delete c.el.dataset.ceBefore; delete c.el.dataset.ceBeforeHtml; }
    if (c.type === 'remove') c.el.classList.remove('ce-removed');
    if (c.type === 'move' && c.back) { if (c.back.next) c.back.next.before(c.el); else c.back.prev?.after(c.el); }
    else if (c.type === 'move') { const sib = c.dir === 'up' ? c.el.nextElementSibling : c.el.previousElementSibling; if (sib) (c.dir === 'up' ? sib.after(c.el) : sib.before(c.el)); }
    if (c.type === 'style') { if (c.prev) c.el.style.setProperty(c.prop, c.prev); else c.el.style.removeProperty(c.prop); if (target === c.el && !panel.hidden) styles(c.el); }
    if (c.type === 'move' || c.type === 'style') c.el.classList.toggle('ce-tweaked', changes.some((x) => x.el === c.el && (x.type === 'style' || x.type === 'move')));
    if (c.type === 'comment') c.pin?.remove();
    if (c.type === 'mark') { strokes.splice(strokes.indexOf(c.stroke), 1); draw(); }
    sent = Math.min(sent, changes.length);
    tick();
  };
  const pause = () => {
    paused = !paused;
    editing?.blur(); aim(null);
    over?.classList.remove('ce-over'); over = null;
    const pb = bar.querySelector('[data-act=pause]');
    pb.innerHTML = svg(ICON[paused ? 'play' : 'pause']);
    pb.dataset.tip = pb.ariaLabel = paused ? 'Resume editing (Esc)' : 'Pause (Esc)';
    say(paused ? 'Paused. The page works like a visitor sees it.' : '');
  };
  const payload = () => changes.slice(sent).map(clean);
  // A two-button question in the editor's own style (no browser pop-up).
  const ask = (text, yes, no) => new Promise((done) => {
    document.getElementById('ce-note')?.remove();
    const box = document.createElement('div');
    box.id = 'ce-note';
    box.style.left = Math.max(8, innerWidth / 2 - 150) + 'px';
    // In phone view the bar sits over the frame's bottom, so the question goes near the top; the style panel closes so it can't cover it.
    box.style.top = (host ? 80 : Math.max(8, innerHeight - 220)) + 'px';
    if (!panel.hidden) styles(null);
    box.innerHTML = `<p>${text}</p><div><button data-n="no">${no}</button><button data-n="yes">${yes}</button></div>`;
    layer().append(box);
    box.addEventListener('click', (ev) => { const n = ev.target.dataset?.n; if (n) { box.remove(); done(n === 'yes'); } });
  });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // Unsaved edits other pages (or the phone view) left in localStorage.
  const otherUnsaved = () => ss((s) => Object.keys(s).filter((k) => k.startsWith('ce-unsaved:') && k !== KEY).map((k) => ({ k, ...JSON.parse(s.getItem(k)) })).filter((o) => o.changes?.length)) ?? [];
  // Publish asks the AI to release every page saved since the last publish; it warns first about unsaved and not-yet-applied changes on all pages.
  const publish = async () => {
    editing?.blur();
    const others = otherUnsaved(), mine = changes.length - sent;
    const unsaved = mine + others.reduce((n, o) => n + o.changes.length, 0), npages = others.length + (mine ? 1 : 0);
    if (unsaved > 0) {
      if (!(await ask(`You have ${plural(unsaved, 'unsaved change')}${npages > 1 ? ` on ${npages} pages` : ''}. Save ${unsaved > 1 ? 'them' : 'it'} first, then publish?`, 'Save and publish', 'Cancel'))) return;
      if (mine) { await save(); if (changes.length > sent) return say('Not saved, so nothing was published.'); }
      for (const o of others) {
        try { await post({ url: o.url, savedAt: new Date().toISOString(), viewport: o.viewport, ...(o.phone ? { phone: true } : {}), changes: o.changes.map(({ r, ...c }) => c) }); } catch (err) { return say(`Not saved: ${err.message}. Nothing was published.`); }
        ss((s) => s.removeItem(o.k));
      }
      if (others.length) { ss((s) => s.setItem('ce-saved', '1')); poll(); }
    }
    const st = await serverState();
    if (!st) return say('clickedit is not running. Ask your AI to open clickedit.');
    const pages = st.pages ?? [], waiting = pages.reduce((n, p) => n + p.waiting, 0) || st.pending;
    const list = pages.length ? `${plural(pages.length, 'page')} with saves (${pages.map((p) => new URL(p.url).pathname).join(', ')})` : 'this page';
    const q = waiting ? `Publish ${list}? Your AI has not applied ${plural(waiting, 'save')} yet; it applies them first, then deploys.` : `Publish ${list} live? Your AI deploys and checks the live pages.`;
    if (!(await ask(q, 'Publish', 'Not yet'))) return;
    try {
      const r = await fetch(SERVER + '/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: location.href }) });
      if (!(await r.json()).ok) throw new Error('refused');
      say('Publish asked. Your AI deploys it and checks the live page.');
    } catch (err) { say(`Publish not sent: ${err.message}.`); }
  };
  const save = async () => {
    editing?.blur();
    if (changes.length <= sent) return say('Nothing new to save.');
    const doc = { url: location.href, savedAt: new Date().toISOString(), viewport: `${innerWidth}x${innerHeight}`, ...(host ? { phone: true } : {}), changes: payload() };
    say('Saving...');
    try {
      const j = await post(doc);
      changes.slice(sent).forEach((c) => {
        c.at = j.at ?? Date.now();
        // The next edit of these words compares with what was just saved.
        if (c.type === 'text') { c.el.dataset.ceBefore = c.el.innerText; c.el.dataset.ceBeforeHtml = c.el.innerHTML; }
      });
      sent = changes.length;
      tick();
      ss((s) => s.setItem('ce-saved', '1'));
      say(`Saved ${doc.changes.length}. Your AI has them.`);
      poll();
    } catch (err) { say(`Not saved: ${err.message}. Ask your AI to open clickedit.`); }
  };
  const post = async (doc) => {
    const j = await (await fetch(SERVER + '/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) })).json();
    if (!j.ok) throw new Error(j.error);
    return j;
  };
  // No "Leave site?" prompt and no save on leaving: unsaved edits stay in localStorage and come back on the next open
  // of this page (a reload, the dev server reloading after the AI's edit, or a new tab). A beacon on pagehide would save
  // them AND restore them as unsaved, so they would reach the AI twice.
  const restore = () => {
    // Edits kept by the earlier build (sessionStorage) move over once.
    try { const old = sessionStorage.getItem(KEY); if (old) { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, old); sessionStorage.removeItem(KEY); } } catch { /* storage blocked */ }
    const saved = ss((s) => JSON.parse(s.getItem(KEY) || 'null'));
    if (!saved?.changes?.length) return;
    let n = 0;
    for (const { r = {}, ...d } of saved.changes) {
      const el = r.loc ? atLoc(r.loc) : null;
      const c = { ...d, el, r };
      if (d.type === 'mark' && r.pts) { c.stroke = { pts: r.pts, shape: r.shape }; strokes.push(c.stroke); }
      else if (d.type === 'comment') { if (el && ours(el)) c.el = null; }
      else if (!el || ours(el)) continue;
      else if (d.type !== 'text' && d.snippet && !snip(el).startsWith(d.snippet.slice(0, 30))) continue;
      else if (d.type === 'text') {
        // Skip words that no longer read as before (the AI may have applied them meanwhile).
        if (norm(el.innerText) !== norm(d.before)) continue;
        el.dataset.ceBefore = d.before;
        el.dataset.ceBeforeHtml = d.beforeHtml ?? el.innerHTML;
        if (d.afterHtml) el.innerHTML = d.afterHtml; else el.innerText = d.after;
        el.classList.add('ce-changed');
      } else if (d.type === 'remove') el.classList.add('ce-removed');
      else if (d.type === 'style') { c.prev = el.style.getPropertyValue(d.prop); el.style.setProperty(d.prop, d.after); el.classList.add('ce-tweaked'); }
      else if (d.type === 'move' && d.dir === 'drag') {
        const p = el.parentElement, sibs = kids(p).filter((x) => x !== el);
        c.back = { next: el.nextElementSibling, prev: el.previousElementSibling };
        if (sibs[r.to]) sibs[r.to].before(el); else sibs.at(-1)?.after(el);
        el.classList.add('ce-tweaked');
      } else if (d.type === 'move') { if (!step(c)) continue; }
      else continue;
      changes.push(c);
      if (d.type === 'comment' && r.x != null && !r.fixed) addPin(c, r.x, r.y, false);
      n++;
    }
    draw();
    tick();
    if (n) say(`Restored ${plural(n, 'unsaved change')}.`);
  };
  // Phone view: the same page at 390 x 844 in a frame, so the site's phone layout applies. The frame runs its own editor
  // (its saves are marked as phone edits) and puts its bar here, so this page's bar hides until Back.
  const phone = async () => {
    if (host) {
      editing?.blur();
      const left = changes.length - sent;
      if (left && await ask(`Save your ${plural(left, 'change')} in phone view first?`, 'Save and go back', 'Keep them for later')) { await save(); if (changes.length > sent) return; }
      return host.close();
    }
    editing?.blur(); aim(null); if (tool) setTool(tool);
    const ov = document.createElement('div');
    ov.id = 'ce-phone';
    const s = Math.min(1, (innerHeight - 110) / 844, (innerWidth - 32) / 390);
    ov.innerHTML = `<div class="ce-frame" style="transform:scale(${s.toFixed(3)})"><iframe title="Phone view of this page"></iframe></div>`;
    window.__cePhoneHost = { root: ov, close: () => { ov.remove(); delete window.__cePhoneHost; bar.style.display = ''; if (ss((x) => x.getItem('ce-saved'))) poll(); } };
    ov.querySelector('iframe').src = location.href;
    layer().append(ov);
    bar.style.display = 'none';
  };
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.getElementById('ce-note') || document.getElementById('ce-phone')) return;
    // Esc order: stop typing, clear the selection, turn off a tool, pause.
    if (editing) { e.preventDefault(); editing.blur(); return; }
    if (target) { aim(null); return; }
    if (tool) { setTool(tool); return; }
    if (!document.querySelector('dialog[open]')) pause();
  });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.k) act(b.dataset.k);
    if (b.dataset.tool === 'comment' && target && tool !== 'comment') { const r = target.getBoundingClientRect(); comment(target, r.left + 12, Math.max(12, r.top + 12)); }
    else if (b.dataset.tool) setTool(b.dataset.tool);
    if (b.dataset.act === 'undo') undo();
    if (b.dataset.act === 'pause') pause();
    if (b.dataset.act === 'save') save();
    if (b.dataset.act === 'publish') publish();
    if (b.dataset.act === 'phone') phone();
  });
  restore();
})();
