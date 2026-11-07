import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localOrigin, publishText, summary } from '../skills/clickedit/scripts/server.mjs';

test('summary writes one readable line per change', () => {
  const md = summary({
    url: 'http://localhost:3000/pricing', savedAt: '2026-01-01T00:00:00.000Z', viewport: '1280x800', phone: true,
    changes: [
      { type: 'text', path: 'h1.title', snippet: 'Old', before: 'Old  title', after: 'New title' },
      { type: 'remove', path: 'section#faq' },
      { type: 'move', dir: 'up', path: 'li:nth-of-type(2)', other: { path: 'li:nth-of-type(1)', snippet: 'First' } },
      { type: 'move', dir: 'drag', path: 'li.a', from: 1, to: 3, of: 3, side: 'after', other: { path: 'li.c' } },
      { type: 'style', path: 'p.lead', prop: 'font-size', before: '16px', after: '20px' },
      { type: 'comment', path: 'a.cta', quote: 'Buy', note: 'make it bigger' },
      { type: 'mark', shape: 'circle', covers: [{ path: 'img.hero' }] },
      { type: 'mark', shape: 'arrow', from: { path: 'p.a' }, to: { path: 'p.b' }, note: 'move here' },
    ],
  });
  assert.match(md, /^# Edits for http:\/\/localhost:3000\/pricing/);
  assert.match(md, /phone view/);
  assert.match(md, /1\. TEXT at `h1\.title` \("Old"\)\n {3}before: "Old title"\n {3}after: {2}"New title"/);
  assert.match(md, /2\. REMOVE `section#faq`/);
  assert.match(md, /3\. MOVE `li:nth-of-type\(2\)` up \(now before `li:nth-of-type\(1\)` \("First"\)\)/);
  assert.match(md, /4\. MOVE `li\.a` by dragging, from position 1 to 3 of 3/);
  assert.match(md, /5\. STYLE on `p\.lead`: font-size 16px -> 20px/);
  assert.match(md, /6\. COMMENT on `a\.cta` about the words "Buy": make it bigger/);
  assert.match(md, /7\. CIRCLE around `img\.hero`/);
  assert.match(md, /8\. ARROW from `p\.a` to `p\.b`: move here/);
});

test('publish text lists pages and what is not applied', () => {
  const t = publishText('http://localhost:3000/', 'now', [{ url: 'http://localhost:3000/', saves: 2, changes: 1, waiting: 1, files: ['home-1.md'] }]);
  assert.match(t, /# PUBLISH REQUEST/);
  assert.match(t, /2 saves, 1 change, 1 not applied yet \(home-1\.md\)/);
  assert.match(publishText('http://x/', 'now', []), /- none/);
});

test('only local pages may save', () => {
  for (const o of ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:5173', 'http://app.localhost']) assert.ok(localOrigin(o), o);
  for (const o of ['https://example.com', 'http://localhost.evil.com', 'nonsense']) assert.ok(!localOrigin(o), o);
});
