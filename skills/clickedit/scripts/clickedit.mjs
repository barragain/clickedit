#!/usr/bin/env node
// clickedit command line. Run with --help for the options.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { handle, markApplied, pendingFiles } from './server.mjs';
import { createProxy } from './proxy.mjs';

const HELP = `clickedit: edit your local site in the browser, your AI applies the changes in the code.

  npx github:barragain/clickedit --proxy http://localhost:3000   open the printed address and edit (nothing to add to your project)
  npx github:barragain/clickedit                                 save server only, for the script tag mode
  npx github:barragain/clickedit --wait                          wait for the next save or publish request, print it, exit (for your AI)
  npx github:barragain/clickedit --next                          print the oldest save not applied yet, or say nothing is waiting
  npx github:barragain/clickedit --applied [file]                mark saves applied up to the one --wait printed, or up to [file]

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
  const file = opt('--applied');
  try {
    const name = markApplied(out, file?.startsWith('--') ? undefined : file);
    const left = pendingFiles(out).filter((n) => !n.startsWith('publish-')).length;
    console.log(`${name ? `Saves up to ${name}` : 'All saves'} in ${out} marked as applied.${left ? ` ${left} newer save${left > 1 ? 's are' : ' is'} still waiting: the next --wait prints ${left > 1 ? 'them one by one' : 'it'} at once.` : ''}`);
  } catch (err) { console.error(err.message); process.exit(1); }
} else if (args.includes('--wait') || args.includes('--next')) {
  mkdirSync(out, { recursive: true });
  // Prints the oldest save or publish request not applied yet, so a save made while the AI was busy is never skipped.
  let printed = false;
  const printNext = () => {
    const name = !printed && pendingFiles(out)[0];
    if (!name) return false;
    printed = true;
    writeFileSync(join(out, '.last-printed'), name + '\n');
    const head = `${name.startsWith('publish-') ? 'PUBLISH' : 'SAVED'} ${join(out, name)}\n\n`;
    // Exit once the text is out: on some systems a pipe is still writing when the process ends.
    process.stdout.write(head + readFileSync(join(out, name), 'utf8') + '\n', () => process.exit(0));
    return true;
  };
  // The .md is written after the .json, so it marks a finished save. Watch first, then look, so nothing slips between.
  // --next only looks, for agents that can't wait in the background.
  if (args.includes('--next')) { if (!printNext()) console.log(`Nothing waiting in ${out}.`); }
  else {
    let timer;
    watch(out, (_, name) => { if (name?.endsWith('.md')) { clearTimeout(timer); timer = setTimeout(printNext, 150); } });
    if (!printNext()) console.log(`Waiting for the next save or publish request in ${out}`);
  }
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
