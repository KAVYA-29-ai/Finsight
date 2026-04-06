import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || '';
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || '';
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && (getSupabaseServiceRoleKey() || getSupabaseAnonKey()));
}

let cachedAdminClient = null;
let cachedPublicClient = null;

export function getSupabaseAdminClient() {
  if (!getSupabaseUrl() || !getSupabaseServiceRoleKey()) {
    throw new Error('Supabase admin env is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cachedAdminClient;
}

export function getSupabasePublicClient() {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) {
    throw new Error('Supabase public env is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  if (!cachedPublicClient) {
    cachedPublicClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cachedPublicClient;
}

export async function getSupabaseHealthSnapshot() {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      connected: false,
      message: 'Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).'
    };
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();

  const [{ count: txCount, error: txError }, { count: marketCount, error: marketError }] = await Promise.all([
    client.from('money_transactions').select('id', { count: 'exact', head: true }),
    client.from('marketplace_listings').select('id', { count: 'exact', head: true })
  ]);

  if (txError || marketError) {
    return {
      configured: true,
      connected: false,
      message: txError?.message || marketError?.message || 'Supabase query failed.'
    };
  }

  return {
    configured: true,
    connected: true,
    counts: {
      money_transactions: Number(txCount || 0),
      marketplace_listings: Number(marketCount || 0)
    }
  };
}

export async function readSupabaseCommonDataSnapshot(limit = 100) {
  if (!isSupabaseConfigured()) {
    return {
      source: 'supabase',
      configured: false,
      connected: false,
      message: 'Supabase env not configured',
      history: [],
      marketplace: [],
      summary: {
        totalRows: 0,
        upiSpend: 0,
        receiptTracked: 0,
        combined: 0
      }
    };
  }

  const capped = Math.max(1, Math.trunc(limit));
  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();

  const [{ data: historyRows, error: historyError }, { data: marketRows, error: marketError }] = await Promise.all([
    client.from('v_combined_history').select('*').order('event_at', { ascending: false }).limit(capped * 2),
    client.from('marketplace_listings').select('*').order('created_at', { ascending: false }).limit(capped)
  ]);

  if (historyError || marketError) {
    return {
      source: 'supabase',
      configured: true,
      connected: false,
      message: historyError?.message || marketError?.message || 'Supabase read failed',
      history: [],
      marketplace: [],
      summary: {
        totalRows: 0,
        upiSpend: 0,
        receiptTracked: 0,
        combined: 0
      }
    };
  }

  const history = (historyRows || []).map((row) => ({
    id: `${row.history_type === 'upi-spend' ? 'tx' : 'rc'}-${row.row_id}`,
    historyType: row.history_type,
    source: row.source,
    name: row.name,
    amount: Number(row.amount || 0),
    category: row.category,
    paymentType: row.payment_type,
    needOrWant: row.need_or_want,
    gst: row.gst || '',
    note: row.note || '',
    timestamp: row.event_at ? new Date(row.event_at).getTime() : Date.now()
  }));

  const marketplace = (marketRows || []).map((row) => ({
    id: row.id,
    source: row.source,
    type: row.type,
    brand: row.brand,
    originalValue: Number(row.original_value || 0),
    askingPrice: Number(row.asking_price || 0),
    platformFee: Number(row.platform_fee || 0),
    sellerNote: row.seller_note || '',
    expiry: row.expiry || '',
    status: row.status || 'active',
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  }));

  const upiSpend = history
    .filter((row) => row.historyType === 'upi-spend')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const receiptTracked = history
    .filter((row) => row.historyType === 'receipt-track')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    source: 'supabase',
    configured: true,
    connected: true,
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

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.trunc(num);
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export async function getCurrentWalletState() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('wallet_state')
    .select('id, balance, updated_at')
    .order('id', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Failed to read wallet state.');
  }

  if (!data || !data.length) {
    const { data: inserted, error: insertError } = await client
      .from('wallet_state')
      .insert({ id: 1, balance: 0 })
      .select('id, balance, updated_at')
      .single();

    if (insertError) {
      throw new Error(insertError.message || 'Failed to initialize wallet state.');
    }

    return {
      id: Number(inserted.id || 1),
      balance: Number(inserted.balance || 0),
      updatedAt: inserted.updated_at ? new Date(inserted.updated_at).getTime() : Date.now()
    };
  }

  const row = data[0];
  return {
    id: Number(row.id || 1),
    balance: Number(row.balance || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  };
}

export async function updateWalletBalance(nextBalance) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const current = await getCurrentWalletState();

  const { error } = await client
    .from('wallet_state')
    .update({ balance: toInt(nextBalance), updated_at: new Date().toISOString() })
    .eq('id', current.id);

  if (error) {
    throw new Error(error.message || 'Failed to update wallet state.');
  }

  return {
    id: current.id,
    balance: toInt(nextBalance),
    updatedAt: Date.now()
  };
}

export async function insertWalletEvent({ source = 'phonepe', eventType = 'update', amount = 0, balance = 0, note = '' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { error } = await client.from('wallet_events').insert({
    source: String(source),
    event_type: String(eventType),
    amount: toInt(amount),
    balance: toInt(balance),
    note: String(note || '')
  });

  if (error) {
    throw new Error(error.message || 'Failed to insert wallet event.');
  }
}

export async function insertMoneyTransaction({ source = 'phonepe', kind = 'payment', name = '', amount = 0, category = 'Others', type = 'cash', needOrWant = 'need', gst = '', note = '' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('money_transactions')
    .insert({
      source: String(source),
      kind: String(kind),
      name: String(name),
      amount: toInt(amount),
      category: String(category),
      type: String(type),
      need_or_want: String(needOrWant),
      gst: String(gst || ''),
      note: String(note || '')
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to insert money transaction.');
  }

  return data;
}

export async function insertReceiptHistory({ source = 'phonepe', merchant = '', amount = 0, category = 'Others', note = '', entrySource = 'manual', fileName = '', fileType = '' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('receipts_history')
    .insert({
      source: String(source),
      merchant: String(merchant),
      amount: toInt(amount),
      category: String(category),
      note: String(note || ''),
      entry_source: String(entrySource || 'manual'),
      file_name: String(fileName || ''),
      file_type: String(fileType || '')
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to insert receipt history.');
  }

  return data;
}

export async function insertEmiRecord({ source = 'phonepe', name = '', amount = 0, dueDate = 0 }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('emi_records')
    .insert({
      source: String(source),
      name: String(name),
      amount: toInt(amount),
      due_date: toInt(dueDate)
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to insert EMI record.');
  }

  return data;
}

export async function readPhonepeStateSnapshot(limit = 500) {
  if (!isSupabaseConfigured()) {
    return {
      source: { connected: false, message: 'Supabase not configured' },
      wallet: { balance: 0, updatedAt: Date.now() },
      transactions: [],
      recentTransactions: [],
      receipts: [],
      recentReceipts: [],
      emis: [],
      categoryTotals: {},
      monthlySpent: 0,
      trackedReceiptSpent: 0,
      combinedMonthlySpent: 0,
      dashboard: {
        summary: {
          generatedAt: Date.now(),
          walletBalance: 0,
          transactionSpend: 0,
          upiSpend: 0,
          receiptSpend: 0,
          trackedSpend: 0,
          needSpend: 0,
          wantSpend: 0,
          receiptCount: 0,
          topCategory: null,
          dailySeries: [],
          suggestions: []
        },
        suggestions: [],
        report: {
          filename: `finsight-report-${Date.now()}.txt`,
          generatedAt: Date.now(),
          text: 'Supabase not configured'
        }
      },
      updatedAt: Date.now()
    };
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const capped = Math.max(1, Math.trunc(limit));

  const [wallet, txRes, rcRes, emiRes] = await Promise.all([
    getCurrentWalletState(),
    client.from('money_transactions').select('*').eq('source', 'phonepe').order('created_at', { ascending: false }).limit(capped),
    client.from('receipts_history').select('*').eq('source', 'phonepe').order('created_at', { ascending: false }).limit(capped),
    client.from('emi_records').select('*').eq('source', 'phonepe').order('created_at', { ascending: false }).limit(capped)
  ]);

  if (txRes.error || rcRes.error || emiRes.error) {
    throw new Error(txRes.error?.message || rcRes.error?.message || emiRes.error?.message || 'Failed to read PhonePe state.');
  }

  const transactions = (txRes.data || []).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || ''),
    amount: Number(row.amount || 0),
    category: String(row.category || 'Others'),
    type: String(row.type || 'cash'),
    needOrWant: String(row.need_or_want || 'need'),
    gst: String(row.gst || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  }));

  const receipts = (rcRes.data || []).map((row) => ({
    id: Number(row.id || 0),
    merchant: String(row.merchant || ''),
    amount: Number(row.amount || 0),
    category: String(row.category || 'Others'),
    note: String(row.note || ''),
    source: String(row.entry_source || 'manual'),
    fileName: String(row.file_name || ''),
    fileType: String(row.file_type || ''),
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  }));

  const emis = (emiRes.data || []).map((row) => ({
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
  const categoryTotals = Object.create(null);
  const addCategory = (category, amount) => {
    const key = String(category || 'Others');
    categoryTotals[key] = Number(categoryTotals[key] || 0) + Number(amount || 0);
  };

  let monthlySpent = 0;
  for (const row of monthTransactions) {
    monthlySpent += Number(row.amount || 0);
    addCategory(row.category, row.amount);
  }

  let trackedReceiptSpent = 0;
  for (const row of monthReceipts) {
    trackedReceiptSpent += Number(row.amount || 0);
    addCategory(row.category, row.amount);
  }

  return {
    source: { connected: true, backend: 'supabase' },
    wallet: {
      balance: Number(wallet.balance || 0),
      updatedAt: Number(wallet.updatedAt || Date.now())
    },
    transactions,
    recentTransactions: transactions.slice(0, 5),
    receipts,
    recentReceipts: receipts.slice(0, 5),
    emis,
    categoryTotals,
    monthlySpent: toMoney(monthlySpent),
    trackedReceiptSpent: toMoney(trackedReceiptSpent),
    combinedMonthlySpent: toMoney(monthlySpent + trackedReceiptSpent),
    updatedAt: Date.now()
  };
}

export async function readLatestBudgetRecord(defaultBudget = 1000000) {
  if (!isSupabaseConfigured()) {
    return toInt(defaultBudget);
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('budget_records')
    .select('monthly_budget, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to read budget record.');
  }

  if (!data) {
    return toInt(defaultBudget);
  }

  return toInt(data.monthly_budget || defaultBudget);
}

export async function insertBudgetRecord({ source = 'finsight', monthlyBudget = 0, note = '' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('budget_records')
    .insert({
      source: String(source),
      monthly_budget: toInt(monthlyBudget),
      note: String(note || '')
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to insert budget record.');
  }

  return data;
}

export async function insertMarketplaceListing({ source = 'finsight', type = 'gift-card', brand = '', originalValue = 0, askingPrice = 0, platformFee = 0, sellerNote = '', expiry = '', status = 'active' }) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('marketplace_listings')
    .insert({
      source: String(source),
      type: String(type),
      brand: String(brand),
      original_value: toMoney(originalValue),
      asking_price: toMoney(askingPrice),
      platform_fee: toMoney(platformFee),
      seller_note: String(sellerNote || ''),
      expiry: String(expiry || ''),
      status: String(status || 'active')
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to insert marketplace listing.');
  }

  return {
    id: data.id,
    source: data.source,
    type: data.type,
    brand: data.brand,
    originalValue: Number(data.original_value || 0),
    askingPrice: Number(data.asking_price || 0),
    platformFee: Number(data.platform_fee || 0),
    sellerNote: data.seller_note || '',
    expiry: data.expiry || '',
    status: data.status || 'active',
    timestamp: data.created_at ? new Date(data.created_at).getTime() : Date.now()
  };
}

export async function listMarketplaceListings(limit = 100) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const client = getSupabaseServiceRoleKey() ? getSupabaseAdminClient() : getSupabasePublicClient();
  const { data, error } = await client
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.trunc(limit)));

  if (error) {
    throw new Error(error.message || 'Failed to list marketplace rows.');
  }

  return (data || []).map((row) => ({
    id: row.id,
    source: row.source,
    type: row.type,
    brand: row.brand,
    originalValue: Number(row.original_value || 0),
    askingPrice: Number(row.asking_price || 0),
    platformFee: Number(row.platform_fee || 0),
    sellerNote: row.seller_note || '',
    expiry: row.expiry || '',
    status: row.status || 'active',
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  }));
}