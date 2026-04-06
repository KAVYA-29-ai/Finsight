import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

function loadServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  return JSON.parse(raw);
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

  return initializeApp({
    credential: applicationDefault(),
    projectId: projectId || undefined
  });
}

async function runQueries() {
  createAdminApp();
  const db = getFirestore();

  const txSnap = await db.collection('transactions').orderBy('timestamp', 'desc').limit(5).get();
  const marketSnap = await db.collection('marketplace').where('status', '==', 'active').orderBy('timestamp', 'desc').limit(5).get();
  const budgetSnap = await db.collection('budget').doc('current').get();

  const latestTx = txSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeListings = marketSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const budget = budgetSnap.exists ? budgetSnap.data() : null;

  const monthlySpent = latestTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const upiSpent = latestTx.filter((tx) => tx.type === 'upi').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const cashTracked = latestTx.filter((tx) => tx.type === 'cash').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  console.log(JSON.stringify({
    budget,
    summary: {
      recent_tx_count: latestTx.length,
      monthly_spent_sample: monthlySpent,
      upi_spent_sample: upiSpent,
      cash_spent_sample: cashTracked,
      active_marketplace_count: activeListings.length
    },
    latest_transactions: latestTx,
    active_marketplace: activeListings
  }, null, 2));
}

runQueries().catch((error) => {
  console.error('Query check failed:', error.message);
  process.exit(1);
});
