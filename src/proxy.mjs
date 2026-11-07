// The proxy: forwards every request to your dev site and adds the toolbar to HTML pages, so nothing in your project
// changes. The toolbar and its API live under /__clickedit on the same origin. Websockets (hot reload) pass through.
import { createServer, request } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { handle } from './server.mjs';

export const PREFIX = '/__clickedit';
export const TAG = `<script src="${PREFIX}/clickedit.js" defer></script>`;

// Puts the toolbar tag before the last </body>, else at the end. Leaves a page that already loads it alone.
export function inject(html, tag = TAG) {
  if (html.includes('clickedit.js')) return html;
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i < 0 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}

const decode = (buf, enc) => (enc === 'gzip' ? gunzipSync(buf) : enc === 'br' ? brotliDecompressSync(buf) : enc === 'deflate' ? inflateSync(buf) : buf);

export function createProxy(target, out) {
  const t = new URL(target);
  const send = t.protocol === 'https:' ? httpsRequest : request;
  const server = createServer((req, res) => {
    if (req.url.startsWith(PREFIX + '/')) return handle(req, res, out, req.url.slice(PREFIX.length));
    const here = `http://${req.headers.host}`;
    // Ask for plain bytes so HTML can be edited; the decoder below covers servers that compress anyway.
    const headers = { ...req.headers, host: t.host, 'accept-encoding': 'identity' };
    if (headers.origin) headers.origin = t.origin;
    if (headers.referer) headers.referer = headers.referer.replace(here, t.origin);
    const up = send({ hostname: t.hostname, port: t.port || (t.protocol === 'https:' ? 443 : 80), method: req.method, path: req.url, headers }, (r) => {
      const h = { ...r.headers };
      if (h.location?.startsWith(t.origin)) h.location = here + h.location.slice(t.origin.length);
      if (!/text\/html/i.test(h['content-type'] ?? '') || req.method === 'HEAD') { res.writeHead(r.statusCode, h); return r.pipe(res); }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        let body;
        try { body = inject(decode(Buffer.concat(chunks), h['content-encoding']).toString('utf8')); } catch { body = null; }
        if (body === null) { res.writeHead(r.statusCode, h); return res.end(Buffer.concat(chunks)); }
        delete h['content-encoding']; delete h['content-length']; delete h['transfer-encoding']; delete h.etag;
        res.writeHead(r.statusCode, h);
        res.end(body);
      });
    });
    up.on('error', (err) => { if (res.headersSent) return res.destroy(); res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`clickedit could not reach ${target}: ${err.message}\nIs your dev server running?`); });
    req.pipe(up);
  });
  // Hot reload: pass the websocket upgrade straight to the dev server and pipe both ways.
  server.on('upgrade', (req, sock, head) => {
    const port = Number(t.port) || (t.protocol === 'https:' ? 443 : 80);
    const up = t.protocol === 'https:' ? tlsConnect({ host: t.hostname, port, servername: t.hostname }) : connect(port, t.hostname);
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
    up.on(t.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i];
        lines.push(`${k}: ${/^host$/i.test(k) ? t.host : /^origin$/i.test(k) ? t.origin : req.rawHeaders[i + 1]}`);
      }
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head?.length) up.write(head);
      sock.pipe(up).pipe(sock);
    });
  });
  return server;
}
