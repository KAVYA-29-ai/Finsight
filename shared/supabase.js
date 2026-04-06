import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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