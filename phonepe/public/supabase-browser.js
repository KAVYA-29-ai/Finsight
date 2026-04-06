function getAppConfig() {
  return typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {};
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function toInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function toMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function nowMs() {
  return Date.now();
}

function monthKeyFromMs(ms) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function dateKeyFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function getSupabaseConfig() {
  const config = getAppConfig();
  const url = normalizeUrl(config.SUPABASE_URL);
  const anonKey = String(config.SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    throw new Error('Supabase env is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.');
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

async function upsertRow(table, body, onConflict = 'id') {
  const payload = await restRequest(table, {
    method: 'POST',
    query: { on_conflict: onConflict },
    body,
    prefer: 'resolution=merge-duplicates,return=representation'
  });
  return Array.isArray(payload) ? payload[0] : payload;
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

function inferNeedOrWant({ category, name, explicit }) {
  const forced = String(explicit || '').trim().toLowerCase();
  if (forced === 'need' || forced === 'want') {
    return forced;
  }

  const normalizedCategory = normalizeCategory(category);
  const normalizedName = String(name || '').trim().toLowerCase();

  const categoryNeeds = new Set(['Utilities', 'Health', 'Education', 'Transport']);
  if (categoryNeeds.has(normalizedCategory)) {
    return 'need';
  }

  const essentialTokens = ['hospital', 'medical', 'pharmacy', 'school', 'college', 'electricity', 'water bill', 'gas bill', 'metro', 'bus', 'uber', 'ola', 'fuel'];
  if (essentialTokens.some((token) => normalizedName.includes(token))) {
    return 'need';
  }

  return 'want';
}

function normalizeTransactionMode(rawType) {
  const value = String(rawType || '').trim().toLowerCase();
  if (!value) return 'upi';
  if (value === 'cash') return 'cash';
  return 'upi';
}

function buildNeedWantInsight({ needsShare, wantsShare }) {
  if (wantsShare >= 70) {
    return 'Need vs Want is heavily skewed towards wants. Reduce discretionary spends for the next 7 days.';
  }
  if (needsShare >= 70) {
    return 'Great balance. Needs are dominating, which is healthy for long-term budget control.';
  }
  return 'Spend is reasonably balanced between needs and wants.';
}

function computeCategoryTotals(entries) {
  const totals = Object.create(null);
  for (const entry of entries) {
    const key = String(entry.category || 'Others');
    totals[key] = Number(totals[key] || 0) + Number(entry.amount || 0);
  }
  return totals;
}

function buildPhonepeReportFromState(state) {
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const needSpend = transactions.filter((row) => row.needOrWant === 'need').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const wantSpend = transactions.filter((row) => row.needOrWant === 'want').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const topCategory = Object.entries(state.categoryTotals || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || null;

  return {
    summary: {
      generatedAt: nowMs(),
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
      filename: `phonepe-report-${Date.now()}.txt`,
      generatedAt: nowMs(),
      text: 'Report generated from Supabase wallet, transaction, receipt and EMI history.'
    }
  };
}

async function getCurrentWalletState() {
  const rows = await selectRows('wallet_state', { order: 'id.asc', limit: 1 });
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    return { id: 1, balance: 0, updatedAt: nowMs() };
  }

  return {
    id: Number(row.id || 1),
    balance: Number(row.balance || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : nowMs()
  };
}

async function buildPhonepeStateSnapshot(limit = 500) {
  const capped = Math.max(1, Math.trunc(limit));
  const [walletRows, transactionRows, receiptRows, emiRows] = await Promise.all([
    selectRows('wallet_state', { order: 'id.asc', limit: 1 }),
    selectRows('money_transactions', { source: 'eq.phonepe', order: 'created_at.desc', limit: capped }),
    selectRows('receipts_history', { source: 'eq.phonepe', order: 'created_at.desc', limit: capped }),
    selectRows('emi_records', { source: 'eq.phonepe', order: 'created_at.desc', limit: capped })
  ]);

  const walletRow = Array.isArray(walletRows) && walletRows.length ? walletRows[0] : null;
  const wallet = {
    balance: Number(walletRow?.balance || 0),
    updatedAt: walletRow?.updated_at ? new Date(walletRow.updated_at).getTime() : nowMs()
  };

  const transactions = (transactionRows || []).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || ''),
    amount: Number(row.amount || 0),
    category: String(row.category || 'Others'),
    type: String(row.type || 'cash'),
    needOrWant: String(row.need_or_want || 'need'),
    gst: String(row.gst || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : nowMs()
  }));

  const receipts = (receiptRows || []).map((row) => ({
    id: Number(row.id || 0),
    merchant: String(row.merchant || ''),
    amount: Number(row.amount || 0),
    category: String(row.category || 'Others'),
    note: String(row.note || ''),
    source: String(row.entry_source || 'manual'),
    fileName: String(row.file_name || ''),
    fileType: String(row.file_type || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : nowMs()
  }));

  const emis = (emiRows || []).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || ''),
    amount: Number(row.amount || 0),
    dueDate: Number(row.due_date || 0)
  }));

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthTransactions = transactions.filter((item) => item.timestamp >= startOfMonth.getTime());
  const monthReceipts = receipts.filter((item) => item.timestamp >= startOfMonth.getTime());
  const categoryTotals = computeCategoryTotals([...monthTransactions, ...monthReceipts]);

  const monthlySpent = monthTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const trackedReceiptSpent = monthReceipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const needSpend = monthTransactions.filter((item) => item.needOrWant === 'need').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const wantSpend = monthTransactions.filter((item) => item.needOrWant === 'want').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const topCategory = Object.entries(categoryTotals).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || null;

  const dashboard = buildPhonepeReportFromState({
    wallet,
    transactions,
    receipts,
    categoryTotals,
    monthlySpent,
    trackedReceiptSpent,
    combinedMonthlySpent: monthlySpent + trackedReceiptSpent
  });

  return {
    source: { connected: true, backend: 'supabase-rest' },
    wallet,
    transactions,
    recentTransactions: transactions.slice(0, 5),
    receipts,
    recentReceipts: receipts.slice(0, 5),
    emis,
    categoryTotals,
    monthlySpent: toMoney(monthlySpent),
    trackedReceiptSpent: toMoney(trackedReceiptSpent),
    combinedMonthlySpent: toMoney(monthlySpent + trackedReceiptSpent),
    dashboard,
    updatedAt: nowMs(),
    needSpend: toMoney(needSpend),
    wantSpend: toMoney(wantSpend),
    topCategory
  };
}

async function addMoney(amount) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Amount must be a positive number.');
  }

  const current = await getCurrentWalletState();
  const nextBalance = Number(current.balance || 0) + parsedAmount;
  await upsertRow('wallet_state', { id: 1, balance: toInt(nextBalance), updated_at: new Date().toISOString() }, 'id');
  await insertRow('wallet_events', {
    source: 'phonepe',
    event_type: 'topup',
    amount: toInt(parsedAmount),
    balance: toInt(nextBalance),
    note: 'Wallet top-up'
  });
  return buildPhonepeStateSnapshot();
}

async function createTransaction(data) {
  const amount = Number(data.amount || 0);
  const name = String(data.name || '').trim();
  const category = String(data.category || '').trim();
  const type = normalizeTransactionMode(data.type);
  const needOrWant = inferNeedOrWant({ category, name, explicit: data.needOrWant });

  if (!name) {
    throw new Error('Recipient name is required.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  if (!category) {
    throw new Error('Select a valid spending category.');
  }

  const current = await getCurrentWalletState();
  if (type === 'upi' && current.balance < amount) {
    throw new Error('Wallet balance is too low for this payment.');
  }

  const transaction = await insertRow('money_transactions', {
    source: 'phonepe',
    kind: 'payment',
    name,
    amount: toInt(amount),
    category,
    type,
    need_or_want: needOrWant,
    gst: String(data.gst || ''),
    note: String(data.note || '')
  });

  if (type === 'upi') {
    const nextBalance = Number(current.balance || 0) - amount;
    await upsertRow('wallet_state', { id: 1, balance: toInt(nextBalance), updated_at: new Date().toISOString() }, 'id');
    await insertRow('wallet_events', {
      source: 'phonepe',
      event_type: 'spend',
      amount: toInt(-amount),
      balance: toInt(nextBalance),
      note: `Payment to ${name}`
    });
  }

  return buildPhonepeStateSnapshot();
}

async function createReceipt(data) {
  await insertRow('receipts_history', {
    source: 'phonepe',
    merchant: String(data.merchant || data.name || 'Unknown Merchant'),
    amount: toInt(data.amount || 0),
    category: String(data.category || 'Others'),
    note: String(data.note || ''),
    entry_source: String(data.source || 'manual'),
    file_name: String(data.fileName || ''),
    file_type: String(data.fileType || '')
  });

  return buildPhonepeStateSnapshot();
}

async function createEmi(data) {
  await insertRow('emi_records', {
    source: 'phonepe',
    name: String(data.name || 'EMI'),
    amount: toInt(data.amount || 0),
    due_date: toInt(data.dueDate || 0)
  });

  return buildPhonepeStateSnapshot();
}

async function getReport() {
  const state = await buildPhonepeStateSnapshot();
  return state.dashboard;
}

export function createPhonePeBrowserApi() {
  return {
    async getState() {
      return buildPhonepeStateSnapshot();
    },
    async addMoney(amount) {
      return addMoney(amount);
    },
    async createTransaction(data) {
      return createTransaction(data);
    },
    async createReceipt(data) {
      return createReceipt(data);
    },
    async createEmi(data) {
      return createEmi(data);
    },
    async getReport() {
      return getReport();
    }
  };
}
