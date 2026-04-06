import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

function loadServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function loadServiceAccountFromFile() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function createAdminApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const fromEnv = loadServiceAccountFromEnv();
  const fromFile = loadServiceAccountFromFile();

  if (fromEnv || fromFile) {
    return initializeApp({
      credential: cert(fromEnv || fromFile),
      projectId: projectId || (fromEnv || fromFile).project_id
    });
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS if configured.
  return initializeApp({
    credential: applicationDefault(),
    projectId: projectId || undefined
  });
}

function nowMs() {
  return Date.now();
}

function daysAgo(days) {
  return nowMs() - days * 24 * 60 * 60 * 1000;
}

function buildSampleTransactions() {
  return [
    { name: 'Swiggy', amount: 800, category: 'Food', type: 'upi', needOrWant: 'want', gst: '', timestamp: daysAgo(1) },
    { name: 'Metro Card Recharge', amount: 120, category: 'Transport', type: 'upi', needOrWant: 'need', gst: '', timestamp: daysAgo(2) },
    { name: 'Apollo Pharmacy', amount: 450, category: 'Health', type: 'cash', needOrWant: 'need', gst: '27AABCU9603R1ZV', timestamp: daysAgo(3) },
    { name: 'Amazon', amount: 1500, category: 'Shopping', type: 'upi', needOrWant: 'want', gst: '', timestamp: daysAgo(4) },
    { name: 'Netflix', amount: 649, category: 'Entertainment', type: 'cash', needOrWant: 'want', gst: '', timestamp: daysAgo(5) },
    { name: 'Zomato', amount: 420, category: 'Food', type: 'upi', needOrWant: 'want', gst: '', timestamp: daysAgo(6) },
    { name: 'Electricity Bill', amount: 2100, category: 'Utilities', type: 'upi', needOrWant: 'need', gst: '', timestamp: daysAgo(7) },
    { name: 'Book Store', amount: 780, category: 'Education', type: 'cash', needOrWant: 'need', gst: '', timestamp: daysAgo(8) },
    { name: 'Fuel', amount: 1900, category: 'Transport', type: 'upi', needOrWant: 'need', gst: '', timestamp: daysAgo(10) },
    { name: 'Movie Night', amount: 999, category: 'Entertainment', type: 'upi', needOrWant: 'want', gst: '', timestamp: daysAgo(12) }
  ];
}

function buildSampleStreak() {
  const rows = [];
  const monthlyBudget = 100000;
  const dailyBudget = Math.round(monthlyBudget / 30);

  for (let i = 0; i < 30; i += 1) {
    const date = new Date(nowMs() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    const spentForDay = Math.max(0, Math.round(dailyBudget * (0.55 + (i % 6) * 0.2)));

    let status = 'green';
    if (spentForDay > dailyBudget * 1.5) status = 'red';
    else if (spentForDay > dailyBudget * 1.3) status = 'orange';
    else if (spentForDay > dailyBudget) status = 'yellow';

    rows.push({
      date: dateKey,
      budgetForDay: dailyBudget,
      spentForDay,
      status
    });
  }

  return rows;
}

async function seedFirestore() {
  createAdminApp();
  const db = getFirestore();

  const transactions = buildSampleTransactions();
  const streakRows = buildSampleStreak();

  const batch = db.batch();

  const budgetRef = db.collection('budget').doc('current');
  batch.set(budgetRef, {
    monthly: 100000,
    updatedAt: nowMs()
  }, { merge: true });

  const walletRef = db.collection('wallet').doc('current');
  batch.set(walletRef, {
    balance: 47580,
    updatedAt: nowMs()
  }, { merge: true });

  const emis = [
    { name: 'Phone EMI', amount: 2500, dueDate: 5 },
    { name: 'Laptop EMI', amount: 3200, dueDate: 10 }
  ];

  for (const emi of emis) {
    const ref = db.collection('emis').doc();
    batch.set(ref, emi, { merge: true });
  }

  const goals = [
    { name: 'Emergency Fund', targetAmount: 200000, savedAmount: 42000 },
    { name: 'Travel 2026', targetAmount: 80000, savedAmount: 18000 }
  ];

  for (const goal of goals) {
    const ref = db.collection('goals').doc();
    batch.set(ref, goal, { merge: true });
  }

  const marketplace = [
    { type: 'gift-card', brand: 'PVR', originalValue: 500, askingPrice: 350, platformFee: 10, sellerNote: 'Valid this month', status: 'active', timestamp: daysAgo(1) },
    { type: 'coupon', brand: 'Zomato Pro', originalValue: 999, askingPrice: 799, platformFee: 16, sellerNote: 'Unused coupon', status: 'active', timestamp: daysAgo(3) }
  ];

  for (const listing of marketplace) {
    const ref = db.collection('marketplace').doc();
    batch.set(ref, listing, { merge: true });
  }

  for (const txn of transactions) {
    const ref = db.collection('transactions').doc();
    batch.set(ref, txn, { merge: true });
  }

  for (const row of streakRows) {
    const ref = db.collection('streak').doc(row.date);
    batch.set(ref, row, { merge: true });
  }

  await batch.commit();

  console.log('Seed complete.');
  console.log(`transactions: ${transactions.length}`);
  console.log(`streak days: ${streakRows.length}`);
  console.log('collections seeded: budget, wallet, emis, goals, marketplace, transactions, streak');
}

seedFirestore().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
