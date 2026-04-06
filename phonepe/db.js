import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardInsights } from './dinsight/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'phonepe.db');
const db = new DatabaseSync(dbPath);

export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Education', 'Utilities', 'Others'];

const SAMPLE_TRANSACTIONS = [
  { name: 'Swiggy', amount: 800, category: 'Food', type: 'upi', needOrWant: 'want', gst: '', timestamp: Date.now() - 1000 * 60 * 60 * 24 },
  { name: 'Metro Card Recharge', amount: 120, category: 'Transport', type: 'upi', needOrWant: 'need', gst: '', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2 },
  { name: 'Apollo Pharmacy', amount: 450, category: 'Health', type: 'cash', needOrWant: 'need', gst: '27AABCU9603R1ZV', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3 },
  { name: 'Amazon', amount: 1500, category: 'Shopping', type: 'upi', needOrWant: 'want', gst: '', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 4 },
  { name: 'Netflix', amount: 649, category: 'Entertainment', type: 'cash', needOrWant: 'want', gst: '', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5 }
];

const SAMPLE_EMIS = [
  { name: 'Phone EMI', amount: 2500, dueDate: 6 },
  { name: 'Laptop EMI', amount: 3200, dueDate: 12 }
];

const SAMPLE_RECEIPTS = [
  { merchant: 'Fuel Station', amount: 780, category: 'Transport', note: 'Cash receipt upload', source: 'upload', fileName: 'fuel-receipt.pdf', fileType: 'application/pdf', timestamp: Date.now() - 1000 * 60 * 60 * 6 },
  { merchant: 'Office Lunch', amount: 240, category: 'Food', note: 'Manual entry saved from dinner receipt', source: 'manual', fileName: '', fileType: '', timestamp: Date.now() - 1000 * 60 * 60 * 10 }
];

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
 * Creates the SQLite schema required by the PhonePe local demo.
 */
function createSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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

function getMetaValue(key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMetaValue(key, value) {
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

/**
 * Seeds default wallet, EMI, and transaction data when the database is empty.
 */
function ensureSeedData() {
  if (getMetaValue('manual_reset') === '1') {
    return;
  }

  const wallet = db.prepare('SELECT balance FROM wallet WHERE id = 1').get();
  if (!wallet) {
    db.prepare('INSERT INTO wallet (id, balance, updatedAt) VALUES (1, ?, ?)').run(47580, now());
  }

  const emiCount = db.prepare('SELECT COUNT(*) AS count FROM emis').get().count;
  if (emiCount === 0) {
    const insertEmi = db.prepare('INSERT INTO emis (name, amount, dueDate) VALUES (?, ?, ?)');
    for (const emi of SAMPLE_EMIS) {
      insertEmi.run(emi.name, emi.amount, emi.dueDate);
    }
  }

  const transactionCount = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
  if (transactionCount === 0) {
    const insertTransaction = db.prepare('INSERT INTO transactions (name, amount, category, type, needOrWant, gst, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const transaction of SAMPLE_TRANSACTIONS) {
      insertTransaction.run(
        transaction.name,
        transaction.amount,
        transaction.category,
        transaction.type,
        transaction.needOrWant,
        transaction.gst,
        transaction.timestamp
      );
    }
  }

  const receiptCount = db.prepare('SELECT COUNT(*) AS count FROM receipts').get().count;
  if (receiptCount === 0) {
    const insertReceipt = db.prepare('INSERT INTO receipts (merchant, amount, category, note, source, fileName, fileType, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const receipt of SAMPLE_RECEIPTS) {
      insertReceipt.run(
        receipt.merchant,
        receipt.amount,
        receipt.category,
        receipt.note,
        receipt.source,
        receipt.fileName,
        receipt.fileType,
        receipt.timestamp
      );
    }
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

  setMetaValue('manual_reset', '1');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  return getState();
}

function reseedDemoData() {
  setMetaValue('manual_reset', '0');
  ensureSeedData();
  return getState();
}

createSchema();
ensureSeedData();

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
    db.prepare('UPDATE wallet SET balance = balance - ?, updatedAt = ? WHERE id = 1').run(amount, now());
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

  return db.prepare('SELECT id, name, amount, category, type, needOrWant, gst, timestamp FROM transactions WHERE id = ?').get(inserted.lastInsertRowid);
}

/**
 * Adds funds to the local wallet.
 * @param {number|string} amount - Amount to add.
 * @returns {{balance: number, updatedAt: number}} Updated wallet row.
 */
function addMoney(amount) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Top up amount must be positive.');
  }
  db.prepare('UPDATE wallet SET balance = balance + ?, updatedAt = ? WHERE id = 1').run(parsedAmount, now());
  return getWalletRow();
}

/**
 * Creates a new EMI record.
 * @param {{name: string, amount: number, dueDate: number}} emi - EMI payload.
 * @returns {object} Inserted EMI row.
 */
function createEmi(emi) {
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
  return db.prepare('SELECT id, name, amount, dueDate FROM emis WHERE id = ?').get(inserted.lastInsertRowid);
}

/**
 * Stores a receipt entry without touching the wallet balance.
 * @param {{merchant: string, amount: number, category: string, note?: string, source?: string, fileName?: string, fileType?: string}} receipt - Incoming receipt payload.
 * @returns {object} Inserted receipt row.
 */
function storeReceipt(receipt) {
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

  return db.prepare('SELECT id, merchant, amount, category, note, source, fileName, fileType, timestamp FROM receipts WHERE id = ?').get(inserted.lastInsertRowid);
}

/**
 * Returns the full app state consumed by the PhonePe UI.
 * @returns {object} Wallet, transaction, EMI, and summary data.
 */
export function getState() {
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
