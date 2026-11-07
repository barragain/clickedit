#!/usr/bin/env node
// clickedit command line. Run with --help for the options.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { handle, markApplied } from './server.mjs';
import { createProxy } from './proxy.mjs';

const HELP = `clickedit: edit your local site in the browser, your AI applies the changes in the code.

  npx github:barragain/clickedit --proxy http://localhost:3000   open the printed address and edit (nothing to add to your project)
  npx github:barragain/clickedit                                 save server only, for the script tag mode
  npx github:barragain/clickedit --wait                          wait for the next save or publish request, print it, exit (for your AI)
  npx github:barragain/clickedit --applied                       mark every save as applied (the badge in the page turns green)

Options:
  --proxy <url>       your dev site; serves it with the toolbar added
  --proxy-port <n>    port for the proxy (default 4300)
  --port <n>          port for the save server (default 4399)
  --out <dir>         where saves go (default .clickedit in this folder)
`;

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
if (args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP); process.exit(0); }
const out = resolve(opt('--out', '.clickedit'));

if (args.includes('--applied')) {
  markApplied(out);
  console.log(`All saves in ${out} marked as applied.`);
} else if (args.includes('--wait')) {
  mkdirSync(out, { recursive: true });
  console.log(`Waiting for the next save or publish request in ${out}`);
  // The .md is written after the .json, so it marks a finished save.
  watch(out, (_, name) => {
    if (!name?.endsWith('.md')) return;
    setTimeout(() => {
      const file = join(out, name);
      console.log(`${name.startsWith('publish-') ? 'PUBLISH' : 'SAVED'} ${file}\n`);
      console.log(readFileSync(file, 'utf8'));
      process.exit(0);
    }, 150);
  });
} else {
  const port = Number(opt('--port', 4399)), target = opt('--proxy');
  const listen = (server, p) => new Promise((ok, fail) => server.once('error', fail).listen(p, '127.0.0.1', ok));
  const fail = (what, p) => (err) => { console.error(err.code === 'EADDRINUSE' ? `Port ${p} is in use (${what}). Pick another with ${what === 'proxy' ? '--proxy-port' : '--port'}.` : err.message); process.exit(1); };
  await listen(createServer((req, res) => handle(req, res, out)), port).catch(fail('save server', port));
  if (target) {
    try { new URL(target); } catch { console.error(`--proxy needs a full address, like http://localhost:3000`); process.exit(1); }
    const pport = Number(opt('--proxy-port', 4300));
    await listen(createProxy(target, out), pport).catch(fail('proxy', pport));
    console.log(`clickedit is on. Open http://localhost:${pport} to edit ${target}. Saves go to ${out}`);
  } else {
    console.log(`clickedit is on. Add <script src="http://localhost:${port}/clickedit.js" defer></script> to your dev page, or run with --proxy <your dev url>. Saves go to ${out}`);
  }
}
