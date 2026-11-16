// Tiny gatekeeper for the test tunnel: only POST /api/sms/inbound is forwarded to Relay.
// Everything else (login, pages, other APIs) gets 404, so the tunnel exposes nothing else.
import http from 'node:http';
const TARGET = 'http://127.0.0.1:3000';
http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/sms/inbound') { res.writeHead(404).end('Not found'); return; }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 65536) { res.writeHead(413).end(); return; } chunks.push(c); }
  try {
    const r = await fetch(TARGET + '/api/sms/inbound', { method: 'POST', headers: { 'content-type': req.headers['content-type'] || 'text/plain' }, body: Buffer.concat(chunks) });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' }).end(await r.text());
    console.log(new Date().toISOString(), 'forwarded', r.status);
  } catch { res.writeHead(502).end(); }
}).listen(3200, '127.0.0.1', () => console.log('gate on 127.0.0.1:3200 -> ' + TARGET));
