// Records the README clips against the demo site through the proxy, then makes an MP4 and a GIF of each with ffmpeg.
// Needs Playwright (with Chromium) and ffmpeg. Playwright is not a dependency of clickedit: install it anywhere and
// point PLAYWRIGHT_FROM at that project's package.json if it is not in this folder.
//   node scripts/record-media.mjs [clip ...]
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM || join(root, 'package.json'))('playwright');
const media = join(root, 'media'), raw = mkdtempSync(join(tmpdir(), 'clickedit-rec-')), out = join(raw, 'saves');
const W = 1280, H = 800, DEMO = 3010, PROXY = 4310, SAVE = 4311;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bin = join(root, 'bin', 'clickedit.mjs');

const kids = [
  spawn(process.execPath, [join(root, 'examples/demo/serve.mjs')], { env: { ...process.env, PORT: String(DEMO) } }),
  spawn(process.execPath, [bin, '--proxy', `http://localhost:${DEMO}`, '--proxy-port', String(PROXY), '--port', String(SAVE), '--out', out]),
];
process.on('exit', () => kids.forEach((k) => k.kill()));
await sleep(800);

// A visible pointer, since recorded video has none. It sits outside <body> so the editor never picks it.
const CURSOR = () => {
  const paint = (x, y) => { const c = document.getElementById('rec-cursor'); if (c) c.style.transform = `translate(${x}px,${y}px)`; };
  if (window.top !== window) {
    addEventListener('mousemove', (e) => { const r = frameElement.getBoundingClientRect(), s = r.width / innerWidth; parent.__recPaint?.(r.left + e.clientX * s, r.top + e.clientY * s); }, true);
    return;
  }
  window.__recPaint = paint;
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = 'rec-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:-3px;top:-2px;z-index:2147483647;pointer-events:none;transition:none;transform:translate(640px,420px)';
    document.documentElement.append(c);
  });
  addEventListener('mousemove', (e) => paint(e.clientX, e.clientY), true);
  addEventListener('mousedown', () => { const c = document.getElementById('rec-cursor'); c?.animate([{ scale: 1 }, { scale: .8 }, { scale: 1 }], { duration: 260 }); }, true);
};

async function record(name, fn) {
  const ctx = await (await browser).newContext({ viewport: { width: W, height: H }, recordVideo: { dir: raw, size: { width: W, height: H } } });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`http://localhost:${PROXY}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#ce-edit');
  let x = 640, y = 420;
  const move = async (tx, ty, steps = 22) => { await page.mouse.move(tx, ty, { steps }); x = tx; y = ty; };
  const box = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const at = async (loc, dx = 0, dy = 0) => { const c = await box(loc); await move(c.x + dx, c.y + dy); return c; };
  const click = async (loc, opts = {}, dx = 0, dy = 0) => { await at(loc, dx, dy); await sleep(120); await page.mouse.click(x, y, opts); };
  // The middle of one word inside an element, for a double-click that selects it.
  const word = (loc, w) => loc.evaluate((el, w) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) { const i = n.data.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } }
    return null;
  }, w);
  const type = (t) => page.keyboard.type(t, { delay: 70 });
  const scrollTo = async (sel) => { await page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: 'center' }), sel); await sleep(900); };
  const away = async () => { await move(40, 300); await page.mouse.click(40, 300); };
  await sleep(500);
  const start = (Date.now() - t0) / 1000;
  await fn({ page, move, box, at, click, word, type, scrollTo, away, sleep });
  await sleep(500);
  const check = await CHECKS[name](page);
  const dur = (Date.now() - t0) / 1000 - start;
  const video = await page.video().path();
  await ctx.close();
  return { name, video, start, dur, check };
}

const pause = (ms = 600) => sleep(ms);
const CLIPS = {
  async hero({ page, click, word, type, move, away }) {
    const h1 = page.locator('h1');
    await click(h1);
    const w = await word(h1, 'ten');
    await move(w.x, w.y, 10); await page.mouse.dblclick(w.x, w.y);
    await type('five '); await away();
    await click(page.locator('.lead'), { button: 'right' });
    await type('Shorter, please'); await pause(200);
    await click(page.locator('#ce-note [data-n=ok]'));
    await click(page.locator('[data-act=save]'));
    await page.waitForFunction(() => /waiting/.test(document.querySelector('.ce-badge')?.textContent ?? ''));
    await pause(300);
    execFileSync(process.execPath, [bin, '--applied', '--out', out]);
    await page.waitForFunction(() => /All applied/.test(document.querySelector('.ce-badge')?.textContent ?? ''), null, { timeout: 8000 });
    await pause(600);
  },
  async 'edit-text'({ page, click, word, type, move, away }) {
    const h1 = page.locator('h1');
    await click(h1);
    const w = await word(h1, 'ten');
    await move(w.x, w.y, 10); await page.mouse.dblclick(w.x, w.y);
    await type('five '); await pause(300); await away(); await pause(500);
    await click(page.locator('.hero .btn').first());
    await page.keyboard.press('Control+A'); await type('Try Harbor free'); await pause(300);
    await away(); await pause(700);
  },
  async comment({ page, click, type, scrollTo, at }) {
    await scrollTo('#features');
    await click(page.locator('.feature').nth(2).locator('p'), { button: 'right' });
    await pause(300); await type('Say what time the recap arrives'); await pause(300);
    await click(page.locator('#ce-note [data-n=ok]'));
    await pause(500); await at(page.locator('.ce-pin').first()); await pause(900);
  },
  async draw({ page, click, type, scrollTo, move }) {
    await scrollTo('#pricing');
    await click(page.locator('[data-tool=draw]'));
    const p = (await page.locator('.plan-main .price').boundingBox());
    const cx = p.x + 70, cy = p.y + p.height / 2, rx = 120, ry = 46;
    await move(cx + rx, cy);
    await page.mouse.down();
    for (let a = 0; a <= Math.PI * 2.1; a += 0.12) await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a), { steps: 2 });
    await page.mouse.up();
    await pause(300); await type('Show the yearly price too'); await pause(200);
    await click(page.locator('#ce-note [data-n=ok]'));
    const a = await page.locator('.plan').first().locator('.btn').boundingBox();
    const b = await page.locator('.plan-main h3').boundingBox();
    await move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await move(b.x + 20, b.y + b.height / 2, 30);
    await page.mouse.up();
    await pause(300); await type('Point people to Team'); await pause(200);
    await click(page.locator('#ce-note [data-n=ok]'));
    await pause(600);
  },
  async drag({ page, click, scrollTo, move }) {
    await scrollTo('#how');
    const friday = page.locator('.steps li').nth(2);
    await click(friday, {}, 120, 0);
    await page.keyboard.press('Escape'); await pause(400);
    const f = await friday.boundingBox(), m = await page.locator('.steps li').first().boundingBox();
    await move(f.x + f.width / 2, f.y + f.height / 2, 8);
    await page.mouse.down();
    await move(f.x + f.width / 2, m.y + 4, 40);
    await page.mouse.up();
    await pause(900);
  },
  async style({ page, click, scrollTo, move, type }) {
    await scrollTo('#features');
    const card = page.locator('.feature').first();
    const c = await card.boundingBox();
    await move(c.x + c.width - 16, c.y + 14); await page.mouse.click(c.x + c.width - 16, c.y + 14);
    await pause(300);
    await click(page.locator('[data-k=style]'));
    await pause(400);
    const range = page.locator('#ce-style input[type=range][data-p=padding-block]');
    const r = await range.boundingBox();
    const from = r.x + r.width * (24 / 160), to = r.x + r.width * (56 / 160);
    await move(from, r.y + r.height / 2); await page.mouse.down();
    await move(to, r.y + r.height / 2, 25); await page.mouse.up();
    await pause(300);
    await click(page.locator('#ce-style input[type=number][data-p=font-size]'));
    await page.keyboard.press('Control+A'); await type('19');
    await pause(900);
  },
  async phone({ page, click, type, move, away }) {
    await click(page.locator('[data-act=phone]'));
    await pause(1200);
    const f = page.frameLocator('#ce-phone iframe');
    const h1 = f.locator('h1');
    await h1.waitFor();
    await click(h1, {}, 0, 0);
    await page.keyboard.press('End'); await type(', on your phone');
    await move(40, 300); await pause(900);
  },
  async publish({ page, click, word, type, move, away }) {
    const h1 = page.locator('h1');
    await click(h1);
    const w = await word(h1, 'week');
    await move(w.x, w.y, 10); await page.mouse.dblclick(w.x, w.y);
    await type('month '); await away();
    await click(page.locator('[data-act=save]'));
    await page.waitForFunction(() => /waiting/.test(document.querySelector('.ce-badge')?.textContent ?? ''));
    await pause(400);
    await click(page.locator('[data-act=publish]'));
    await page.locator('#ce-note p').waitFor();
    await pause(1800);
    await click(page.locator('#ce-note [data-n=no]'));
    await pause(500);
  },
};

// What each clip must have done, so a clip that ran but did nothing is caught without watching it.
const txt = (page, sel) => page.locator(sel).first().innerText();
const CHECKS = {
  hero: async (p) => (await txt(p, 'h1')).includes('in five minutes') && (await txt(p, '.ce-badge')) === 'All applied',
  'edit-text': async (p) => (await txt(p, 'h1')).includes('in five minutes') && (await txt(p, '.hero .btn')) === 'Try Harbor free',
  comment: async (p) => (await p.locator('.ce-pin').count()) === 1,
  draw: async (p) => (await txt(p, '.ce-count')) === '2',
  drag: async (p) => (await txt(p, '.steps li')).startsWith('Friday') && (await txt(p, '.ce-count')) === '1',
  style: async (p) => (await p.locator('.feature').first().evaluate((e) => e.style.paddingBlock + ' ' + e.style.fontSize)) !== ' ',
  phone: async (p) => (await p.frameLocator('#ce-phone iframe').locator('h1').innerText()).includes('on your phone'),
  publish: async (p) => !readdirSync(out).some((n) => n.startsWith('publish-')) && (await p.locator('#ce-note').count()) === 0,
};

const browser = chromium.launch();
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
mkdirSync(media, { recursive: true });
for (const name of want) {
  rmSync(out, { recursive: true, force: true });
  const { video, start, dur, check } = await record(name, CLIPS[name]);
  const mp4 = join(media, `${name}.mp4`), gif = join(media, `${name}.gif`);
  const fps = name === 'hero' ? 15 : 12;
  // The hero loop runs a little faster so it stays under 8 seconds (the badge polls every 3 s).
  const speed = name === 'hero' ? 1.2 : 1, sp = speed === 1 ? '' : `setpts=PTS/${speed},`;
  const cut = ['-ss', start.toFixed(2), '-t', dur.toFixed(2), '-i', video];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...cut, ...(sp ? ['-vf', sp.slice(0, -1)] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', '-an', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...cut, '-vf', `${sp}fps=${fps},scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, gif]);
  console.log(`${name}: ${check ? 'did what it shows' : 'CHECK FAILED'}, ${(dur / speed).toFixed(1)} s, mp4 ${(statSync(mp4).size / 1e6).toFixed(2)} MB, gif ${(statSync(gif).size / 1e6).toFixed(2)} MB`);
}
await (await browser).close();
rmSync(raw, { recursive: true, force: true });
process.exit(0);
