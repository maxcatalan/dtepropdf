// Local dev API server — mirrors the Vercel serverless functions at /api/*
// Usage: npm run server   (Terminal 1)
//        npm run dev      (Terminal 2 — Vite proxies /api/* to this server)

import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(join(__dirname, '.env.local'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* .env.local not found — using existing env */ }

const PORT = 3001;

const ROUTES = {
  '/api/gemini-ocr':    () => import('./api/gemini-ocr.js'),
  '/api/custom-ocr':    () => import('./api/custom-ocr.js'),
  '/api/credits':       () => import('./api/credits.js'),
  '/api/detect-config': () => import('./api/detect-config.js'),
  '/api/refine-result': () => import('./api/refine-result.js'),
  '/api/api-keys':      () => import('./api/api-keys.js'),
  '/api/extract':       () => import('./api/extract.js'),
};

async function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

function shimRes(nodeRes) {
  const h = {};
  let code = 200;
  let sent = false;

  const r = {
    status(c)        { code = c; return r; },
    setHeader(k, v)  { h[k] = v; return r; },
    json(data) {
      if (sent) return r;
      sent = true;
      h['Content-Type'] = 'application/json';
      for (const [k, v] of Object.entries(h)) nodeRes.setHeader(k, v);
      nodeRes.writeHead(code);
      nodeRes.end(JSON.stringify(data));
      return r;
    },
    end() {
      if (sent) return r;
      sent = true;
      for (const [k, v] of Object.entries(h)) nodeRes.setHeader(k, v);
      nodeRes.writeHead(code);
      nodeRes.end('');
      return r;
    },
  };
  return r;
}

http.createServer(async (req, nodeRes) => {
  // CORS for local Vite dev server
  nodeRes.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  nodeRes.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { nodeRes.writeHead(204); nodeRes.end(); return; }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname  = parsedUrl.pathname;
  const load = ROUTES[pathname];

  if (!load) { nodeRes.writeHead(404); nodeRes.end('Not found'); return; }

  const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
  const body  = (!isMultipart && req.method !== 'GET' && req.method !== 'DELETE')
    ? await parseBody(req)
    : {};
  const query = Object.fromEntries(parsedUrl.searchParams.entries());
  // For multipart, pass the raw Node req so busboy can pipe from it
  const shimReq = { method: req.method, headers: req.headers, body, query,
    pipe: isMultipart ? (dest) => req.pipe(dest) : undefined,
  };
  const shimmedRes = shimRes(nodeRes);

  try {
    const { default: handler } = await load();
    await handler(shimReq, shimmedRes);
  } catch (err) {
    console.error(`[${pathname}]`, err);
    shimmedRes.status(500).json({ error: err.message });
  }
}).listen(PORT, () => {
  console.log(`API dev server → http://localhost:${PORT}`);
});
