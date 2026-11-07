import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { handle } from '../skills/clickedit/scripts/server.mjs';

const cli = fileURLToPath(new URL('../skills/clickedit/scripts/clickedit.mjs', import.meta.url));
const run = async (out, ...args) => (await promisify(execFile)(process.execPath, [cli, ...args, '--out', out], { timeout: 5000 })).stdout;

test('a save made while the AI applies the last one is not skipped', async () => {
  const out = mkdtempSync(join(tmpdir(), 'clickedit-loop-'));
  const server = createServer((req, res) => handle(req, res, out)).listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const save = (word, savedAt) => fetch(base + '/save', { method: 'POST', body: JSON.stringify({ url: 'http://localhost:4300/', savedAt, viewport: '1280x800', changes: [{ type: 'text', path: 'h1', before: 'old', after: word }] }) }).then((r) => r.json());
  const status = () => fetch(base + '/status').then((r) => r.json());
  try {
    assert.ok((await save('first', 'A')).ok);
    const a = await run(out, '--wait');
    assert.match(a, /^SAVED .*home-A\.md/);
    assert.match(a, /after: {2}"first"/);
    await new Promise((ok) => setTimeout(ok, 20));
    assert.ok((await save('second', 'B')).ok); // the user saves again while the AI is still applying A
    assert.match(await run(out, '--applied'), /up to home-A\.md.*1 newer save is still waiting/);
    const st = await status();
    assert.equal(st.pending, 1);
    assert.equal(st.pages[0].waiting, 1);
    assert.match(await run(out, '--next'), /^SAVED .*home-B\.md/); // the look-only form for agents without background waits
    const b = await run(out, '--wait');
    assert.match(b, /^SAVED .*home-B\.md/);
    assert.match(b, /after: {2}"second"/);
    await run(out, '--applied');
    assert.equal((await status()).pending, 0);
    assert.match(await run(out, '--next'), /^Nothing waiting/);
    await assert.rejects(run(out, '--applied', 'nope.md'), /No save named nope\.md/);
  } finally { server.close(); }
});
