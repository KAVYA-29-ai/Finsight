async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();
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
