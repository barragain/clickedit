// The save server: serves the toolbar, writes each save as <page>-<time>.json plus a readable .md for the AI,
// reports which saves the AI has applied, and records publish requests. Everything stays on this computer.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TOOLBAR = join(here, 'clickedit.js');
const mtime = (out, n) => (existsSync(join(out, n)) ? statSync(join(out, n)).mtimeMs : 0);

// The time of the newest save the AI has applied. .applied holds that save's file time, so a save made while
// the AI was still applying stays newer and keeps waiting. Older .applied files hold a date: use their own time.
export function appliedAt(out) {
  if (!existsSync(join(out, '.applied'))) return 0;
  const t = Number(readFileSync(join(out, '.applied'), 'utf8').trim());
  return Number.isFinite(t) ? t : mtime(out, '.applied');
}

// Saves and publish requests the AI has not handled yet, oldest first.
export function pendingFiles(out) {
  mkdirSync(out, { recursive: true });
  const done = appliedAt(out);
  return readdirSync(out).filter((n) => n.endsWith('.md') && mtime(out, n) > done).sort((a, b) => mtime(out, a) - mtime(out, b));
}

// Every page with saves since the last Publish (the newest publish-*.md marks it), and how many the AI hasn't applied.
export function pagesSincePublish(out) {
  mkdirSync(out, { recursive: true });
  const names = readdirSync(out), done = appliedAt(out);
  const last = Math.max(0, ...names.filter((n) => n.startsWith('publish-')).map((n) => mtime(out, n)));
  const by = {};
  for (const n of names.filter((x) => x.endsWith('.json') && mtime(out, x) > last)) {
    try {
      const d = JSON.parse(readFileSync(join(out, n), 'utf8')), u = new URL(d.url), md = n.replace(/\.json$/, '.md');
      const p = (by[u.origin + u.pathname] ??= { url: u.origin + u.pathname, saves: 0, changes: 0, waiting: 0, files: [] });
      p.saves++; p.changes += d.changes.length; p.files.push(md);
      if (mtime(out, md) > done) p.waiting++;
    } catch { /* a half-written or foreign file is not a save */ }
  }
  return Object.values(by);
}

export function publishText(url, at, pages) {
  const list = pages.length
    ? pages.map((p) => `- ${p.url}: ${p.saves} save${p.saves > 1 ? 's' : ''}, ${p.changes} change${p.changes > 1 ? 's' : ''}, ${p.waiting ? `${p.waiting} not applied yet` : 'all applied'} (${p.files.join(', ')})`).join('\n')
    : `- none (no saves since the last publish; publish ${url} as it is)`;
  return `# PUBLISH REQUEST\nClicked on: ${url}\nAsked: ${at}\nPages with saves since the last publish:\n${list}\nThe user clicked Publish in clickedit. Apply any pending saves first (the user already approved them), mark them applied with clickedit --applied, then deploy the way this project deploys and check each live page. Report back.\n`;
}

const cut = (s, n = 90) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const where = (t) => `\`${t.path}\`${t.snippet ? ` ("${cut(t.snippet, 60)}")` : ''}`;

// One readable line per change, so the edits can be applied without opening the JSON.
export function summary(doc) {
  const lines = [`# Edits for ${doc.url}`, `Saved ${doc.savedAt}, viewport ${doc.viewport}${doc.phone ? ' (phone view: these edits are for the mobile layout)' : ''}`, ''];
  doc.changes.forEach((c, i) => {
    const n = `${i + 1}.`;
    if (c.type === 'text') lines.push(`${n} TEXT at ${where(c)}\n   before: "${cut(c.before, 400)}"\n   after:  "${cut(c.after, 400)}"${c.afterHtml ? `\n   html after (bold/italic): ${cut(c.afterHtml, 600)}` : ''}`);
    else if (c.type === 'remove') lines.push(`${n} REMOVE ${where(c)}`);
    else if (c.type === 'move' && c.dir === 'drag') lines.push(`${n} MOVE ${where(c)} by dragging, from position ${c.from} to ${c.to} of ${c.of} among its siblings (now ${c.side} ${where(c.other)})`);
    else if (c.type === 'style') lines.push(`${n} STYLE on ${where(c)}: ${c.prop} ${c.before} -> ${c.after}`);
    else if (c.type === 'move') lines.push(`${n} MOVE ${where(c)} ${c.dir} (now ${c.dir === 'up' ? 'before' : 'after'} ${where(c.other)})`);
    else if (c.type === 'comment') lines.push(`${n} COMMENT on ${where(c)}${c.quote ? ` about the words "${cut(c.quote, 300)}"` : ''}: ${c.note}`);
    else if (c.type === 'mark') lines.push(`${n} ${c.shape.toUpperCase()} ${c.shape === 'arrow' ? `from ${where(c.from)} to ${where(c.to)}` : `around ${c.covers.map(where).join(', ')}`}${c.note ? `: ${c.note}` : ''}`);
    else lines.push(`${n} ${JSON.stringify(c)}`);
  });
  return lines.join('\n') + '\n';
}

// Marks every save up to `file` as applied (default: the one --wait printed last, else the newest). Returns its name.
export function markApplied(out, file) {
  mkdirSync(out, { recursive: true });
  const last = existsSync(join(out, '.last-printed')) ? readFileSync(join(out, '.last-printed'), 'utf8').trim() : '';
  const name = file ? basename(file) : last || readdirSync(out).filter((n) => n.endsWith('.md')).sort((a, b) => mtime(out, b) - mtime(out, a))[0];
  if (name && !existsSync(join(out, name))) throw new Error(`No save named ${name} in ${out}`);
  writeFileSync(join(out, '.applied'), `${Math.max(appliedAt(out), name ? mtime(out, name) : 0)}\n`);
  return name;
}

// Only pages on this computer may save: any website you visit could otherwise post text for your AI to act on.
export const localOrigin = (o) => { try { return /^(localhost|127(\.\d+){3}|\[::1\]|.+\.localhost)$/.test(new URL(o).hostname); } catch { return false; } };

const readBody = (req, max) => new Promise((ok, fail) => {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > max) { fail(new Error('too large')); req.destroy(); } });
  req.on('end', () => ok(body));
});

// Handles the toolbar and the API. `path` is the request path with any /__clickedit prefix already removed.
export async function handle(req, res, out, path = req.url) {
  const origin = req.headers.origin;
  if (origin && localOrigin(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  const json = (code, o) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && path.startsWith('/clickedit.js')) {
    res.setHeader('content-type', 'text/javascript');
    res.setHeader('cache-control', 'no-store');
    return res.end(readFileSync(TOOLBAR));
  }
  // Saves the AI hasn't applied yet: *.md newer than the time in .applied (clickedit --applied writes it).
  if (req.method === 'GET' && path === '/status') {
    const pending = pendingFiles(out).filter((n) => !n.startsWith('publish-')).length;
    // `out` tells an AI whether a clickedit already running belongs to its project.
    // Applying: --wait handed a save to the AI (.last-printed) and --applied hasn't marked it yet.
    // Publishing: a Publish click the AI hasn't finished (it runs --applied on it after checking the live page).
    // Unpublished: saves since the last Publish, applied on the preview but not live yet.
    const done = appliedAt(out), last = existsSync(join(out, '.last-printed')) ? readFileSync(join(out, '.last-printed'), 'utf8').trim() : '';
    const applying = Boolean(pending && last && mtime(out, last) > done);
    const publishing = pendingFiles(out).some((n) => n.startsWith('publish-'));
    const pages = pagesSincePublish(out);
    return json(200, { pending, applying, publishing, unpublished: pages.length > 0, applied: done, out, pages });
  }
  if (req.method === 'POST' && (path === '/save' || path === '/publish')) {
    if (origin && !localOrigin(origin)) return json(403, { ok: false, error: 'only local pages can save' });
    try {
      const doc = JSON.parse(await readBody(req, path === '/save' ? 5e6 : 1e5));
      mkdirSync(out, { recursive: true });
      if (path === '/publish') {
        const at = new Date().toISOString();
        const file = join(out, `publish-${at.replace(/[:.]/g, '-')}.md`);
        writeFileSync(file, publishText(String(doc.url), at, pagesSincePublish(out)));
        console.log(`PUBLISH ${file}`);
        return json(200, { ok: true });
      }
      if (!Array.isArray(doc.changes) || !doc.changes.length) throw new Error('no changes');
      const slug = new URL(doc.url).pathname.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '_') || 'home';
      const base = join(out, `${slug}-${String(doc.savedAt).replace(/[^\w-]+/g, '-')}`);
      writeFileSync(`${base}.json`, JSON.stringify(doc, null, 2));
      writeFileSync(`${base}.md`, summary(doc));
      console.log(`SAVED ${base}.md (${doc.changes.length} changes)`);
      return json(200, { ok: true, file: `${base}.md`, at: statSync(`${base}.md`).mtimeMs });
    } catch (err) { return json(400, { ok: false, error: err.message }); }
  }
  res.statusCode = 404; res.end();
}
