import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  { name: 'Phone EMI', amount: 2500, dueDate: 5 },
  { name: 'Laptop EMI', amount: 3200, dueDate: 10 }
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
    CREATE TABLE IF NOT EXISTS emis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      dueDate INTEGER NOT NULL
    );
  `);
}

function ensureSeedData() {
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
}

createSchema();
ensureSeedData();

function getWalletRow() {
  return db.prepare('SELECT balance, updatedAt FROM wallet WHERE id = 1').get();
}

function getTransactions() {
  return db.prepare('SELECT id, name, amount, category, type, needOrWant, gst, timestamp FROM transactions ORDER BY timestamp DESC, id DESC').all();
}

function getEmis() {
  return db.prepare('SELECT id, name, amount, dueDate FROM emis ORDER BY dueDate ASC, id ASC').all();
}

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

function addMoney(amount) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Top up amount must be positive.');
  }
  db.prepare('UPDATE wallet SET balance = balance + ?, updatedAt = ? WHERE id = 1').run(parsedAmount, now());
  return getWalletRow();
}

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
  if (!Number.isFinite(dueDate) || dueDate < 1 || dueDate > 31) {
    throw new Error('Due date must be between 1 and 31.');
  }

  const inserted = db.prepare('INSERT INTO emis (name, amount, dueDate) VALUES (?, ?, ?)').run(name, amount, dueDate);
  return db.prepare('SELECT id, name, amount, dueDate FROM emis WHERE id = ?').get(inserted.lastInsertRowid);
}

export function getState() {
  const wallet = getWalletRow();
  const transactions = getTransactions();
  const emis = getEmis();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthTransactions = transactions.filter((transaction) => transaction.timestamp >= startOfMonth.getTime());
  const categoryTotals = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  let monthlySpent = 0;

  for (const transaction of monthTransactions) {
    const amount = Number(transaction.amount);
    monthlySpent += amount;
    if (categoryTotals[transaction.category] !== undefined) {
      categoryTotals[transaction.category] += amount;
    }
  }

  return {
    wallet,
    transactions,
    recentTransactions: transactions.slice(0, 5),
    emis,
    categoryTotals,
    monthlySpent,
    updatedAt: now()
  };
}

export { storeTransaction, addMoney, createEmi };
