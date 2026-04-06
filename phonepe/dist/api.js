import { createPhonePeBrowserApi } from './supabase-browser.js';

function sanitizeConfigValue(value) {
	const raw = String(value || '').trim();
	if (!raw || raw.includes('%VITE_')) return '';
	return raw.replace(/\/$/, '');
}

const runtimeConfig = typeof window !== 'undefined' ? (window.__APP_CONFIG__ || {}) : {};
const API_BASE = sanitizeConfigValue(runtimeConfig.API_URL) || sanitizeConfigValue(runtimeConfig.PHONEPE_API_URL) || '';
const USE_REMOTE_API = false;
const browserApi = createPhonePeBrowserApi();

async function requestJson(url, options = {}) {
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
		throw new Error('API returned non-JSON response. Check Vercel API routes and rewrites.');
	}

	if (!response.ok || payload.ok === false) {
		throw new Error(payload.error || payload.message || 'Request failed');
	}
	return payload;
}

export const api = {
	async getState() {
		if (!USE_REMOTE_API) return browserApi.getState();
		const payload = await requestJson('/api/state');
		return payload.data;
	},
	async addMoney(amount) {
		if (!USE_REMOTE_API) return browserApi.addMoney(amount);
		const payload = await requestJson('/api/wallet/add', {
			method: 'POST',
			body: JSON.stringify({ amount })
		});
		return payload.data;
	},
	async createTransaction(data) {
		if (!USE_REMOTE_API) return browserApi.createTransaction(data);
		const payload = await requestJson('/api/transactions', {
			method: 'POST',
			body: JSON.stringify(data)
		});
		return payload.data;
	},
	async createReceipt(data) {
		if (!USE_REMOTE_API) return browserApi.createReceipt(data);
		const payload = await requestJson('/api/receipts', {
			method: 'POST',
			body: JSON.stringify(data)
		});
		return payload.data;
	},
	async createEmi(data) {
		if (!USE_REMOTE_API) return browserApi.createEmi(data);
		const payload = await requestJson('/api/emis', {
			method: 'POST',
			body: JSON.stringify(data)
		});
		return payload.data;
	},
	async getReport() {
		if (!USE_REMOTE_API) return browserApi.getReport();
		const payload = await requestJson('/api/report');
		return payload.data;
	}
};
