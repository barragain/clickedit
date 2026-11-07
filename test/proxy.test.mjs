import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createProxy, inject, TAG } from '../skills/clickedit/scripts/proxy.mjs';

test('inject puts the tag before the last </body>', () => {
  assert.equal(inject('<html><body><p>x</p></BODY></html>'), `<html><body><p>x</p>${TAG}</BODY></html>`);
  assert.equal(inject('<p>no body</p>'), `<p>no body</p>${TAG}`);
  const already = `<body><script src="/x/clickedit.js"></script></body>`;
  assert.equal(inject(already), already);
});

const listen = (s) => new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s.address().port)));

test('proxy injects into HTML (also gzipped), passes other files, serves the toolbar and saves', async (t) => {
  const site = createServer((req, res) => {
    if (req.url === '/gz') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); return res.end(gzipSync('<body>gz</body>')); }
    if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('console.log("</body>")'); }
    if (req.url === '/go') { res.writeHead(302, { location: `http://127.0.0.1:${sitePort}/` }); return res.end(); }
    const b = `<body>enc:${req.headers['accept-encoding']}</body>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(b) });
    res.end(b);
  });
  const sitePort = await listen(site);
  const out = mkdtempSync(join(tmpdir(), 'clickedit-'));
  const proxy = createProxy(`http://127.0.0.1:${sitePort}`, out);
  const p = await listen(proxy);
  t.after(() => { site.close(); proxy.close(); });
  const base = `http://127.0.0.1:${p}`;

  const home = await (await fetch(base + '/')).text();
  assert.equal(home, `<body>enc:identity${TAG}</body>`);
  assert.equal(await (await fetch(base + '/gz')).text(), `<body>gz${TAG}</body>`);
  assert.equal(await (await fetch(base + '/app.js')).text(), 'console.log("</body>")');
  const go = await fetch(base + '/go', { redirect: 'manual' });
  assert.equal(go.headers.get('location'), `http://127.0.0.1:${p}/`);
  assert.match(await (await fetch(base + '/__clickedit/clickedit.js')).text(), /__clickedit/);

  const save = await fetch(base + '/__clickedit/save', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: `http://localhost:${p}` },
    body: JSON.stringify({ url: `http://localhost:${p}/about/`, savedAt: '2026-01-01T00:00:00.000Z', viewport: '800x600', changes: [{ type: 'remove', path: 'p' }] }),
  });
  assert.equal(save.status, 200);
  assert.deepEqual(readdirSync(out).sort(), ['about-2026-01-01T00-00-00-000Z.json', 'about-2026-01-01T00-00-00-000Z.md']);
  const status = await (await fetch(base + '/__clickedit/status')).json();
  assert.equal(status.pending, 1);

  const evil = await fetch(base + '/__clickedit/save', { method: 'POST', headers: { origin: 'https://example.com' }, body: '{}' });
  assert.equal(evil.status, 403);
});
