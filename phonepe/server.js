import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  getCurrentWalletState,
  getSupabaseHealthSnapshot,
  insertEmiRecord,
  insertMoneyTransaction,
  insertReceiptHistory,
  insertWalletEvent,
  isSupabaseConfigured,
  readPhonepeStateSnapshot,
  readSupabaseCommonDataSnapshot,
  updateWalletBalance
} from '../shared/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PHONEPE_PORT || process.env.PORT || 3000);

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

function normalizeTransactionMode(rawType) {
  const value = String(rawType || '').trim().toLowerCase();
  if (!value) return 'upi';

  const cashLike = new Set(['cash']);
  if (cashLike.has(value)) return 'cash';

  const onlineLike = new Set(['upi', 'online', 'phonepe', 'gpay', 'paytm', 'netbanking', 'card']);
  if (onlineLike.has(value)) return 'upi';

  return 'upi';
}

function inferNeedOrWant({ category, name, explicit }) {
  const normalizedExplicit = String(explicit || '').trim().toLowerCase();
  if (normalizedExplicit === 'need' || normalizedExplicit === 'want') {
    return normalizedExplicit;
  }

  const normalizedCategory = String(category || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim().toLowerCase();

  const categoryNeeds = new Set(['utilities', 'groceries', 'health', 'transport', 'transportation', 'bills', 'education', 'rent']);
  if (categoryNeeds.has(normalizedCategory)) {
    return 'need';
  }

  const nameNeeds = ['hospital', 'medical', 'pharmacy', 'school', 'college', 'electricity', 'water bill', 'gas bill', 'metro', 'bus', 'uber', 'ola'];
  if (nameNeeds.some((token) => normalizedName.includes(token))) {
    return 'need';
  }

  return 'want';
}

function buildReportFromState(state) {
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const needSpend = transactions.filter((row) => row.needOrWant === 'need').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const wantSpend = transactions.filter((row) => row.needOrWant === 'want').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const topCategory = Object.entries(state.categoryTotals || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || null;

  return {
    summary: {
      generatedAt: Date.now(),
      walletBalance: Number(state.wallet?.balance || 0),
      transactionSpend: Number(state.monthlySpent || 0),
      upiSpend: transactions.filter((row) => String(row.type || '').toLowerCase() === 'upi').reduce((sum, row) => sum + Number(row.amount || 0), 0),
      receiptSpend: Number(state.trackedReceiptSpent || 0),
      trackedSpend: Number(state.combinedMonthlySpent || 0),
      needSpend,
      wantSpend,
      receiptCount: receipts.length,
      topCategory,
      dailySeries: [],
      suggestions: []
    },
    suggestions: [],
    report: {
      filename: `finsight-report-${Date.now()}.txt`,
      generatedAt: Date.now(),
      text: 'Report generated from Supabase transaction and receipt history.'
    }
  };
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
  
  // CORS headers for frontend on different domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const data = await readPhonepeStateSnapshot();
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/common/state') {
    const snapshot = await readSupabaseCommonDataSnapshot();
    if (!snapshot.connected) {
      sendJson(res, 503, { ok: false, error: snapshot.message || 'Supabase is not configured.' });
      return;
    }
    sendJson(res, 200, { ok: true, data: snapshot.state });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/common/ledger') {
    const snapshot = await readSupabaseCommonDataSnapshot();
    if (!snapshot.connected) {
      sendJson(res, 503, { ok: false, error: snapshot.message || 'Supabase is not configured.' });
      return;
    }
    sendJson(res, 200, { ok: true, data: snapshot.ledger });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/common/data') {
      const supabaseSnapshot = await readSupabaseCommonDataSnapshot();
      if (!supabaseSnapshot.connected) {
        sendJson(res, 503, { ok: false, error: supabaseSnapshot.message || 'Supabase is not configured.' });
        return;
      }
      sendJson(res, 200, { ok: true, data: supabaseSnapshot });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/supabase/health') {
    const data = await getSupabaseHealthSnapshot();
    sendJson(res, 200, { ok: true, data });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/common/state') {
    sendJson(res, 405, { ok: false, error: 'Direct common state mutation is disabled. Use domain APIs.' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/wallet/add') {
    try {
      if (!isSupabaseConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Supabase is not configured.' });
        return;
      }
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number.');
      }
      const current = await getCurrentWalletState();
      const nextBalance = Number(current.balance || 0) + amount;
      const wallet = await updateWalletBalance(nextBalance);
      await insertWalletEvent({ source: 'phonepe', eventType: 'topup', amount, balance: nextBalance, note: 'Wallet top-up' });
      const data = await readPhonepeStateSnapshot();
      sendJson(res, 200, { ok: true, wallet, data });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/transactions') {
    try {
      if (!isSupabaseConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Supabase is not configured.' });
        return;
      }
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Amount must be a positive number.');
      }

      const transactionRow = await insertMoneyTransaction({
        source: 'phonepe',
        kind: 'payment',
        name: body.name || 'Transaction',
        amount,
        category: body.category || 'Others',
        type: normalizeTransactionMode(body.type),
        needOrWant: inferNeedOrWant({
          category: body.category,
          name: body.name,
          explicit: body.needOrWant
        }),
        gst: body.gst || '',
        note: body.note || ''
      });

      const current = await getCurrentWalletState();
      const nextBalance = Number(current.balance || 0) - amount;
      await updateWalletBalance(nextBalance);
      await insertWalletEvent({ source: 'phonepe', eventType: 'spend', amount: -amount, balance: nextBalance, note: `Transaction: ${body.name || 'Transaction'}` });
      const data = await readPhonepeStateSnapshot();
      sendJson(res, 200, {
        ok: true,
        transaction: {
          id: transactionRow.id,
          name: transactionRow.name,
          amount: Number(transactionRow.amount || 0),
          category: transactionRow.category,
          type: transactionRow.type,
          needOrWant: transactionRow.need_or_want,
          gst: transactionRow.gst || '',
          timestamp: transactionRow.created_at ? new Date(transactionRow.created_at).getTime() : Date.now()
        },
        data
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/receipts') {
    try {
      if (!isSupabaseConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Supabase is not configured.' });
        return;
      }
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Amount must be a valid number.');
      }
      const receiptRow = await insertReceiptHistory({
        source: 'phonepe',
        merchant: body.merchant || body.name || 'Unknown Merchant',
        amount,
        category: body.category || 'Others',
        note: body.note || '',
        entrySource: body.source || 'manual',
        fileName: body.fileName || '',
        fileType: body.fileType || ''
      });
      const data = await readPhonepeStateSnapshot();
      sendJson(res, 200, {
        ok: true,
        receipt: {
          id: receiptRow.id,
          merchant: receiptRow.merchant,
          amount: Number(receiptRow.amount || 0),
          category: receiptRow.category,
          note: receiptRow.note || '',
          source: receiptRow.entry_source || 'manual',
          fileName: receiptRow.file_name || '',
          fileType: receiptRow.file_type || '',
          timestamp: receiptRow.created_at ? new Date(receiptRow.created_at).getTime() : Date.now()
        },
        data
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/emis') {
    try {
      if (!isSupabaseConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Supabase is not configured.' });
        return;
      }
      const body = await readBody(req);
      const amount = Number(body.amount || 0);
      const dueDate = Number(body.dueDate || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('EMI amount must be positive.');
      }
      if (!Number.isFinite(dueDate) || dueDate <= 0) {
        throw new Error('EMI dueDate is required.');
      }
      const emiRow = await insertEmiRecord({
        source: 'phonepe',
        name: body.name || 'EMI',
        amount,
        dueDate
      });
      const data = await readPhonepeStateSnapshot();
      sendJson(res, 200, {
        ok: true,
        emi: {
          id: emiRow.id,
          name: emiRow.name,
          amount: Number(emiRow.amount || 0),
          dueDate: Number(emiRow.due_date || dueDate)
        },
        data
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/report') {
    if (!isSupabaseConfigured()) {
      sendJson(res, 503, { ok: false, error: 'Supabase is not configured.' });
      return;
    }
    const state = await readPhonepeStateSnapshot();
    const report = buildReportFromState(state);
    sendJson(res, 200, { ok: true, data: report });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(res, url.pathname);
    return;
  }

  sendText(res, 405, 'Method not allowed');
});

server.listen(port, () => {
  console.log(`PhonePe app running at http://localhost:${port}`);
});
