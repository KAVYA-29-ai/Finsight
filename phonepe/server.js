import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addMoney, clearDemoData, createEmi, getState, reseedDemoData, storeReceipt, storeTransaction } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg']
]);

/**
 * Sends a JSON response.
 * @param {import('node:http').ServerResponse} res - HTTP response.
 * @param {number} statusCode - HTTP status code.
 * @param {object} payload - JSON payload to send.
 */
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/**
 * Sends a text response.
 * @param {import('node:http').ServerResponse} res - HTTP response.
 * @param {number} statusCode - HTTP status code.
 * @param {string} text - Text to send.
 * @param {string} [contentType='text/plain; charset=utf-8'] - Content type of the response.
 */
function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(text);
}

/**
 * Reads and parses a JSON request body.
 * @param {import('node:http').IncomingMessage} req - Incoming request stream.
 * @returns {Promise<object>} Parsed JSON body.
 */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/**
 * Serves a static asset from the PhonePe public directory.
 * @param {import('node:http').ServerResponse} res - HTTP response.
 * @param {string} pathname - Request path.
 * @returns {Promise<void>}
 */
async function serveStatic(res, pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(normalized).replace(/^([.][.][/\\])+/, '');
  const filePath = path.resolve(publicDir, '.' + safePath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(file);
  } catch {
    if (pathname === '/' || pathname === '/index.html') {
      sendText(res, 500, 'Missing public/index.html');
      return;
    }
    sendText(res, 404, 'Not found');
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, { ok: true, data: getState() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/wallet/add') {
    try {
      const body = await readBody(req);
      const wallet = addMoney(body.amount);
      sendJson(res, 200, { ok: true, wallet, data: getState() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/transactions') {
    try {
      const body = await readBody(req);
      const transaction = storeTransaction(body, true);
      sendJson(res, 200, { ok: true, transaction, data: getState() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/receipts') {
    try {
      const body = await readBody(req);
      const receipt = storeReceipt(body);
      sendJson(res, 200, { ok: true, receipt, data: getState() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/emis') {
    try {
      const body = await readBody(req);
      const emi = createEmi(body);
      sendJson(res, 200, { ok: true, emi, data: getState() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/report') {
    const report = getState().dashboard;
    sendJson(res, 200, { ok: true, data: report });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/reset') {
    const state = clearDemoData();
    sendJson(res, 200, { ok: true, data: state });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/reseed') {
    const state = reseedDemoData();
    sendJson(res, 200, { ok: true, data: state });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(res, url.pathname);
    return;
  }

  sendText(res, 405, 'Method not allowed');
});

server.listen(port, () => {
  console.log(`PhonePe local app running at http://localhost:${port}`);
});
