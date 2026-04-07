const runtimeConfig = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {};
const receiptParseCache = new Map();
let lastGeminiError = '';

function sanitizeConfigValue(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('%VITE_')) return '';
  return raw
    .replace(/^['\"]|['\"]$/g, '')
    .replace(/\/$/, '');
}

function sanitizeSecretValue(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('%VITE_')) return '';
  return raw.replace(/^['\"]|['\"]$/g, '');
}

function getGeminiKey() {
  return sanitizeSecretValue(runtimeConfig.GEMINI_API_KEY);
}

function getGeminiModelCandidates() {
  const configured = String(runtimeConfig.GEMINI_MODEL || '').trim();
  const preferred = configured || 'gemini-1.5-flash';
  const defaults = [preferred, 'gemini-1.5-flash-8b', 'gemini-1.5-flash'];
  return [...new Set(defaults.map((model) => String(model || '').trim()).filter(Boolean))];
}

function toMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function toInt(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function normalizeCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Others';
  const map = new Map([
    ['food', 'Food'],
    ['grocery', 'Food'],
    ['groceries', 'Food'],
    ['restaurant', 'Food'],
    ['dining', 'Food'],
    ['transport', 'Transport'],
    ['travel', 'Transport'],
    ['fuel', 'Transport'],
    ['petrol', 'Transport'],
    ['shopping', 'Shopping'],
    ['entertainment', 'Entertainment'],
    ['health', 'Health'],
    ['medical', 'Health'],
    ['education', 'Education'],
    ['utilities', 'Utilities'],
    ['utility', 'Utilities'],
    ['bill', 'Utilities'],
    ['tax', 'Utilities'],
    ['property tax', 'Utilities'],
    ['electricity', 'Utilities'],
    ['water', 'Utilities'],
    ['rent', 'Utilities'],
    ['others', 'Others']
  ]);
  return map.get(raw) || 'Others';
}

function inferNeedOrWant(category, merchant = '', explicit = '') {
  const forced = String(explicit || '').trim().toLowerCase();
  if (forced === 'need' || forced === 'want') return forced;

  const normalizedCategory = normalizeCategory(category);
  const merchantText = String(merchant || '').toLowerCase();
  const needCategories = new Set(['Transport', 'Health', 'Education', 'Utilities']);
  if (needCategories.has(normalizedCategory)) return 'need';

  const markers = ['hospital', 'pharmacy', 'medical', 'school', 'college', 'electricity', 'water bill', 'gas bill', 'metro', 'bus', 'uber', 'ola'];
  if (markers.some((token) => merchantText.includes(token))) return 'need';

  return 'want';
}

function estimateAmountFromFileSize(fileSize, filename) {
  // File-size based estimates are often wildly inaccurate for receipts.
  // Return 0 so UI can ask user for manual input instead of saving wrong values.
  return 0;
}

function parseAmountValue(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : NaN;
  }
  const raw = String(input || '').trim();
  if (!raw) return NaN;

  // Keep only the first decimal number-like token after removing currency markers.
  const normalized = raw
    .replace(/[₹,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bINR\b/gi, '')
    .trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : NaN;
}

function looksLikeYear(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1900 && n <= 2100;
}

function isPlausibleReceiptAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 200000 && !looksLikeYear(n);
}

function chooseReceiptAmountFromAi(json, fallbackAmount) {
  const priorityFields = ['receipt_amount', 'grand_total', 'total_amount', 'amount'];
  for (const field of priorityFields) {
    const value = parseAmountValue(json?.[field]);
    if (isPlausibleReceiptAmount(value)) return toMoney(value);
  }

  const candidateList = Array.isArray(json?.amount_candidates) ? json.amount_candidates : [];
  for (const item of candidateList) {
    const value = parseAmountValue(item?.value ?? item);
    const label = String(item?.label || '').toLowerCase();
    if (!isPlausibleReceiptAmount(value)) continue;
    if (label.includes('receipt amount') || label.includes('grand total') || label.includes('total paid') || label.includes('total')) {
      return toMoney(value);
    }
  }

  return toMoney(fallbackAmount);
}

function hasGeminiConfig() {
  return Boolean(getGeminiKey());
}

function guessMerchantFromFilename(filename) {
  const base = String(filename || '').replaceAll(/[_-]+/g, ' ').replaceAll(/\.[^.]+$/g, '').trim();
  return base ? base.slice(0, 50) : 'Unknown Merchant';
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

function monthKeyFromMs(ms) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function computePlatformFee(askingPrice) {
  if (askingPrice <= 0) return 0;
  if (askingPrice < 500) return toMoney(Math.min(10, Math.max(5, askingPrice * 0.02)));
  if (askingPrice <= 2000) return toMoney(Math.min(25, Math.max(15, askingPrice * 0.015)));
  return toMoney(askingPrice * 0.02);
}

function getSupabaseConfig() {
  const url = sanitizeConfigValue(runtimeConfig.SUPABASE_URL);
  const anonKey = String(runtimeConfig.SUPABASE_ANON_KEY || '').trim().replace(/^['\"]|['\"]$/g, '');
  if (!url || !anonKey) {
    throw new Error('Supabase env is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  try {
    new URL(url);
  } catch {
    throw new Error('Invalid SUPABASE URL. In Vercel, set VITE_SUPABASE_URL without quotes.');
  }

  return { url, anonKey };
}

async function restRequest(path, { method = 'GET', query = {}, body, prefer = '' } = {}) {
  const { url, anonKey } = getSupabaseConfig();
  const requestUrl = new URL(`${url}/rest/v1/${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      requestUrl.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(requestUrl, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || text || `Supabase request failed: ${path}`);
  }

  return payload;
}

async function selectRows(table, query = {}) {
  return restRequest(table, { method: 'GET', query: { select: '*', ...query } });
}

async function insertRow(table, body) {
  const payload = await restRequest(table, {
    method: 'POST',
    body,
    prefer: 'return=representation'
  });
  return Array.isArray(payload) ? payload[0] : payload;
}

async function updateRows(table, body, filters = {}) {
  const payload = await restRequest(table, {
    method: 'PATCH',
    query: filters,
    body,
    prefer: 'return=representation'
  });
  return Array.isArray(payload) ? payload : [];
}

async function getLatestBudget(defaultValue = 100000) {
  const rows = await selectRows('budget_records', { order: 'created_at.desc', limit: 1 });
  const value = Number(rows?.[0]?.monthly_budget || defaultValue);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function calcHealth(todaySpent, dailyBudget) {
  if (dailyBudget <= 0) {
    return { score: 76, label: 'Excellent', critical: false, reasons: ['Daily budget is not set.'] };
  }

  if (todaySpent <= dailyBudget) {
    return { score: 84, label: 'Excellent', critical: false, reasons: ['You are within today\'s spending limit.'] };
  }
  if (todaySpent <= dailyBudget * 1.3) {
    return { score: 62, label: 'Healthy', critical: false, reasons: ['Today is slightly above ideal pace.'] };
  }
  if (todaySpent <= dailyBudget * 1.5) {
    return { score: 38, label: 'Risky', critical: false, reasons: ['Today\'s spend is high against daily limit.'] };
  }
  return { score: 18, label: 'Critical', critical: true, reasons: ['Today\'s spend crossed the safe threshold.'] };
}

function buildDailySeries(entries, days = 7) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setDate(date.getDate() + 1);

    const total = entries
      .filter((item) => item.timestamp >= date.getTime() && item.timestamp < end.getTime())
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    out.push({
      dateKey: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: toMoney(total)
    });
  }
  return out;
}

async function callGeminiText(prompt, fallbackText, extraParts = []) {
  const key = getGeminiKey();
  if (!key) {
    lastGeminiError = 'Gemini API key missing in runtime config.';
    return fallbackText;
  }

  const models = getGeminiModelCandidates();

  const parts = [{ text: prompt }];
  for (const part of extraParts) {
    if (part && typeof part === 'object') {
      parts.push(part);
    }
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 600
    }
  };

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        lastGeminiError = 'Gemini rate limit/quota exceeded (429).';
        continue;
      }
      lastGeminiError = `Gemini request failed (${response.status}). ${errorText.slice(0, 160)}`;
      continue;
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n')?.trim();
    if (text) {
      lastGeminiError = '';
      return text;
    }
  }

  return fallbackText;
}

async function buildSnapshot() {
  const [walletRows, budgetRows, txRows, receiptRows, marketRows] = await Promise.all([
    selectRows('wallet_state', { order: 'id.asc', limit: 1 }),
    selectRows('budget_records', { order: 'created_at.desc', limit: 1 }),
    selectRows('money_transactions', { order: 'created_at.desc', limit: 1200 }),
    selectRows('receipts_history', { order: 'created_at.desc', limit: 1200 }),
    selectRows('marketplace_listings', { order: 'created_at.desc', limit: 200 })
  ]);

  const wallet = {
    balance: Number(walletRows?.[0]?.balance || 0),
    updatedAt: walletRows?.[0]?.updated_at ? new Date(walletRows[0].updated_at).getTime() : Date.now(),
    monthly_limit: Number(budgetRows?.[0]?.monthly_budget || 100000)
  };

  const transactions = (txRows || []).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || ''),
    amount: Number(row.amount || 0),
    category: normalizeCategory(row.category),
    payment_mode: String(row.type || 'cash'),
    need_or_want: String(row.need_or_want || 'tracked'),
    gst: String(row.gst || ''),
    note: String(row.note || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    source_type: 'payment'
  }));

  const receiptEntries = (receiptRows || []).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.merchant || ''),
    amount: Number(row.amount || 0),
    category: normalizeCategory(row.category),
    payment_mode: row.entry_source === 'upi-linked' ? 'upi' : 'cash',
    need_or_want: 'tracked',
    gst: '',
    note: String(row.note || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    source_type: 'receipt'
  }));

  const allEntries = [...transactions, ...receiptEntries].sort((a, b) => b.timestamp - a.timestamp);
  const now = Date.now();
  const currentMonth = monthKeyFromMs(now);
  const monthEntries = allEntries.filter((item) => monthKeyFromMs(item.timestamp) === currentMonth);

  const monthlySpent = monthEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spentByUpi = monthEntries.filter((item) => item.payment_mode === 'upi').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spentByCash = monthEntries.filter((item) => item.payment_mode === 'cash').reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todaySpent = monthEntries
    .filter((item) => item.timestamp >= dayStart.getTime())
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const nowDate = new Date();
  const dayOfMonth = Math.max(1, nowDate.getDate());
  const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
  const avgDaily = monthlySpent / dayOfMonth;
  const budgetLeft = wallet.monthly_limit - monthlySpent;
  const usagePercent = wallet.monthly_limit > 0 ? (monthlySpent / wallet.monthly_limit) * 100 : 0;
  const dailyBudget = wallet.monthly_limit / daysInMonth;
  const health = calcHealth(todaySpent, dailyBudget);

  const categoryMap = new Map();
  for (const entry of monthEntries) {
    categoryMap.set(entry.category, Number(categoryMap.get(entry.category) || 0) + Number(entry.amount || 0));
  }
  const categories = [...categoryMap.entries()]
    .map(([category, total]) => ({ category, total: toMoney(total) }))
    .sort((a, b) => b.total - a.total);

  const dailySeries = buildDailySeries(monthEntries, 7);

  const needSpend = monthEntries.filter((item) => item.need_or_want === 'need').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const wantSpend = monthEntries.filter((item) => item.need_or_want === 'want').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const needBase = needSpend + wantSpend;
  const needsShare = needBase > 0 ? Math.round((needSpend / needBase) * 100) : 0;
  const wantsShare = needBase > 0 ? Math.round((wantSpend / needBase) * 100) : 0;

  const essentialsSpent = monthEntries
    .filter((item) => ['need', 'tracked'].includes(String(item.need_or_want || '')))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lifestyleSpent = monthEntries
    .filter((item) => String(item.need_or_want || '') === 'want')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekEntries = monthEntries.filter((item) => item.timestamp >= weekStart.getTime());
  const weekSpent = weekEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const listings = (marketRows || [])
    .filter((row) => String(row.status || 'active') === 'active')
    .map((row) => ({
      id: Number(row.id || 0),
      source: String(row.source || ''),
      type: String(row.type || 'gift-card'),
      brand: String(row.brand || ''),
      originalValue: Number(row.original_value || 0),
      askingPrice: Number(row.asking_price || 0),
      platformFee: Number(row.platform_fee || 0),
      sellerNote: String(row.seller_note || ''),
      expiry: String(row.expiry || ''),
      status: String(row.status || 'active'),
      timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

  return {
    source: { connected: true, backend: 'supabase-rest-browser' },
    wallet,
    transactions,
    receipts: receiptEntries,
    entries: allEntries,
    categories,
    dailySeries,
    listings,
    totals: {
      monthly_spent: toMoney(monthlySpent),
      spent_by_upi: toMoney(spentByUpi),
      spent_by_cash: toMoney(spentByCash),
      budget_left: toMoney(budgetLeft),
      budget_usage_percent: toMoney(usagePercent),
      average_daily_spend: toMoney(avgDaily),
      today_spent: toMoney(todaySpent),
      predicted_next_month_spend: toMoney(avgDaily * daysInMonth)
    },
    health,
    needsShare,
    wantsShare,
    weekSummary: {
      weekSpent: toMoney(weekSpent),
      impulseSpent: toMoney(weekEntries.filter((item) => item.need_or_want === 'want').reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      essentialsSpent: toMoney(essentialsSpent),
      lifestyleSpent: toMoney(lifestyleSpent)
    }
  };
}

function buildDetailedDays(entries) {
  const map = new Map();
  const currentMonth = monthKeyFromMs(Date.now());
  const monthEntries = entries.filter((entry) => monthKeyFromMs(entry.timestamp) === currentMonth);

  for (const entry of monthEntries) {
    const date = new Date(entry.timestamp);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    if (!map.has(key)) {
      map.set(key, {
        date: key,
        total: 0,
        upi_total: 0,
        cash_total: 0,
        entries: []
      });
    }

    const bucket = map.get(key);
    const amount = Number(entry.amount || 0);
    bucket.total += amount;
    if (entry.payment_mode === 'upi') bucket.upi_total += amount;
    if (entry.payment_mode === 'cash') bucket.cash_total += amount;
    bucket.entries.push({
      time: new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      name: entry.name,
      category: entry.category,
      payment_mode: entry.payment_mode,
      need_or_want: entry.need_or_want,
      amount: toMoney(amount)
    });
  }

  return [...map.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((row) => ({
      ...row,
      total: toMoney(row.total),
      upi_total: toMoney(row.upi_total),
      cash_total: toMoney(row.cash_total)
    }));
}

function buildCsvFromEntries(entries) {
  const rows = [
    ['id', 'timestamp', 'type', 'category', 'name', 'amount', 'payment_mode', 'source_type', 'need_or_want'].join(',')
  ];

  for (const entry of entries) {
    const safeName = String(entry.name || '').replaceAll('"', '""');
    rows.push([
      String(entry.id || ''),
      new Date(entry.timestamp).toISOString(),
      String(entry.source_type || ''),
      String(entry.category || ''),
      `"${safeName}"`,
      String(toMoney(entry.amount)),
      String(entry.payment_mode || ''),
      String(entry.source_type || ''),
      String(entry.need_or_want || '')
    ].join(','));
  }

  return rows.join('\n');
}

async function parseReceiptPayload(body) {
  const fallbackAmount = toMoney(estimateAmountFromFileSize(body.file_size, body.filename));
  const parsed = {
    merchant_name: String(body.merchant_hint || '').trim() || guessMerchantFromFilename(body.filename),
    estimated_amount: fallbackAmount,
    category: normalizeCategory(body.category || 'Others'),
    gst_number: String(body.gst_number || '').toUpperCase().trim() || null,
    gst_rate: toMoney(Number(body.gst_rate || 18)),
    parsed_file_key: `${String(body.filename || 'receipt')}:${Number(body.file_size || 0)}:${Date.now()}`,
    message: 'Receipt parsed successfully.'
  };

  const fallbackText = JSON.stringify({
    merchant_name: parsed.merchant_name,
    amount: parsed.estimated_amount,
    category: parsed.category,
    gst_number: parsed.gst_number || '',
    gst_rate: parsed.gst_rate
  });

  const prompt = [
    'Extract receipt details as strict JSON with fields:',
    'merchant_name (string), amount (number), receipt_amount (number|null), grand_total (number|null), total_amount (number|null), amount_candidates (array), category (one of Food, Transport, Shopping, Entertainment, Health, Education, Utilities, Others), gst_number (string|null), gst_rate (number).',
    'For amount selection, ONLY use final payable value labeled like Receipt Amount, Grand Total, Total Amount, Total Paid.',
    'Do NOT use bill no, CMC no, transaction no, annual value, tax slab, date, time, phone number, address numbers, or reference IDs as amount.',
    'If multiple totals are present, choose the final payable/receipt amount actually paid by customer.',
    'If unsure, set amount as null and still return JSON.',
    `Filename: ${body.filename || 'unknown'}`,
    'Return only JSON object.'
  ].join('\n');

  const extraParts = [];
  if (body.file_base64) {
    const mimeType = String(body.mime_type || '').trim() || 'image/jpeg';
    extraParts.push({
      inlineData: {
        mimeType,
        data: String(body.file_base64)
      }
    });
  }

  const aiText = await callGeminiText(prompt, fallbackText, extraParts);
  const usedGemini = hasGeminiConfig() && aiText !== fallbackText;

  try {
    const start = aiText.indexOf('{');
    const end = aiText.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const json = JSON.parse(aiText.slice(start, end + 1));
      parsed.merchant_name = String(json.merchant_name || parsed.merchant_name).trim();
      parsed.estimated_amount = chooseReceiptAmountFromAi(json, fallbackAmount);
      parsed.category = normalizeCategory(json.category || parsed.category);
      parsed.gst_number = String(json.gst_number || parsed.gst_number || '').toUpperCase().trim() || null;
      const parsedGstRate = parseAmountValue(json.gst_rate);
      parsed.gst_rate = toMoney(Number.isFinite(parsedGstRate) && parsedGstRate >= 0 ? parsedGstRate : (parsed.gst_rate || 18));
      if (usedGemini) {
        parsed.message = 'Receipt parsed with Gemini.';
      } else if (lastGeminiError.includes('429')) {
        parsed.message = 'Gemini quota/rate limit hit (429). Please retry in 1-2 min or use a key with active billing.';
      } else if (lastGeminiError) {
        parsed.message = `Receipt parsed with fallback. ${lastGeminiError}`;
      } else {
        parsed.message = 'Receipt parsed with fallback estimate. Check Gemini API key/config for exact extraction.';
      }
    }
  } catch {
    // Keep fallback parse.
  }

  receiptParseCache.set(parsed.parsed_file_key, parsed);
  return parsed;
}

async function recordExpense(body) {
  const type = String(body.transaction_type || 'cash').toLowerCase() === 'upi' ? 'upi' : 'cash';
  const action = ['track_only', 'deduct_only', 'track_and_deduct'].includes(String(body.entry_action || ''))
    ? String(body.entry_action)
    : 'track_only';

  const merchant = String(body.merchant_hint || 'Unknown Merchant').trim() || 'Unknown Merchant';
  const amount = toMoney(Number(body.amount || 0));
  const category = normalizeCategory(body.category || 'Others');
  const needOrWant = inferNeedOrWant(category, merchant, body.need_or_want || '');

  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  const walletRows = await selectRows('wallet_state', { order: 'id.asc', limit: 1 });
  const walletRow = walletRows?.[0] || null;
  let walletBalance = Number(walletRow?.balance || 0);
  const walletId = Number(walletRow?.id || 1);

  const shouldTrack = action === 'track_only' || action === 'track_and_deduct';
  const shouldDeduct = action === 'deduct_only' || action === 'track_and_deduct';

  if (shouldTrack) {
    await insertRow('receipts_history', {
      source: 'finsight',
      merchant,
      amount: toInt(amount),
      category,
      note: String(body.note || 'Tracked from FinSight'),
      entry_source: type === 'upi' ? 'upi-linked' : 'manual',
      file_name: String(body.filename || ''),
      file_type: String(body.mime_type || '')
    });
  }

  if (shouldDeduct) {
    await insertRow('money_transactions', {
      source: 'finsight',
      kind: 'payment',
      name: merchant,
      amount: toInt(amount),
      category,
      type,
      need_or_want: needOrWant,
      gst: String(body.gst_number || ''),
      note: String(body.note || 'Deducted from FinSight')
    });

    if (type === 'upi') {
      walletBalance -= amount;
      const updatedRows = await updateRows('wallet_state', {
        balance: toInt(walletBalance),
        updated_at: new Date().toISOString()
      }, { id: `eq.${walletId}` });

      if (!updatedRows.length) {
        await insertRow('wallet_state', { id: walletId, balance: toInt(walletBalance) });
      }

      await insertRow('wallet_events', {
        source: 'finsight',
        event_type: 'spend',
        amount: toInt(-amount),
        balance: toInt(walletBalance),
        note: `Deducted via FinSight: ${merchant}`
      });
    }
  }

  return {
    merchant,
    amount,
    category,
    needOrWant,
    action,
    type,
    walletBalance: toMoney(walletBalance)
  };
}

async function buildInsights(snapshot) {
  const fallbackTips = [
    'Keep daily spending below your budget pace to improve score.',
    'Review top two categories and set a weekly cap.',
    'Tag each transaction as need or want for cleaner planning.'
  ];

  const needsShare = snapshot.needsShare;
  const wantsShare = snapshot.wantsShare;
  const topCategories = snapshot.categories.slice(0, 3).map((row) => `${row.category}: ${row.total}`).join(', ');

  const aiText = await callGeminiText(
    `You are a finance coach. Give 3 short tips in plain text for this profile. Needs ${needsShare}%, Wants ${wantsShare}%. Top categories: ${topCategories}.`,
    fallbackTips.join('\n')
  );

  const tips = aiText
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const warning = wantsShare >= 60
    ? 'Wants are above 60%. Consider a 7-day no-impulse challenge.'
    : '';

  return {
    health_score: snapshot.health.score,
    needs_share: needsShare,
    wants_share: wantsShare,
    warning,
    tips: tips.length ? tips : fallbackTips,
    need_want_insight: wantsShare >= 60
      ? 'High wants ratio detected. Reducing food delivery by 3 orders/week can materially improve savings.'
      : 'Need-vs-want split is controlled. Maintain this ratio for better monthly consistency.',
    future_alerts: [
      {
        priority: snapshot.health.critical ? 'Critical' : 'Medium',
        title: 'Daily burn rate',
        message: snapshot.health.critical ? 'Today\'s spending is beyond safe threshold.' : 'Daily spending is under watch but manageable.'
      },
      {
        priority: 'Low',
        title: 'Budget runway',
        message: `Budget left this month is ₹${new Intl.NumberFormat('en-IN').format(toMoney(snapshot.totals.budget_left))}.`
      }
    ],
    critical_points: snapshot.health.critical ? ['Today crossed 1.5x daily budget.', 'Immediate reduction in discretionary spends advised.'] : [],
    future_opportunities: ['Shift recurring spends to planned windows.', 'Track cash spends daily to avoid hidden leaks.'],
    investment_suggestion: 'Route 10% of month-end surplus into a low-risk index SIP.'
  };
}

export async function browserApiGet(url) {
  const snapshot = await buildSnapshot();

  if (url === '/api/analytics/summary') {
    return {
      source: snapshot.source,
      wallet: {
        monthly_limit: toMoney(snapshot.wallet.monthly_limit),
        balance: toMoney(snapshot.wallet.balance)
      },
      totals: snapshot.totals,
      health_score: snapshot.health.score,
      health_breakdown: {
        label: snapshot.health.label,
        reasons: snapshot.health.reasons
      },
      critical_alert: snapshot.health.critical
    };
  }

  if (url === '/api/analytics/categories' || url === '/api/analytics/spending-pie') {
    return {
      period: monthKeyFromMs(Date.now()),
      categories: snapshot.categories,
      total_spent: snapshot.categories.reduce((sum, row) => sum + Number(row.total || 0), 0)
    };
  }

  if (url === '/api/analytics/daily' || url === '/api/analytics/monthly-trend') {
    return {
      labels: snapshot.dailySeries.map((item) => item.label),
      values: snapshot.dailySeries.map((item) => item.value)
    };
  }

  if (url === '/api/analytics/insights' || url === '/api/analytics/ai-advisor') {
    return buildInsights(snapshot);
  }

  if (url === '/api/analytics/weekly-report') {
    return {
      impulse_spent: snapshot.weekSummary.impulseSpent,
      savings_missed: toMoney(Math.max(snapshot.weekSummary.impulseSpent * 0.35, 0)),
      next_week_forecast: toMoney(snapshot.weekSummary.weekSpent * 1.05),
      next_month_prediction: snapshot.totals.predicted_next_month_spend,
      suggested_budget: toMoney(Math.max(snapshot.totals.monthly_spent * 1.05, 10000)),
      essentials_spent: snapshot.weekSummary.essentialsSpent,
      lifestyle_spent: snapshot.weekSummary.lifestyleSpent,
      summary: 'Weekly summary generated from your latest Supabase data and behavior trends.'
    };
  }

  if (url === '/api/analytics/detailed-report') {
    return { days: buildDetailedDays(snapshot.entries) };
  }

  if (url === '/api/marketplace/listings') {
    return { listings: snapshot.listings };
  }

  if (url === '/api/analytics/transactions-csv') {
    return { csv: buildCsvFromEntries(snapshot.entries) };
  }

  throw new Error(`Unsupported GET endpoint in browser mode: ${url}`);
}

export async function browserApiSend(url, method, body = {}) {
  if (method === 'PUT' && url === '/api/budget') {
    const nextLimit = Number(body.monthly_limit || 0);
    if (!Number.isFinite(nextLimit) || nextLimit <= 0) {
      throw new Error('monthly_limit must be positive');
    }

    await insertRow('budget_records', {
      source: 'finsight-browser',
      monthly_budget: toInt(nextLimit),
      note: 'Updated from FinSight frontend only mode'
    });

    return { message: 'Budget updated', monthly_limit: toMoney(nextLimit) };
  }

  if (method === 'POST' && url === '/api/analytics/receipt-upload') {
    return parseReceiptPayload(body);
  }

  if (method === 'POST' && url === '/api/analytics/receipt-upload-save') {
    const cached = body.parsed_file_key ? receiptParseCache.get(body.parsed_file_key) : null;
    const merged = {
      ...body,
      merchant_hint: body.merchant_hint || cached?.merchant_name,
      amount: Number.isFinite(Number(body.amount)) && Number(body.amount) > 0 ? Number(body.amount) : Number(cached?.estimated_amount || 0),
      category: body.category || cached?.category,
      gst_number: body.gst_number || cached?.gst_number,
      gst_rate: Number.isFinite(Number(body.gst_rate)) ? Number(body.gst_rate) : Number(cached?.gst_rate || 18)
    };

    const recorded = await recordExpense(merged);
    const gstValidation = validateGst(merged.gst_number);

    return {
      message: recorded.action === 'track_only'
        ? 'Entry tracked successfully'
        : recorded.action === 'deduct_only'
          ? 'Entry saved in deduction-only mode'
          : 'Entry tracked and deducted successfully',
      merchant_name: recorded.merchant,
      category: recorded.category,
      amount: recorded.amount,
      gst_amount: toMoney(recorded.amount * (Number(merged.gst_rate || 0) / 100)),
      total_saved: recorded.amount,
      balance: recorded.walletBalance,
      gst_number: merged.gst_number || null,
      gst_verified: gstValidation.valid,
      gst_reason: gstValidation.reason,
      verified_badge: gstValidation.valid ? 'Verified' : 'Review Required'
    };
  }

  if (method === 'POST' && url === '/api/analytics/bills-csv-import') {
    const lines = String(body.file_text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const imported = [];
    const failed = [];

    const rows = lines.length
      ? lines.map((line, index) => ({
          line: index + 1,
          parts: line.split(',').map((cell) => cell.trim())
        }))
      : [{ line: 1, parts: [body.merchant_hint || guessMerchantFromFilename(body.filename), String(estimateAmountFromFileSize(body.file_size, body.filename)), body.category || 'Others'] }];

    for (const row of rows) {
      const [merchantRaw, amountRaw, categoryRaw] = row.parts;
      const merchant = merchantRaw || body.merchant_hint || 'Imported Bill';
      const amount = Number(amountRaw);
      const category = categoryRaw || 'Others';
      if (!Number.isFinite(amount) || amount <= 0) {
        failed.push({ line: row.line, reason: 'Invalid amount' });
        continue;
      }

      try {
        await recordExpense({
          merchant_hint: merchant,
          amount,
          category,
          transaction_type: body.transaction_type || 'cash',
          entry_action: body.entry_action || 'track_only',
          note: 'Tracked from CSV import'
        });
        imported.push({ line: row.line, merchant, amount: toMoney(amount), category: normalizeCategory(category) });
      } catch (error) {
        failed.push({ line: row.line, reason: error.message });
      }
    }

    const latestSnapshot = await buildSnapshot();
    return {
      message: 'Bills file processed and tracked',
      mode: 'batch',
      filename: body.filename,
      imported_count: imported.length,
      failed_count: failed.length,
      total_deducted: toMoney(imported.reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      balance: toMoney(latestSnapshot.wallet.balance),
      imported,
      failed
    };
  }

  if (method === 'POST' && url === '/api/analytics/bill-scan') {
    const payload = await browserApiSend('/api/analytics/receipt-upload-save', 'POST', {
      merchant_hint: body.merchant_name,
      amount: body.amount,
      category: body.category,
      gst_number: body.gst_number,
      gst_rate: body.gst_rate,
      transaction_type: body.transaction_type,
      entry_action: body.entry_action,
      note: body.notes || 'Tracked from simulated bill scan'
    });

    return {
      message: 'Bill extracted and saved',
      merchant_name: body.merchant_name,
      category: normalizeCategory(body.category),
      amount: toMoney(body.amount),
      gst_amount: toMoney(Number(body.amount || 0) * (Number(body.gst_rate || 0) / 100)),
      total_saved: payload.total_saved,
      notes: body.notes || '',
      gst_verified: payload.gst_verified,
      gst_reason: payload.gst_reason,
      verified_badge: payload.verified_badge,
      balance: payload.balance
    };
  }

  if (method === 'POST' && url === '/api/marketplace/list') {
    const brand = String(body.brand || '').trim();
    const originalValue = Number(body.originalValue || 0);
    const askingPrice = Number(body.askingPrice || 0);
    if (!brand) throw new Error('Brand is required');
    if (!Number.isFinite(originalValue) || originalValue <= 0) throw new Error('Original value must be greater than 0');
    if (!Number.isFinite(askingPrice) || askingPrice <= 0) throw new Error('Asking price must be greater than 0');

    const listingRow = await insertRow('marketplace_listings', {
      source: 'finsight-browser',
      type: String(body.type || 'gift-card'),
      brand,
      original_value: toMoney(originalValue),
      asking_price: toMoney(askingPrice),
      platform_fee: computePlatformFee(askingPrice),
      seller_note: String(body.sellerNote || ''),
      expiry: String(body.expiry || ''),
      status: 'active'
    });

    return {
      message: 'Listing created successfully',
      listing: {
        id: Number(listingRow.id || 0),
        type: listingRow.type,
        brand: listingRow.brand,
        originalValue: Number(listingRow.original_value || 0),
        askingPrice: Number(listingRow.asking_price || 0),
        platformFee: Number(listingRow.platform_fee || 0),
        sellerNote: listingRow.seller_note || '',
        expiry: listingRow.expiry || '',
        status: listingRow.status || 'active',
        timestamp: listingRow.created_at ? new Date(listingRow.created_at).getTime() : Date.now()
      }
    };
  }

  if (method === 'POST' && url === '/api/report-download') {
    return {
      ok: true,
      data: {
        filename: `finsight-report-${Date.now()}.txt`,
        generatedAt: Date.now(),
        title: body.title || 'FinSight weekly report',
        summary: body.summary || 'Report generated from browser-only mode.'
      }
    };
  }

  throw new Error(`Unsupported ${method} endpoint in browser mode: ${url}`);
}
