import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { buildDashboardInsights } from './dinsight/report.js';
import { isSupabaseConfigured } from '../shared/supabase.js';
import { recordEmiHistory, recordMoneyTransaction, recordReceiptHistory, recordWalletEvent } from '../shared/common-sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const dbPath = ':memory:';
const db = new DatabaseSync(dbPath);

export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Education', 'Utilities', 'Others'];

const WANT_CATEGORY_SET = new Set(['Food', 'Shopping', 'Entertainment', 'Others']);
const NEED_CATEGORY_SET = new Set(['Transport', 'Health', 'Education', 'Utilities']);
const WANT_KEYWORDS = [
  'swiggy',
  'zomato',
  'blinkit',
  'instamart',
  'netflix',
  'prime video',
  'hotstar',
  'shopping',
  'myntra',
  'amazon',
  'mall',
  'movie',
  'cinema',
  'restaurant',
  'food delivery'
];
const NEED_KEYWORDS = [
  'metro',
  'bus',
  'auto',
  'fuel',
  'petrol',
  'diesel',
  'pharmacy',
  'medicine',
  'doctor',
  'electricity',
  'water bill',
  'internet',
  'school',
  'college',
  'tuition',
  'rent',
  'insurance'
];

function now() {
  return Date.now();
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Infers whether a transaction is a Need or Want using category and merchant keywords.
 * @param {{name?: string, category?: string}} transaction - Transaction details.
 * @returns {'need'|'want'} Derived need/want label.
 */
function inferNeedOrWant(transaction) {
  const category = String(transaction.category || '').trim();
  const text = `${normalizeText(transaction.name)} ${normalizeText(category)}`;

  let needScore = 0;
  let wantScore = 0;

  if (NEED_CATEGORY_SET.has(category)) {
    needScore += 2;
  }
  if (WANT_CATEGORY_SET.has(category)) {
    wantScore += 2;
  }

  for (const keyword of NEED_KEYWORDS) {
    if (text.includes(keyword)) {
      needScore += 2;
    }
  }

  for (const keyword of WANT_KEYWORDS) {
    if (text.includes(keyword)) {
      wantScore += 2;
    }
  }

  return wantScore > needScore ? 'want' : 'need';
}

/**
 * Creates the SQLite schema required by the PhonePe app state.
 */
function createSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      needOrWant TEXT NOT NULL,
      gst TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL,
      fileName TEXT,
      fileType TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      dueDate INTEGER NOT NULL
    );
  `);
}

function ensureBaseData() {
  if (!isSupabaseConfigured()) {
    return;
  }
  const wallet = db.prepare('SELECT balance FROM wallet WHERE id = 1').get();
  if (!wallet) {
    db.prepare('INSERT INTO wallet (id, balance, updatedAt) VALUES (1, ?, ?)').run(0, now());
  }
}

function clearDemoData() {
  db.exec(`
    DELETE FROM transactions;
    DELETE FROM receipts;
    DELETE FROM emis;
    UPDATE wallet SET balance = 0, updatedAt = ${now()} WHERE id = 1;
  `);

  const wallet = db.prepare('SELECT id FROM wallet WHERE id = 1').get();
  if (!wallet) {
    db.prepare('INSERT INTO wallet (id, balance, updatedAt) VALUES (1, ?, ?)').run(0, now());
  }

  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  return getState();
}

function reseedDemoData() {
  return clearDemoData();
}

createSchema();
ensureBaseData();

function getWalletRow() {
  return db.prepare('SELECT balance, updatedAt FROM wallet WHERE id = 1').get();
}

/**
 * Reads all transactions ordered by newest first.
 * @returns {Array<object>} Transaction rows.
 */
function getTransactions() {
  return db.prepare('SELECT id, name, amount, category, type, needOrWant, gst, timestamp FROM transactions ORDER BY timestamp DESC, id DESC').all();
}

/**
 * Reads all saved receipt entries ordered by newest first.
 * @returns {Array<object>} Receipt rows.
 */
function getReceipts() {
  return db.prepare('SELECT id, merchant, amount, category, note, source, fileName, fileType, timestamp FROM receipts ORDER BY timestamp DESC, id DESC').all();
}

/**
 * Reads all saved EMIs ordered by due date.
 * @returns {Array<object>} EMI rows.
 */
function getEmis() {
  return db.prepare('SELECT id, name, amount, dueDate FROM emis ORDER BY dueDate ASC, id ASC').all();
}

/**
 * Stores a transaction and updates the wallet when the payment type is UPI.
 * @param {{name: string, amount: number, category: string, type?: string, gst?: string}} transaction - Incoming transaction payload.
 * @param {boolean} [affectWallet=true] - Whether UPI payments should deduct from wallet balance.
 * @returns {object} The inserted transaction row.
 */
function storeTransaction(transaction, affectWallet = true) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is required for PhonePe writes.');
  }

  const amount = Number(transaction.amount);
  const name = String(transaction.name || '').trim();
  const category = String(transaction.category || '').trim();
  const type = transaction.type === 'cash' ? 'cash' : 'upi';
  const gst = String(transaction.gst || '').trim();

  if (!name) {
    throw new Error('Recipient name is required.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error('Select a valid spending category.');
  }

  const needOrWant = inferNeedOrWant({ name, category });

  if (affectWallet && type === 'upi') {
    const wallet = getWalletRow();
    if (wallet.balance < amount) {
      throw new Error('Wallet balance is too low for this payment.');
    }
    const nextBalance = wallet.balance - amount;
    db.prepare('UPDATE wallet SET balance = balance - ?, updatedAt = ? WHERE id = 1').run(amount, now());
    recordWalletEvent({ source: 'phonepe', eventType: 'debit', amount: -amount, balance: nextBalance, note: `Payment to ${name}` });
  }

  const inserted = db.prepare('INSERT INTO transactions (name, amount, category, type, needOrWant, gst, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    name,
    amount,
    category,
    type,
    needOrWant,
    gst,
    now()
  );

  const savedTransaction = db.prepare('SELECT id, name, amount, category, type, needOrWant, gst, timestamp FROM transactions WHERE id = ?').get(inserted.lastInsertRowid);
  recordMoneyTransaction({
    source: 'phonepe',
    kind: 'payment',
    name: savedTransaction.name,
    amount: savedTransaction.amount,
    category: savedTransaction.category,
    type: savedTransaction.type,
    needOrWant: savedTransaction.needOrWant,
    gst: savedTransaction.gst,
    note: 'PhonePe transaction'
  });
  return savedTransaction;
}

/**
 * Adds funds to the wallet.
 * @param {number|string} amount - Amount to add.
 * @returns {{balance: number, updatedAt: number}} Updated wallet row.
 */
function addMoney(amount) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is required for PhonePe writes.');
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Top up amount must be positive.');
  }
  db.prepare('UPDATE wallet SET balance = balance + ?, updatedAt = ? WHERE id = 1').run(parsedAmount, now());
  const wallet = getWalletRow();
  recordWalletEvent({ source: 'phonepe', eventType: 'credit', amount: parsedAmount, balance: wallet.balance, note: 'Wallet top up' });
  return wallet;
}

/**
 * Creates a new EMI record.
 * @param {{name: string, amount: number, dueDate: number}} emi - EMI payload.
 * @returns {object} Inserted EMI row.
 */
function createEmi(emi) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is required for PhonePe writes.');
  }

  const name = String(emi.name || '').trim();
  const amount = Number(emi.amount);
  const dueDate = Number(emi.dueDate);

  if (!name) {
    throw new Error('EMI name is required.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('EMI amount must be a positive number.');
  }
  const validDurations = new Set([3, 6, 12, 18, 24]);
  if (!Number.isFinite(dueDate) || !validDurations.has(dueDate)) {
    throw new Error('Duration must be one of 3, 6, 12, 18, or 24 months.');
  }

  const inserted = db.prepare('INSERT INTO emis (name, amount, dueDate) VALUES (?, ?, ?)').run(name, amount, dueDate);
  const savedEmi = db.prepare('SELECT id, name, amount, dueDate FROM emis WHERE id = ?').get(inserted.lastInsertRowid);
  recordEmiHistory({ source: 'phonepe', name: savedEmi.name, amount: savedEmi.amount, dueDate: savedEmi.dueDate });
  return savedEmi;
}

/**
 * Stores a receipt entry without touching the wallet balance.
 * @param {{merchant: string, amount: number, category: string, note?: string, source?: string, fileName?: string, fileType?: string}} receipt - Incoming receipt payload.
 * @returns {object} Inserted receipt row.
 */
function storeReceipt(receipt) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is required for PhonePe writes.');
  }

  const merchant = String(receipt.merchant || '').trim();
  const amount = Number(receipt.amount);
  const category = String(receipt.category || '').trim();
  const note = String(receipt.note || '').trim();
  const rawSource = String(receipt.source || '').trim().toLowerCase();
  const allowedSources = new Set(['upload', 'manual', 'cash-tracked', 'upi-linked']);
  const source = allowedSources.has(rawSource) ? rawSource : 'manual';
  const fileName = String(receipt.fileName || '').trim();
  const fileType = String(receipt.fileType || '').trim();

  if (!merchant) {
    throw new Error('Merchant name is required.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Receipt amount must be a positive number.');
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error('Select a valid receipt category.');
  }

  const inserted = db.prepare('INSERT INTO receipts (merchant, amount, category, note, source, fileName, fileType, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    merchant,
    amount,
    category,
    note,
    source,
    fileName,
    fileType,
    now()
  );

  const savedReceipt = db.prepare('SELECT id, merchant, amount, category, note, source, fileName, fileType, timestamp FROM receipts WHERE id = ?').get(inserted.lastInsertRowid);
  recordReceiptHistory({
    source: 'phonepe',
    merchant: savedReceipt.merchant,
    amount: savedReceipt.amount,
    category: savedReceipt.category,
    note: savedReceipt.note,
    entrySource: savedReceipt.source,
    fileName: savedReceipt.fileName,
    fileType: savedReceipt.fileType
  });
  return savedReceipt;
}

/**
 * Returns the full app state consumed by the PhonePe UI.
 * @returns {object} Wallet, transaction, EMI, and summary data.
 */
export function getState() {
  if (!isSupabaseConfigured()) {
    const emptyWallet = { balance: 0, updatedAt: now() };
    const emptyDashboard = buildDashboardInsights({
      wallet: emptyWallet,
      transactions: [],
      receipts: [],
      emis: [],
      categoryTotals: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
      monthlySpent: 0
    });

    return {
      source: {
        connected: false,
        message: 'Supabase not configured'
      },
      wallet: emptyWallet,
      transactions: [],
      recentTransactions: [],
      receipts: [],
      recentReceipts: [],
      emis: [],
      categoryTotals: Object.fromEntries(CATEGORIES.map((category) => [category, 0])),
      monthlySpent: 0,
      trackedReceiptSpent: 0,
      combinedMonthlySpent: 0,
      dashboard: emptyDashboard,
      updatedAt: now()
    };
  }

  const wallet = getWalletRow();
  const transactions = getTransactions();
  const receipts = getReceipts();
  const emis = getEmis();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthTransactions = transactions.filter((transaction) => transaction.timestamp >= startOfMonth.getTime());
  const monthReceipts = receipts.filter((receipt) => receipt.timestamp >= startOfMonth.getTime());
  const categoryTotals = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  let monthlySpent = 0;
  let trackedReceiptSpent = 0;

  for (const transaction of monthTransactions) {
    const amount = Number(transaction.amount);
    monthlySpent += amount;
    if (categoryTotals[transaction.category] !== undefined) {
      categoryTotals[transaction.category] += amount;
    }
  }

  for (const receipt of monthReceipts) {
    const amount = Number(receipt.amount);
    trackedReceiptSpent += amount;
    if (categoryTotals[receipt.category] !== undefined) {
      categoryTotals[receipt.category] += amount;
    }
  }

  const combinedMonthlySpent = monthlySpent + trackedReceiptSpent;

  const dashboardSource = {
    wallet,
    transactions,
    receipts,
    emis,
    categoryTotals,
    monthlySpent
  };
  const dashboard = buildDashboardInsights(dashboardSource);

  return {
    wallet,
    transactions,
    recentTransactions: transactions.slice(0, 5),
    receipts,
    recentReceipts: receipts.slice(0, 5),
    emis,
    categoryTotals,
    monthlySpent,
    trackedReceiptSpent,
    combinedMonthlySpent,
    dashboard,
    updatedAt: now()
  };
}

export { storeTransaction, storeReceipt, addMoney, createEmi };
export { clearDemoData, reseedDemoData };
