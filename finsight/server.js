import http from 'node:http';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const marketplaceDbPath = path.join(__dirname, 'finsight.db');
const port = Number(process.env.PORT || 3001);
const envPath = path.join(__dirname, '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
const marketplaceDb = new DatabaseSync(marketplaceDbPath);
let monthlyBudget = 1000000000;
let lastSeenTransactionCount = 0;
const geminiCache = {
  receipt: new Map(),
  parsedReceiptByFile: new Map(),
  insights: { key: '', at: 0, data: null }
};

async function loadEnvFile() {
  const files = [envPath, rootEnvPath];
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
          continue;
        }

        const equalsIndex = trimmed.indexOf('=');
        const key = trimmed.slice(0, equalsIndex).trim();
        const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Optional env file.
    }
  }
}

function initializeMarketplaceSchema() {
  marketplaceDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      brand TEXT NOT NULL,
      originalValue REAL NOT NULL,
      askingPrice REAL NOT NULL,
      platformFee REAL NOT NULL,
      sellerNote TEXT,
      expiry TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      timestamp INTEGER NOT NULL
    );
  `);
}

function insertMarketplaceListing({ type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry }) {
  const result = marketplaceDb
    .prepare(
      'INSERT INTO marketplace_listings (type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, 'active', Date.now());

  const row = marketplaceDb
    .prepare(
      'SELECT id, type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp FROM marketplace_listings WHERE id = ?'
    )
    .get(result.lastInsertRowid);

  const snapshot = {
    id: String(row.id),
    type: String(row.type),
    brand: String(row.brand),
    originalValue: toRupeeNumber(Number(row.originalValue || 0)),
    askingPrice: toRupeeNumber(Number(row.askingPrice || 0)),
    platformFee: toRupeeNumber(Number(row.platformFee || 0)),
    sellerNote: String(row.sellerNote || ''),
    expiry: String(row.expiry || ''),
    status: String(row.status || 'active'),
    timestamp: Number(row.timestamp || Date.now())
  };
}

function listActiveMarketplaceListings() {
  const rows = marketplaceDb
    .prepare(
      'SELECT id, type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp FROM marketplace_listings WHERE status = ? ORDER BY timestamp DESC'
    )
    .all('active');

  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    brand: String(row.brand),
    originalValue: toRupeeNumber(Number(row.originalValue || 0)),
    askingPrice: toRupeeNumber(Number(row.askingPrice || 0)),
    platformFee: toRupeeNumber(Number(row.platformFee || 0)),
    sellerNote: String(row.sellerNote || ''),
    expiry: String(row.expiry || ''),
    status: String(row.status || 'active'),
    timestamp: Number(row.timestamp || Date.now())
  }));
}

function computePlatformFee(askingPrice) {
  if (askingPrice <= 0) return 0;
  if (askingPrice < 500) return toRupeeNumber(Math.min(10, Math.max(5, askingPrice * 0.02)));
  if (askingPrice <= 2000) return toRupeeNumber(Math.min(25, Math.max(15, askingPrice * 0.015)));
  return toRupeeNumber(askingPrice * 0.02);
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(text);
}

async function serveStatic(res, pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(publicDir, '.' + path.normalize(normalized));

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
    sendText(res, 404, 'Not found');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function guessMerchantFromFilename(filename) {
  const base = String(filename || '').replaceAll(/[_-]+/g, ' ').replaceAll(/\.[^.]+$/g, '').trim();
  return base ? base.slice(0, 50) : 'Unknown Merchant';
}

function estimateAmountFromFileSize(fileSize, filename) {
  const amountMatch = String(filename || '').match(/(\d{2,6})/);
  if (amountMatch) {
    const value = Number(amountMatch[1]);
    if (value >= 10 && value <= 200000) {
      return value;
    }
  }
  const kb = Math.max(Number(fileSize || 0) / 1024, 1);
  return toRupeeNumber(Math.min(25000, 120 + kb * 3.2));
}

function autoCategory(merchant, amount) {
  const text = String(merchant || '').toLowerCase();
  if (text.includes('zomato') || text.includes('swiggy') || text.includes('food')) return 'Food';
  if (text.includes('uber') || text.includes('ola') || text.includes('travel')) return 'Travel';
  if (text.includes('amazon') || text.includes('flipkart') || text.includes('shopping')) return 'Shopping';
  if (Number(amount || 0) >= 7000) return 'Rent';
  return 'Others';
}

function validateGst(gstNumber) {
  const value = String(gstNumber || '').toUpperCase().trim();
  if (!value) {
    return { valid: false, reason: 'GST number missing' };
  }
  if (!/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(value)) {
    return { valid: false, reason: 'GST format invalid' };
  }
  return { valid: true, reason: 'GST verified' };
}

function normalizeCategory(category) {
  const raw = String(category || '').trim().toLowerCase();
  if (!raw) return 'Others';
  const map = new Map([
    ['food', 'Food'],
    ['transport', 'Transport'],
    ['travel', 'Transport'],
    ['shopping', 'Shopping'],
    ['entertainment', 'Entertainment'],
    ['health', 'Health'],
    ['education', 'Education'],
    ['utilities', 'Utilities'],
    ['rent', 'Utilities'],
    ['others', 'Others']
  ]);
  return map.get(raw) || 'Others';
}

function inferNeedOrWant(category) {
  const value = normalizeCategory(category);
  const needCategories = new Set(['Transport', 'Health', 'Education', 'Utilities']);
  return needCategories.has(value) ? 'need' : 'want';
}

function normalizeEntryAction(entryAction, paymentMode) {
  const raw = String(entryAction || '').toLowerCase();
  const valid = new Set(['track_only', 'deduct_only', 'track_and_deduct']);
  const resolved = valid.has(raw) ? raw : 'track_only';

  if (paymentMode !== 'upi' && (resolved === 'deduct_only' || resolved === 'track_and_deduct')) {
    return 'track_only';
  }

  return resolved;
}

function resolveAmount(inputAmount, fileSize, filename) {
  const manualAmount = Number(inputAmount);
  if (Number.isFinite(manualAmount) && manualAmount > 0) {
    return toRupeeNumber(manualAmount);
  }
  return estimateAmountFromFileSize(fileSize, filename);
}

function parseFirstJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object returned by Gemini');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callGeminiJson({ model, prompt, inlineData }) {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: inlineData
          ? [
              { text: prompt },
              {
                inlineData: {
                  mimeType: inlineData.mimeType || 'image/jpeg',
                  data: inlineData.data
                }
              }
            ]
          : [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  };

  const preferredModel = model || process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const candidates = [
    preferredModel,
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b-latest'
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  const apiVersions = ['v1beta', 'v1'];

  let lastError = null;
  for (const candidateModel of candidates) {
    for (const version of apiVersions) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Gemini request failed (${version}/${candidateModel}): ${errorText.slice(0, 180)}`);
        if (response.status === 404) {
          continue;
        }
        if (response.status === 429) {
          throw lastError;
        }
        continue;
      }

      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
      return parseFirstJsonObject(text);
    }
  }

  throw (lastError || new Error('Gemini request failed for all candidate models'));
}

async function extractReceiptWithGemini({ filename, merchantHint, fileBase64, mimeType }) {
  if (!fileBase64 || !process.env.GEMINI_API_KEY) {
    return null;
  }

  const key = `${filename || 'receipt'}:${String(fileBase64).slice(0, 72)}`;
  if (geminiCache.receipt.has(key)) {
    return geminiCache.receipt.get(key);
  }

  const prompt = [
    'Extract bill details from this receipt image and return only JSON.',
    'Use format:',
    '{"merchant_name":"","amount":0,"category":"Food|Transport|Shopping|Entertainment|Health|Education|Utilities|Others","gst_number":"","gst_rate":0,"confidence":0}',
    `File name: ${filename || 'unknown'}`,
    `Merchant hint: ${merchantHint || 'none'}`,
    'Rules: amount should be final payable total. If unsure keep amount 0. Confidence between 0 and 1.'
  ].join('\n');

  try {
    const result = await callGeminiJson({
      prompt,
      inlineData: { data: fileBase64, mimeType: mimeType || 'image/jpeg' }
    });

    const normalized = {
      merchant_name: String(result?.merchant_name || merchantHint || guessMerchantFromFilename(filename)).trim(),
      amount: toRupeeNumber(Number(result?.amount || 0)),
      category: normalizeCategory(result?.category || ''),
      gst_number: String(result?.gst_number || '').toUpperCase().trim() || null,
      gst_rate: toRupeeNumber(Number(result?.gst_rate || 0)),
      confidence: Number(result?.confidence || 0)
    };

    geminiCache.receipt.set(key, normalized);
    return normalized;
  } catch {
    return null;
  }
}

async function buildGeminiInsightsPayload(input) {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const payloadKey = JSON.stringify({
    ms: input.monthlySpent,
    ts: input.todaySpent,
    ws: input.wantsSpent,
    ns: input.needsSpent,
    bl: input.budgetLeft,
    fc: input.forecast?.predicted,
    cnt: input.entryCount
  });

  const nowMs = Date.now();
  if (geminiCache.insights.key === payloadKey && nowMs - geminiCache.insights.at < 60 * 1000) {
    return geminiCache.insights.data;
  }

  const prompt = [
    'You are a friendly financial coach for Indian users. Your goal is to provide actionable, personalized, and encouraging advice. Return only JSON.',
    'The user lives in India, so use rupees (₹) and Indian finance context.',
    'Your response must follow this exact JSON format: {"tips": ["string", ...], "future_alerts": [{"priority": "Low|Medium|High|Critical", "title": "string", "message": "string"}, ...], "warning": "string|null", "need_want_insight": "string"}',
    '---',
    'USER\'S FINANCIAL SNAPSHOT:',
    `Monthly total spent: ₹${input.monthlySpent}`,
    `Spent today: ₹${input.todaySpent}`,
    `Spending on Needs: ₹${input.needsSpent}`,
    `Spending on Wants: ₹${input.wantsSpent}`,
    `Budget remaining: ₹${input.budgetLeft}`,
    `Current financial health score: ${input.healthScore}/100`,
    `Predicted spend for next month: ₹${input.forecast?.predicted || 0}`,
    '---',
    'YOUR TASK:',
    '1.  **Tips**: Provide 4 short, practical, and encouraging tips. The tips should be directly related to the user\'s snapshot. For example, if "Wants" spending is high, suggest a specific way to manage it.',
    '2.  **Future Alerts**: Identify 3 potential future financial problems based on the data. Assign a "priority" (Low, Medium, High, Critical). The "title" should be a concise summary of the risk. The "message" should explain the risk and suggest a clear, single action to mitigate it.',
    '3.  **Warning**: If the user is on track to exceed their budget, provide a brief, non-alarming warning message. Otherwise, this should be null.',
    '---',
    'RULES:',
    '- Be encouraging and not judgmental.',
    '- All text should be in simple, clear English.',
    '- Do not invent new JSON fields. Stick to the specified format.'
  ].join('\n');

  try {
    const ai = await callGeminiJson({ prompt });
    const normalized = {
      tips: Array.isArray(ai?.tips) ? ai.tips.map((tip) => String(tip)).filter(Boolean).slice(0, 5) : [],
      future_alerts: Array.isArray(ai?.future_alerts)
        ? ai.future_alerts
            .map((alert) => ({
              priority: ['low', 'medium', 'critical'].includes(String(alert?.priority || '').toLowerCase())
                ? String(alert.priority).replace(/^\w/, (ch) => ch.toUpperCase())
                : 'Medium',
              title: String(alert?.title || '').trim(),
              message: String(alert?.message || '').trim()
            }))
            .filter((alert) => alert.title && alert.message)
            .slice(0, 4)
        : [],
      warning: String(ai?.warning || '').trim() || null,
      need_want_insight: String(ai?.need_want_insight || '').trim() || null
    };

    geminiCache.insights = { key: payloadKey, at: nowMs, data: normalized };
    return normalized;
  } catch {
    return null;
  }
}

async function phonepeRequest(pathname, method = 'GET', body = null) {
  const response = await fetch(`http://localhost:3000${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    const message = payload.error || payload.message || `PhonePe request failed: ${pathname}`;
    throw new Error(message);
  }
  return payload;
}

async function recordTrackedExpense({ merchant, amount, category, transactionType, entryAction, note, fileName = '', fileType = '', needOrWant = 'want' }) {
  const normalizedCategory = normalizeCategory(category || autoCategory(merchant, amount));
  const mode = String(transactionType || 'cash').toLowerCase() === 'upi' ? 'upi' : 'cash';
  const action = normalizeEntryAction(entryAction, mode);
  const shouldCreatePayment = action === 'deduct_only' || action === 'track_and_deduct';
  const shouldTrackReceipt = action === 'track_only' || action === 'track_and_deduct';
  let receiptSource = 'cash-tracked';

  if (shouldTrackReceipt) {
    receiptSource = mode === 'upi' ? 'upi-linked' : 'cash-tracked';
  }

  if (shouldCreatePayment) {
    await phonepeRequest('/api/transactions', 'POST', {
      name: merchant,
      amount: toRupeeNumber(amount),
      category: normalizedCategory,
      type: mode,
      gst: ''
    });
  }

  if (shouldTrackReceipt) {
    await phonepeRequest('/api/receipts', 'POST', {
      merchant,
      amount: toRupeeNumber(amount),
      category: normalizedCategory,
      note,
      source: receiptSource,
      fileName,
      fileType,
      needOrWant
    });
  }

  const snapshot = {
    category: normalizedCategory,
    mode,
    action,
    receiptSource,
    shouldCreatePayment,
    shouldTrackReceipt
  };

  return snapshot;
}

function parseCsvRow(line) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const peek = line[i + 1];
      if (quoted && peek === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function buildReceiptRowsFromCsvText(text, fallbackMerchant = 'CSV Imported Bill') {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rawLines.length) {
    return [];
  }

  const firstCells = parseCsvRow(rawLines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstCells.some((cell) => ['merchant', 'name', 'amount', 'category'].includes(cell));
  const startIndex = hasHeader ? 1 : 0;
  const merchantIndex = hasHeader ? firstCells.findIndex((cell) => cell === 'merchant' || cell === 'name') : 0;
  const amountIndex = hasHeader ? firstCells.findIndex((cell) => cell === 'amount') : 1;
  const categoryIndex = hasHeader ? firstCells.findIndex((cell) => cell === 'category') : 2;

  const rows = [];
  for (let index = startIndex; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const cells = parseCsvRow(line);

    const merchant = String(cells[merchantIndex] || fallbackMerchant).trim() || fallbackMerchant;
    const amount = Number(String(cells[amountIndex] || '').replaceAll(/[^0-9.\-]/g, ''));
    const category = normalizeCategory(cells[categoryIndex] || autoCategory(merchant, amount));

    rows.push({ line: index + 1, merchant, amount, category });
  }

  return rows;
}

function toRupeeNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function monthKeyFromMs(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function dateKeyFromMs(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function lastSevenDateKeys() {
  const today = new Date();
  const keys = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function computeHealth(monthlySpent, todaySpent, wantsSpent, monthlyLimit, balance) {
  const usage = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;
  const wantsRatio = monthlySpent > 0 ? (wantsSpent / monthlySpent) * 100 : 0;
  let score = 100;
  const reasons = [];

  if (usage >= 90) {
    score -= 28;
    reasons.push('Budget is almost exhausted');
  } else if (usage >= 75) {
    score -= 15;
    reasons.push('Budget usage is rising fast');
  }

  if (wantsRatio >= 65) {
    score -= 18;
    reasons.push('Most spending is going to wants');
  }

  if (balance < 1000) {
    score -= 14;
    reasons.push('Emergency fund is low');
  }

  if (todaySpent > (monthlyLimit / 30) * 1.8) {
    score -= 12;
    reasons.push('Today burn is above safe daily pace');
  }

  const snapshot = {
    score: Math.max(0, Math.min(100, Math.round(score))),
    budget_usage_percent: toRupeeNumber(usage),
    today_spent: toRupeeNumber(todaySpent),
    daily_safe_cap: toRupeeNumber(monthlyLimit / 30),
    wants_ratio_percent: toRupeeNumber(wantsRatio),
    active_emi_commitment: 0,
    reasons: reasons.slice(0, 4)
  };

  return snapshot;
}

function buildAlerts(health, budgetLeft, monthlySpent, monthlyLimit) {
  const alerts = [];

  if (health.score < 55) {
    alerts.push({
      priority: 'Critical',
      tag_color: 'red',
      title: 'Financial health risk',
      message: 'Health score is low. Pause non-essential spending for 72 hours.'
    });
  }

  if (monthlyLimit > 0 && (monthlySpent / monthlyLimit) * 100 >= 75) {
    alerts.push({
      priority: 'Medium',
      tag_color: 'yellow',
      title: 'Budget watch',
      message: 'You are entering high burn zone. Tighten daily cap.'
    });
  }

  if (budgetLeft < 1500) {
    alerts.push({
      priority: 'Low',
      tag_color: 'green',
      title: 'Buffer reminder',
      message: 'Keep a small emergency buffer before your next bill cycle.'
    });
  }

  return alerts;
}

function buildFutureAlerts({ predictedNextMonth, monthlyBudgetLimit, averageDaily, wantsSharePercent }) {
  const alerts = [];
  const forecastUsage = monthlyBudgetLimit > 0 ? (predictedNextMonth / monthlyBudgetLimit) * 100 : 0;

  if (forecastUsage >= 95) {
    alerts.push({ priority: 'Critical', title: 'Next month budget overshoot risk', message: 'Current run-rate can exceed next month budget. Pre-plan a strict wants cap.' });
  } else if (forecastUsage >= 80) {
    alerts.push({ priority: 'Medium', title: 'Forecast trending high', message: 'Spending trend is heavy. Move some wants to weekend-only budget.' });
  } else {
    alerts.push({ priority: 'Low', title: 'Forecast is stable', message: 'Spending trend looks controllable with current pace.' });
  }

  if (wantsSharePercent >= 60) {
    alerts.push({ priority: 'Medium', title: 'Wants ratio alert', message: 'Wants are dominating. Reduce one impulse category for next month buffer.' });
  }

  if (averageDaily > 0) {
    const projectedDaily = toRupeeNumber(predictedNextMonth / 30);
    alerts.push({ priority: 'Low', title: 'Daily target for next month', message: `Try keeping daily spend near Rs ${Math.round(projectedDaily)}.` });
  }

  return alerts.slice(0, 4);
}

function buildNeedWantInsight({ needsShare, wantsShare, needsSpent, wantsSpent, monthlySpent }) {
  if (monthlySpent <= 0) {
    return 'Start with a few tracked expenses so AI can generate Need vs Want insights.';
  }

  if (wantsShare >= 75) {
    return `Wants are ${toRupeeNumber(wantsShare)}% of total spend. Pause one impulse category this week.`;
  }

  if (wantsShare >= 55) {
    return `Wants are higher than needs (${toRupeeNumber(wantsSpent)} vs ${toRupeeNumber(needsSpent)}). Set a weekly wants cap.`;
  }

  if (needsShare >= 70) {
    return `Needs are dominant at ${toRupeeNumber(needsShare)}%. Keep this discipline and avoid rebound spending.`;
  }

  return `Need vs Want split is balanced (${toRupeeNumber(needsShare)}% / ${toRupeeNumber(wantsShare)}%). Maintain this ratio.`;
}

function buildNextMonthForecast(entries, monthlySpent, now, monthlyBudgetLimit) {
  const last30Start = new Date(now);
  last30Start.setDate(now.getDate() - 29);

  const recentEntries = entries.filter((item) => new Date(item.timestamp_ms) >= last30Start);
  const recentDays = new Map();

  for (const item of recentEntries) {
    const key = dateKeyFromMs(item.timestamp_ms);
    recentDays.set(key, Number(recentDays.get(key) || 0) + Number(item.amount || 0));
  }

  const dayValues = [...recentDays.values()];
  const sortedValues = dayValues.slice().sort((a, b) => a - b);
  const elapsedDays = Math.max(now.getDate(), 1);
  const baselineDaily = monthlySpent / elapsedDays;
  const median = sortedValues.length
    ? sortedValues[Math.floor(sortedValues.length / 2)]
    : baselineDaily;

  const average = sortedValues.length
    ? sortedValues.reduce((sum, value) => sum + value, 0) / sortedValues.length
    : baselineDaily;

  const p90 = sortedValues.length
    ? sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * 0.9))]
    : baselineDaily;

  const robustDaily = Math.min(Math.max((average * 0.55) + (median * 0.45), baselineDaily * 0.85), p90 * 1.1 || baselineDaily);
  const blendedDaily = toRupeeNumber((baselineDaily * 0.7) + (robustDaily * 0.3));
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const daysInNextMonth = nextMonthEnd.getDate();
  const baselineMonthProjection = toRupeeNumber(baselineDaily * daysInNextMonth);
  const rawPredicted = toRupeeNumber(blendedDaily * daysInNextMonth);
  const upperFromTrend = baselineMonthProjection * 1.28;
  const upperFromBudget = monthlyBudgetLimit > 0 ? monthlyBudgetLimit * 1.85 : upperFromTrend;
  const predicted = toRupeeNumber(
    Math.min(
      Math.max(rawPredicted, baselineMonthProjection * 0.78),
      Math.min(upperFromTrend, upperFromBudget)
    )
  );
  const suggestedBudget = toRupeeNumber(Math.max(monthlyBudgetLimit, predicted * 1.07));

  const snapshot = {
    days_in_next_month: daysInNextMonth,
    daily_run_rate: blendedDaily,
    predicted,
    suggested_budget: suggestedBudget,
    confidence: dayValues.length >= 14 ? 'high' : dayValues.length >= 7 ? 'medium' : 'low',
    month_name: nextMonthStart.toLocaleDateString('en-IN', { month: 'long' })
  };

  return snapshot;
}

function buildDailyExpenseReport(entries) {
  const grouped = new Map();
  const sortedEntries = [...entries].sort((left, right) => right.timestamp_ms - left.timestamp_ms);

  for (const item of sortedEntries) {
    const key = dateKeyFromMs(item.timestamp_ms);
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        total: 0,
        upi_total: 0,
        cash_total: 0,
        entries: []
      });
    }

    const bucket = grouped.get(key);
    const amount = toRupeeNumber(item.amount);
    bucket.total = toRupeeNumber(bucket.total + amount);
    if (item.payment_mode === 'upi') {
      bucket.upi_total = toRupeeNumber(bucket.upi_total + amount);
    } else {
      bucket.cash_total = toRupeeNumber(bucket.cash_total + amount);
    }

    bucket.entries.push({
      id: item.id,
      time: new Date(item.timestamp_ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      name: item.custom_name,
      category: item.category,
      amount,
      payment_mode: item.payment_mode,
      source_type: item.source_type,
      need_or_want: item.need_or_want
    });
  }

  return [...grouped.values()].slice(0, 21);
}

async function fetchSharedState() {
  try {
    const payload = await phonepeRequest('/api/state');
    const data = payload.data || {};
    const transactions = (data.transactions || []).map((item) => ({
      id: Number(item.id || 0),
      amount: Number(item.amount || 0),
      category: normalizeCategory(item.category),
      custom_name: String(item.name || item.custom_name || 'Transaction'),
      type: Number(item.amount || 0) > 0 ? 'Debit' : 'Credit',
      payment_mode: item.type === 'cash' ? 'cash' : 'upi',
      source_type: 'payment',
      is_emi: 0,
      emi_months: 0,
      emi_status: 'active',
      need_or_want: String(item.needOrWant || inferNeedOrWant(item.category)).toLowerCase(),
      timestamp_ms: Number(item.timestamp || Date.now())
    }));

    const receipts = (data.receipts || []).map((item) => ({
      id: Number(item.id || 0),
      amount: Number(item.amount || 0),
      category: normalizeCategory(item.category),
      custom_name: String(item.merchant || item.custom_name || 'Tracked receipt'),
      type: 'Tracked',
      source_type: String(item.source || 'cash-tracked'),
      payment_mode: String(item.source || '') === 'upi-linked' ? 'upi' : 'cash',
      is_emi: 0,
      emi_months: 0,
      emi_status: 'active',
      need_or_want: inferNeedOrWant(item.category),
      timestamp_ms: Number(item.timestamp || Date.now())
    }));

    const entries = [...transactions, ...receipts].sort((left, right) => right.timestamp_ms - left.timestamp_ms);
    return {
      ok: true,
      walletBalance: Number(data.wallet?.balance || 0),
      transactions,
      receipts,
      entries
    };
  } catch {
    return {
      ok: false,
      walletBalance: 0,
      transactions: [],
      receipts: [],
      entries: []
    };
  }
}

async function buildAnalyticsSnapshot() {
  const shared = await fetchSharedState();
  const now = new Date();
  const currentMonth = monthKeyFromMs(now.getTime());
  const todayKey = dateKeyFromMs(now.getTime());
  const monthPayments = shared.transactions.filter((item) => monthKeyFromMs(item.timestamp_ms) === currentMonth);
  const monthAllReceipts = shared.receipts.filter((item) => monthKeyFromMs(item.timestamp_ms) === currentMonth);
  const monthUpiLinkedReceipts = monthAllReceipts.filter((item) => item.source_type === 'upi-linked');
  const monthTrackedReceipts = monthAllReceipts.filter((item) => item.source_type !== 'upi-linked');
  const monthEntries = [...monthPayments, ...monthTrackedReceipts];
  const todayEntries = monthEntries.filter((item) => dateKeyFromMs(item.timestamp_ms) === todayKey);
  const monthlySpent = monthEntries.reduce((total, item) => total + Number(item.amount || 0), 0);
  const phonepeSpend = monthPayments.reduce((total, item) => total + Number(item.amount || 0), 0);
  const trackedCashSpend = monthTrackedReceipts.reduce((total, item) => total + Number(item.amount || 0), 0);
  const trackedAllReceipts = monthAllReceipts.reduce((total, item) => total + Number(item.amount || 0), 0);
  const upiLinkedTrackedSpend = monthUpiLinkedReceipts.reduce((total, item) => total + Number(item.amount || 0), 0);
  const trackAndDeductCount = monthUpiLinkedReceipts.length;
  const todaySpent = todayEntries.reduce((total, item) => total + Number(item.amount || 0), 0);
  const wantsSpent = monthEntries
    .filter((item) => item.need_or_want === 'want')
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const budgetLeft = Math.max(monthlyBudget - monthlySpent, 0);
  const elapsedDays = Math.max(now.getDate(), 1);
  const averageDaily = monthlySpent / elapsedDays;
  const forecast = buildNextMonthForecast(monthEntries, monthlySpent, now, monthlyBudget);
  const predictedNextMonth = forecast.predicted;
  const health = computeHealth(monthlySpent, todaySpent, wantsSpent, monthlyBudget, shared.walletBalance);
  const alerts = buildAlerts(health, budgetLeft, monthlySpent, monthlyBudget);

  const categoryTotals = new Map();
  for (const item of monthEntries) {
    categoryTotals.set(item.category, Number(categoryTotals.get(item.category) || 0) + Number(item.amount || 0));
  }

  const categories = [...categoryTotals.entries()]
    .map(([category, total]) => ({ category, total: toRupeeNumber(total) }))
    .sort((left, right) => right.total - left.total);

  const dayKeys = lastSevenDateKeys();
  const dailyValues = dayKeys.map((key) => {
    const total = monthEntries
      .filter((item) => dateKeyFromMs(item.timestamp_ms) === key)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return toRupeeNumber(total);
  });

  const needsSpent = monthEntries
    .filter((item) => item.need_or_want === 'need')
    .reduce((total, item) => total + Number(item.amount || 0), 0);

  const weeklyTransactions = monthEntries.filter((item) => {
    const txnDate = new Date(item.timestamp_ms);
    const minDate = new Date(now);
    minDate.setDate(now.getDate() - 6);
    return txnDate >= minDate;
  });
  const weeklySpend = weeklyTransactions.reduce((total, item) => total + Number(item.amount || 0), 0);
  const wantsShare = monthlySpent > 0 ? toRupeeNumber((wantsSpent / monthlySpent) * 100) : 0;
  const futureAlerts = buildFutureAlerts({
    predictedNextMonth,
    monthlyBudgetLimit: monthlyBudget,
    averageDaily,
    wantsSharePercent: wantsShare
  });
  const dailyExpenseReport = buildDailyExpenseReport(monthEntries);
  const geminiInsights = await buildGeminiInsightsPayload({
    monthlySpent: toRupeeNumber(monthlySpent),
    todaySpent: toRupeeNumber(todaySpent),
    wantsSpent: toRupeeNumber(wantsSpent),
    needsSpent: toRupeeNumber(needsSpent),
    budgetLeft: toRupeeNumber(budgetLeft),
    healthScore: health.score,
    forecast,
    entryCount: monthEntries.length,
    upiSpend: toRupeeNumber(phonepeSpend),
    cashTrackedSpend: toRupeeNumber(trackedCashSpend),
    trackAndDeductCount
  });

  const snapshot = {
    source: {
      db_path: process.env.FINSIGHT_DB_PATH || 'shared-phonepe-state',
      connected: shared.ok,
      transaction_count: monthEntries.length,
      phonepe_payment_count: shared.transactions.length,
      receipt_track_count: shared.receipts.length,
      gemini_enabled: Boolean(process.env.GEMINI_API_KEY)
    },
    wallet: {
      balance: toRupeeNumber(shared.walletBalance),
      monthly_limit: toRupeeNumber(monthlyBudget)
    },
    totals: {
      monthly_spent: toRupeeNumber(monthlySpent),
      monthly_phonepe_spent: toRupeeNumber(phonepeSpend),
      monthly_receipt_tracked: toRupeeNumber(trackedCashSpend),
      spent_by_upi: toRupeeNumber(phonepeSpend),
      spent_by_cash: toRupeeNumber(trackedCashSpend),
      tracked_money_total: toRupeeNumber(trackedAllReceipts),
      tracked_upi_linked: toRupeeNumber(upiLinkedTrackedSpend),
      track_and_deduct_count: trackAndDeductCount,
      today_spent: toRupeeNumber(todaySpent),
      budget_left: toRupeeNumber(budgetLeft),
      average_daily_spend: toRupeeNumber(averageDaily),
      predicted_next_month_spend: toRupeeNumber(predictedNextMonth),
      suggested_next_month_budget: forecast.suggested_budget,
      budget_usage_percent: toRupeeNumber(monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0)
    },
    health_breakdown: health,
    health_score: health.score,
    critical_alert: alerts.some((item) => item.priority === 'Critical'),
    alerts,
    categories,
    daily: {
      labels: dayKeys.map((value) => {
        const date = new Date(value);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      }),
      values: dailyValues,
      total: toRupeeNumber(dailyValues.reduce((total, value) => total + value, 0))
    },
    insights: {
      tips: [
        `Budget usage is ${toRupeeNumber(monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0)}% this month.`,
        `Needs vs wants split: ${toRupeeNumber(needsSpent)} / ${toRupeeNumber(wantsSpent)}.`,
        `Spend split: UPI ${toRupeeNumber(phonepeSpend)} | Cash tracked ${toRupeeNumber(trackedCashSpend)}.`,
        `${trackAndDeductCount} entries used track-and-deduct mode this month.`,
        `Next month (${forecast.month_name}) estimate is ${toRupeeNumber(predictedNextMonth)} with ${forecast.confidence} confidence.`,
        'Use report tab to export transactions and day-wise summary.'
      ],
      warning: budgetLeft < 1000 ? 'Emergency fund low!' : null,
      festival_alert: null,
      critical_alert: health.score < 55,
      health_score: health.score,
      needs_share: monthlySpent > 0 ? toRupeeNumber((needsSpent / monthlySpent) * 100) : 0,
      wants_share: wantsShare,
      need_want_insight: buildNeedWantInsight({
        needsShare: monthlySpent > 0 ? (needsSpent / monthlySpent) * 100 : 0,
        wantsShare,
        needsSpent,
        wantsSpent,
        monthlySpent
      }),
      active_emi_count: 0,
      active_installments_remaining: 0,
      gemini_live: Boolean(process.env.GEMINI_API_KEY),
      future_alerts: futureAlerts,
      next_month_forecast: forecast
    },
    weeklyReport: {
      impulse_spent: toRupeeNumber(wantsSpent),
      savings_missed: toRupeeNumber(wantsSpent * 0.08),
      next_week_forecast: toRupeeNumber((weeklySpend / 7) * 7.2),
      essentials_spent: toRupeeNumber(needsSpent),
      lifestyle_spent: toRupeeNumber(wantsSpent),
      next_month_prediction: toRupeeNumber(predictedNextMonth),
      suggested_budget: forecast.suggested_budget,
      summary: `You spent Rs ${Math.round(wantsSpent)} impulsively this month. Keep next week wants cap tight.`,
      daily_breakdown: dailyExpenseReport
    },
    detailedReport: {
      generated_at: Date.now(),
      period: currentMonth,
      next_month: forecast,
      totals: {
        monthly_spent: toRupeeNumber(monthlySpent),
        upi_spent: toRupeeNumber(phonepeSpend),
        cash_tracked_spent: toRupeeNumber(trackedCashSpend),
        budget_left: toRupeeNumber(budgetLeft)
      },
      days: dailyExpenseReport
    },
    transactions: monthEntries
  };

  if (geminiInsights) {
    snapshot.insights.tips = geminiInsights.tips.length ? geminiInsights.tips : snapshot.insights.tips;
    snapshot.insights.future_alerts = geminiInsights.future_alerts.length ? geminiInsights.future_alerts : snapshot.insights.future_alerts;
    if (geminiInsights.warning) {
      snapshot.insights.warning = geminiInsights.warning;
    }
    if (geminiInsights.need_want_insight) {
      snapshot.insights.need_want_insight = geminiInsights.need_want_insight;
    }
  }

  return snapshot;
}

function buildTransactionsCsv(transactions) {
  const rows = [
    'id,timestamp,type,category,custom_name,amount,effective_spend,payment_mode,source_type,need_or_want,is_emi,emi_months,emi_status'
  ];

  for (const item of transactions) {
    const safeName = String(item.custom_name || '').replaceAll('"', '""');
    const timestamp = new Date(item.timestamp_ms).toISOString();
    rows.push(
      [
        item.id,
        timestamp,
        item.type,
        item.category,
        `"${safeName}"`,
        toRupeeNumber(item.amount),
        toRupeeNumber(item.amount),
        item.payment_mode,
        item.source_type,
        item.need_or_want,
        item.is_emi,
        item.emi_months,
        item.emi_status
      ].join(',')
    );
  }

  return rows.join('\n');
}

await loadEnvFile();
initializeMarketplaceSchema();
monthlyBudget = Number(process.env.FINSIGHT_BUDGET || 1000000000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/config') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, {
      ok: true,
      data: {
        geminiApiKey: process.env.GEMINI_API_KEY ? 'configured' : '',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
        budget: monthlyBudget,
        sourceConnected: snapshot.source.connected
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/summary') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, {
      source: snapshot.source,
      wallet: snapshot.wallet,
      totals: snapshot.totals,
      health_score: snapshot.health_score,
      health_breakdown: snapshot.health_breakdown,
      critical_alert: snapshot.critical_alert
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/analytics/categories' || url.pathname === '/api/analytics/spending-pie')) {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, {
      period: monthKeyFromMs(Date.now()),
      categories: snapshot.categories,
      total_spent: snapshot.categories.reduce((total, item) => total + item.total, 0)
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/analytics/daily' || url.pathname === '/api/analytics/monthly-trend')) {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, snapshot.daily);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/alerts') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, {
      alerts: snapshot.alerts,
      critical_count: snapshot.alerts.filter((item) => item.priority === 'Critical').length
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/analytics/insights' || url.pathname === '/api/analytics/ai-advisor')) {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, snapshot.insights);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/weekly-report') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, snapshot.weeklyReport);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/detailed-report') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, snapshot.detailedReport);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/health-score') {
    const snapshot = await buildAnalyticsSnapshot();
    sendJson(res, 200, snapshot.health_breakdown);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/analytics/transactions-csv') {
    const snapshot = await buildAnalyticsSnapshot();
    const csvText = buildTransactionsCsv(snapshot.transactions);
    const filename = `finsight-transactions-${Date.now()}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    res.end(csvText);
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/budget') {
    try {
      const body = await readJsonBody(req);
      const nextLimit = Number(body.monthly_limit);
      if (!Number.isFinite(nextLimit) || nextLimit <= 0) {
        sendJson(res, 400, { message: 'monthly_limit must be positive' });
        return;
      }
      monthlyBudget = nextLimit;
      sendJson(res, 200, {
        message: 'Budget updated',
        monthly_limit: toRupeeNumber(monthlyBudget)
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analytics/receipt-upload') {
    try {
      const body = await readJsonBody(req);
      const geminiParsed = await extractReceiptWithGemini({
        filename: body.filename,
        merchantHint: body.merchant_hint,
        fileBase64: body.file_base64,
        mimeType: body.mime_type
      });
      const merchant = (body.merchant_hint || geminiParsed?.merchant_name || guessMerchantFromFilename(body.filename)).trim();
      const amount = geminiParsed?.amount > 0
        ? toRupeeNumber(geminiParsed.amount)
        : estimateAmountFromFileSize(body.file_size, body.filename);
      const category = normalizeCategory(geminiParsed?.category || autoCategory(merchant, amount));
      const gstNumber = geminiParsed?.gst_number || String(body.filename || '').toUpperCase().match(/[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]/)?.[0] || null;
      const gstValidation = validateGst(gstNumber);
      const parsedFileKey = `${String(body.filename || '').trim()}:${Number(body.file_size || 0)}`;
      geminiCache.parsedReceiptByFile.set(parsedFileKey, {
        merchant_name: merchant,
        estimated_amount: amount,
        category,
        gst_rate: toRupeeNumber(Number(geminiParsed?.gst_rate || 0)),
        gst_number: gstNumber
      });

      sendJson(res, 200, {
        filename: body.filename,
        merchant_name: merchant,
        estimated_amount: amount,
        category,
        gst_rate: toRupeeNumber(Number(geminiParsed?.gst_rate || 0)),
        parsed_file_key: parsedFileKey,
        gst_number: gstNumber,
        gst_verified: gstValidation.valid,
        gst_reason: gstValidation.reason,
        verified_badge: gstValidation.valid ? 'Verified' : 'Review Required',
        message: geminiParsed ? 'Receipt parsed with Gemini. Review fields before saving.' : 'Receipt parsed successfully. Review fields before saving.'
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analytics/receipt-upload-save') {
    try {
      const body = await readJsonBody(req);
      const fallbackFilename = body.filename || 'manual-entry';
      const parsedFileKey = body.parsed_file_key || `${String(fallbackFilename).trim()}:${Number(body.file_size || 0)}`;
      const cachedParsed = geminiCache.parsedReceiptByFile.get(parsedFileKey) || null;
      const geminiParsed = await extractReceiptWithGemini({
        filename: fallbackFilename,
        merchantHint: body.merchant_hint,
        fileBase64: body.file_base64,
        mimeType: body.mime_type
      });
      const parsed = geminiParsed || cachedParsed;
      const manualAmount = Number(body.amount);
      const hasManualAmount = Number.isFinite(manualAmount) && manualAmount > 0;
      const amount = hasManualAmount
        ? toRupeeNumber(manualAmount)
        : resolveAmount(parsed?.amount ?? parsed?.estimated_amount, body.file_size, fallbackFilename);
      const merchant = (body.merchant_hint || parsed?.merchant_name || guessMerchantFromFilename(fallbackFilename) || 'Manual Entry').trim();
      const gstRate = Number(body.gst_rate ?? parsed?.gst_rate ?? 18);
      const amountIsInclusive = body.amount_is_inclusive !== false;
      const gstAmount = amountIsInclusive
        ? toRupeeNumber(gstRate > 0 ? (amount * gstRate) / (100 + gstRate) : 0)
        : toRupeeNumber(amount * (gstRate / 100));
      const totalSaved = amountIsInclusive ? amount : toRupeeNumber(amount + gstAmount);
      const category = normalizeCategory(body.category || parsed?.category || autoCategory(merchant, totalSaved));
      const needOrWant = inferNeedOrWant(category);
      const gstValidation = validateGst(body.gst_number || parsed?.gst_number || null);

      const recorded = await recordTrackedExpense({
        merchant,
        amount: totalSaved,
        category,
        needOrWant,
        transactionType: body.transaction_type,
        entryAction: body.entry_action,
        note: 'Tracked from FinSight receipt upload',
        fileName: fallbackFilename,
        fileType: 'receipt-upload'
      });

      const snapshot = await buildAnalyticsSnapshot();

      sendJson(res, 200, {
        message: recorded.action === 'deduct_only'
          ? 'Entry saved in deduction-only mode'
          : recorded.action === 'track_and_deduct'
            ? 'Entry tracked and deducted successfully'
            : 'Entry tracked successfully',
        filename: fallbackFilename,
        merchant_name: merchant,
        category: recorded.category,
        amount,
        gst_amount: gstAmount,
        total_saved: totalSaved,
        balance: snapshot.wallet.balance,
        gst_number: body.gst_number || parsed?.gst_number || null,
        gst_verified: gstValidation.valid,
        gst_reason: gstValidation.reason,
        verified_badge: gstValidation.valid ? 'Verified' : 'Review Required',
        flow: {
          payment_mode: recorded.mode,
          action: recorded.action,
          tracked: recorded.shouldTrackReceipt,
          deducted: recorded.shouldCreatePayment
        }
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analytics/bills-csv-import') {
    try {
      const body = await readJsonBody(req);
      const isCsv = String(body.filename || '').toLowerCase().endsWith('.csv') || String(body.filename || '').toLowerCase().endsWith('.txt');
      if (!isCsv) {
        const singleAmount = estimateAmountFromFileSize(body.file_size, body.filename);
        const merchant = guessMerchantFromFilename(body.filename);
        const recorded = await recordTrackedExpense({
          merchant,
          amount: singleAmount,
          category: autoCategory(body.merchant_hint || merchant, singleAmount),
          transactionType: body.transaction_type,
          entryAction: body.entry_action,
          note: 'Tracked from FinSight bills upload',
          fileName: body.filename,
          fileType: 'bills-upload'
        });

        sendJson(res, 200, {
          message: recorded.action === 'deduct_only' ? 'Receipt file processed in deduction-only mode' : 'Receipt file processed successfully',
          mode: 'single',
          filename: body.filename,
          imported_count: 1,
          failed_count: 0,
          total_deducted: singleAmount,
          balance: toRupeeNumber((await buildAnalyticsSnapshot()).wallet.balance),
          imported: [{ line: 1, merchant, category: recorded.category, amount: singleAmount, gst_amount: 0, total_saved: singleAmount }],
          failed: []
        });
        return;
      }

      const rows = buildReceiptRowsFromCsvText(body.file_text, body.merchant_hint || 'CSV Imported Bill');
      const imported = [];
      const failed = [];

      for (const row of rows) {
        if (!Number.isFinite(row.amount) || row.amount <= 0) {
          failed.push({ line: row.line, reason: 'Invalid amount' });
          continue;
        }

        try {
          const recorded = await recordTrackedExpense({
            merchant: row.merchant,
            amount: toRupeeNumber(row.amount),
            category: normalizeCategory(row.category),
            transactionType: body.transaction_type,
            entryAction: body.entry_action,
            note: 'Tracked from FinSight CSV import',
            fileName: body.filename,
            fileType: 'text/csv'
          });
          imported.push({
            line: row.line,
            merchant: row.merchant,
            category: recorded.category,
            amount: toRupeeNumber(row.amount)
          });
        } catch (error) {
          failed.push({ line: row.line, reason: error.message });
        }
      }

      const importedCount = imported.length;
      const totalDeducted = toRupeeNumber(imported.reduce((sum, item) => sum + Number(item.amount || 0), 0));

      sendJson(res, 200, {
        message: 'Bills file processed and tracked',
        mode: 'batch',
        filename: body.filename,
        imported_count: importedCount,
        failed_count: failed.length,
        total_deducted: totalDeducted,
        balance: toRupeeNumber((await buildAnalyticsSnapshot()).wallet.balance),
        imported,
        failed
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analytics/bill-scan') {
    try {
      const body = await readJsonBody(req);
      const amount = Number(body.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { message: 'Amount must be greater than 0' });
        return;
      }
      const gstRate = Number(body.gst_rate ?? 18);
      const amountIsInclusive = body.amount_is_inclusive !== false;
      const gstAmount = amountIsInclusive
        ? toRupeeNumber(gstRate > 0 ? (amount * gstRate) / (100 + gstRate) : 0)
        : toRupeeNumber(amount * (gstRate / 100));
      const totalSaved = amountIsInclusive ? toRupeeNumber(amount) : toRupeeNumber(amount + gstAmount);
      const category = normalizeCategory(body.category || autoCategory(body.merchant_name, amount));
      const gstValidation = validateGst(body.gst_number);

      const recorded = await recordTrackedExpense({
        merchant: body.merchant_name,
        amount: totalSaved,
        category,
        transactionType: body.transaction_type,
        entryAction: body.entry_action,
        note: body.notes || 'Tracked from FinSight bill scan',
        fileName: '',
        fileType: ''
      });

      sendJson(res, 200, {
        message: 'Bill extracted and saved',
        merchant_name: body.merchant_name,
        category: recorded.category,
        auto_categorized: !body.category,
        amount: toRupeeNumber(amount),
        gst_amount: gstAmount,
        total_saved: totalSaved,
        notes: body.notes || '',
        gst_verified: gstValidation.valid,
        gst_reason: gstValidation.reason,
        verified_badge: gstValidation.valid ? 'Verified' : 'Review Required',
        balance: toRupeeNumber((await buildAnalyticsSnapshot()).wallet.balance)
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const timer = setInterval(async () => {
      const snapshot = await buildAnalyticsSnapshot();
      const latestCount = snapshot.source.transaction_count;
      if (latestCount > lastSeenTransactionCount) {
        lastSeenTransactionCount = latestCount;
        res.write(`data: ${JSON.stringify({ type: 'new_transaction', id: latestCount })}\n\n`);
      } else {
        res.write('data: {"type":"heartbeat"}\n\n');
      }
    }, 1500);

    req.on('close', () => {
      clearInterval(timer);
      res.end();
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/report-download') {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, {
        ok: true,
        data: {
          filename: `finsight-report-${Date.now()}.txt`,
          generatedAt: Date.now(),
          title: body.title || 'FinSight weekly report',
          summary: body.summary || 'Report skeleton ready for Gemini and PDF export.'
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/marketplace/list') {
    try {
      const body = await readJsonBody(req);
      const brand = String(body.brand || '').trim();
      const originalValue = toRupeeNumber(Number(body.originalValue || 0));
      const askingPrice = toRupeeNumber(Number(body.askingPrice || 0));
      const type = String(body.type || 'gift-card').trim().toLowerCase() === 'coupon' ? 'coupon' : 'gift-card';
      const sellerNote = String(body.sellerNote || body.note || '').trim();

      if (!brand) {
        sendJson(res, 400, { message: 'Brand is required' });
        return;
      }
      if (!Number.isFinite(originalValue) || originalValue <= 0) {
        sendJson(res, 400, { message: 'Original value must be greater than 0' });
        return;
      }
      if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
        sendJson(res, 400, { message: 'Asking price must be greater than 0' });
        return;
      }

      const listing = {
        type,
        brand,
        originalValue,
        askingPrice,
        platformFee: computePlatformFee(askingPrice),
        sellerNote,
        expiry: String(body.expiry || '')
      };
      const saved = insertMarketplaceListing(listing);
      sendJson(res, 201, { message: 'Listing created successfully', listing: saved });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/marketplace/listings') {
    try {
      const active = listActiveMarketplaceListings();
      sendJson(res, 200, { listings: active });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(res, url.pathname);
    return;
  }

  sendText(res, 405, 'Method not allowed');
});

server.listen(port, () => {
  console.log(`FinSight demo running at http://localhost:${port}`);
});