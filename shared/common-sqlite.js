import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, 'common.db');
const db = new DatabaseSync(dbPath);

const DEFAULT_SHARED_STATE = {
  note: '',
  walletBalance: 0,
  monthlyBudget: 0,
  lastPhonepeTransactionCount: 0,
  updatedBy: 'system',
  updatedAt: Date.now()
};

function now() {
  return Date.now();
}

function ensureSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS shared_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      eventType TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      note TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS money_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      needOrWant TEXT NOT NULL,
      gst TEXT,
      note TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      merchant TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      entrySource TEXT NOT NULL,
      fileName TEXT,
      fileType TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emi_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      dueDate INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      monthlyBudget INTEGER NOT NULL,
      note TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
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

  const row = db.prepare('SELECT id FROM shared_state WHERE id = 1').get();
  if (!row) {
    const initial = { ...DEFAULT_SHARED_STATE, updatedAt: now() };
    db.prepare('INSERT INTO shared_state (id, data, updatedAt) VALUES (1, ?, ?)').run(JSON.stringify(initial), now());
  }
}

function parseRowData(raw) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export function readSharedState() {
  const row = db.prepare('SELECT data, updatedAt FROM shared_state WHERE id = 1').get();
  const data = row ? parseRowData(row.data) : {};
  return {
    ...DEFAULT_SHARED_STATE,
    ...data,
    updatedAt: Number(data.updatedAt || row?.updatedAt || now())
  };
}

export function mergeSharedState(patch, updatedBy = 'system') {
  const current = readSharedState();
  const next = {
    ...current,
    ...patch,
    updatedBy: String(updatedBy || 'system'),
    updatedAt: now()
  };

  db.prepare('UPDATE shared_state SET data = ?, updatedAt = ? WHERE id = 1').run(JSON.stringify(next), next.updatedAt);
  return next;
}

function toInt(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : 0;
}

export function recordWalletEvent({ source = 'unknown', eventType = 'update', amount = 0, balance = 0, note = '' }) {
  const timestamp = now();
  db.prepare('INSERT INTO wallet_events (source, eventType, amount, balance, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
    String(source),
    String(eventType),
    toInt(amount),
    toInt(balance),
    String(note || ''),
    timestamp
  );
  return { source: String(source), eventType: String(eventType), amount: toInt(amount), balance: toInt(balance), note: String(note || ''), timestamp };
}

export function recordMoneyTransaction({ source = 'unknown', kind = 'transaction', name = '', amount = 0, category = 'Others', type = 'cash', needOrWant = 'need', gst = '', note = '' }) {
  const timestamp = now();
  const rowId = db.prepare(
    'INSERT INTO money_transactions (source, kind, name, amount, category, type, needOrWant, gst, note, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    String(source),
    String(kind),
    String(name || ''),
    toInt(amount),
    String(category || 'Others'),
    String(type || 'cash'),
    String(needOrWant || 'need'),
    String(gst || ''),
    String(note || ''),
    timestamp
  ).lastInsertRowid;

  return db.prepare('SELECT id, source, kind, name, amount, category, type, needOrWant, gst, note, timestamp FROM money_transactions WHERE id = ?').get(rowId);
}

export function recordReceiptHistory({ source = 'unknown', merchant = '', amount = 0, category = 'Others', note = '', entrySource = 'manual', fileName = '', fileType = '' }) {
  const timestamp = now();
  const rowId = db.prepare(
    'INSERT INTO receipts_history (source, merchant, amount, category, note, entrySource, fileName, fileType, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    String(source),
    String(merchant || ''),
    toInt(amount),
    String(category || 'Others'),
    String(note || ''),
    String(entrySource || 'manual'),
    String(fileName || ''),
    String(fileType || ''),
    timestamp
  ).lastInsertRowid;

  return db.prepare('SELECT id, source, merchant, amount, category, note, entrySource, fileName, fileType, timestamp FROM receipts_history WHERE id = ?').get(rowId);
}

export function recordEmiHistory({ source = 'unknown', name = '', amount = 0, dueDate = 0 }) {
  const timestamp = now();
  const rowId = db.prepare('INSERT INTO emi_records (source, name, amount, dueDate, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    String(source),
    String(name || ''),
    toInt(amount),
    toInt(dueDate),
    timestamp
  ).lastInsertRowid;

  return db.prepare('SELECT id, source, name, amount, dueDate, timestamp FROM emi_records WHERE id = ?').get(rowId);
}

export function recordBudget({ source = 'unknown', monthlyBudget = 0, note = '' }) {
  const timestamp = now();
  const rowId = db.prepare('INSERT INTO budget_records (source, monthlyBudget, note, timestamp) VALUES (?, ?, ?, ?)').run(
    String(source),
    toInt(monthlyBudget),
    String(note || ''),
    timestamp
  ).lastInsertRowid;

  return db.prepare('SELECT id, source, monthlyBudget, note, timestamp FROM budget_records WHERE id = ?').get(rowId);
}

export function recordMarketplaceListing({ source = 'unknown', type = 'gift-card', brand = '', originalValue = 0, askingPrice = 0, platformFee = 0, sellerNote = '', expiry = '', status = 'active' }) {
  const timestamp = now();
  const rowId = db.prepare(
    'INSERT INTO marketplace_listings (source, type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    String(source),
    String(type || 'gift-card'),
    String(brand || ''),
    Number(originalValue || 0),
    Number(askingPrice || 0),
    Number(platformFee || 0),
    String(sellerNote || ''),
    String(expiry || ''),
    String(status || 'active'),
    timestamp
  ).lastInsertRowid;

  return db.prepare('SELECT id, source, type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp FROM marketplace_listings WHERE id = ?').get(rowId);
}

export function readSharedLedger(limit = 100) {
  const recentTransactions = db.prepare('SELECT * FROM money_transactions ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));
  const recentReceipts = db.prepare('SELECT * FROM receipts_history ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));
  const recentWalletEvents = db.prepare('SELECT * FROM wallet_events ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));
  const recentEmis = db.prepare('SELECT * FROM emi_records ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));
  const recentBudgets = db.prepare('SELECT * FROM budget_records ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));
  const recentMarketplace = db.prepare('SELECT * FROM marketplace_listings ORDER BY timestamp DESC, id DESC LIMIT ?').all(Math.max(1, Math.trunc(limit)));

  return {
    transactions: recentTransactions,
    receipts: recentReceipts,
    walletEvents: recentWalletEvents,
    emis: recentEmis,
    budgets: recentBudgets,
    marketplace: recentMarketplace
  };
}

export function readUnifiedMoneyHistory(limit = 100) {
  const cappedLimit = Math.max(1, Math.trunc(limit));
  const spendRows = db
    .prepare('SELECT id, source, name, amount, category, type, needOrWant, gst, note, timestamp FROM money_transactions ORDER BY timestamp DESC, id DESC LIMIT ?')
    .all(cappedLimit)
    .map((row) => ({
      id: `tx-${row.id}`,
      historyType: 'upi-spend',
      source: row.source,
      name: row.name,
      amount: Number(row.amount || 0),
      category: row.category,
      paymentType: row.type,
      needOrWant: row.needOrWant,
      gst: row.gst,
      note: row.note,
      timestamp: Number(row.timestamp || 0)
    }));

  const receiptRows = db
    .prepare('SELECT id, source, merchant, amount, category, note, entrySource, fileName, fileType, timestamp FROM receipts_history ORDER BY timestamp DESC, id DESC LIMIT ?')
    .all(cappedLimit)
    .map((row) => ({
      id: `rc-${row.id}`,
      historyType: 'receipt-track',
      source: row.source,
      name: row.merchant,
      amount: Number(row.amount || 0),
      category: row.category,
      paymentType: row.entrySource === 'upi-linked' ? 'upi' : 'cash',
      needOrWant: 'tracked',
      gst: '',
      note: row.note,
      fileName: row.fileName,
      fileType: row.fileType,
      timestamp: Number(row.timestamp || 0)
    }));

  return [...spendRows, ...receiptRows]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, cappedLimit * 2);
}

export function readCommonDataSnapshot(limit = 100) {
  const history = readUnifiedMoneyHistory(limit);
  const marketplace = db
    .prepare('SELECT id, source, type, brand, originalValue, askingPrice, platformFee, sellerNote, expiry, status, timestamp FROM marketplace_listings ORDER BY timestamp DESC, id DESC LIMIT ?')
    .all(Math.max(1, Math.trunc(limit)));

  const upiSpend = history
    .filter((row) => row.historyType === 'upi-spend')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const receiptTracked = history
    .filter((row) => row.historyType === 'receipt-track')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    state: readSharedState(),
    history,
    marketplace,
    summary: {
      totalRows: history.length,
      upiSpend,
      receiptTracked,
      combined: upiSpend + receiptTracked
    }
  };
}

ensureSchema();

export { dbPath as sharedDbPath };
