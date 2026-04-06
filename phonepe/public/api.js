function sanitizeConfigValue(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('%VITE_')) return '';
  return raw.replace(/\/$/, '');
}

const runtimeConfig = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {};

// Runtime API base URL injected from index.html; empty means same-origin (/api) for local proxy.
const API_BASE = sanitizeConfigValue(runtimeConfig.API_URL) || sanitizeConfigValue(runtimeConfig.PHONEPE_API_URL) || '';

function assertApiConfigured() {
  if (typeof window === 'undefined') return;
  const host = String(window.location.hostname || '').toLowerCase();
  const isHosted = host.includes('vercel.app');
  if (isHosted && !API_BASE) {
    throw new Error('Backend API URL missing. Set VITE_PHONEPE_API_URL in Vercel to your deployed backend URL.');
  }
}

async function requestJson(url, options = {}) {
  assertApiConfigured();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const response = await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    const hint = API_BASE
      ? `API returned non-JSON response from ${API_BASE}. Check API deployment and URL.`
      : 'API returned non-JSON response. For deployment, set VITE_PHONEPE_API_URL in Vercel.';
    throw new Error(hint);
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

export const api = {
  async getState() {
    const payload = await requestJson('/api/state');
    return payload.data;
  },
  async addMoney(amount) {
    const payload = await requestJson('/api/wallet/add', {
      method: 'POST',
      body: JSON.stringify({ amount })
    });
    return payload.data;
  },
  async createTransaction(data) {
    const payload = await requestJson('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return payload.data;
  },
  async createReceipt(data) {
    const payload = await requestJson('/api/receipts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return payload.data;
  },
  async createEmi(data) {
    const payload = await requestJson('/api/emis', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return payload.data;
  },
  async getReport() {
    const payload = await requestJson('/api/report');
    return payload.data;
  }
};
