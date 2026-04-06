export const CATEGORIES = [
  { name: 'Food', icon: '🍜', accent: '#ff7a59' },
  { name: 'Transport', icon: '🛺', accent: '#42b883' },
  { name: 'Shopping', icon: '🛍️', accent: '#6c7cff' },
  { name: 'Entertainment', icon: '🎬', accent: '#ff6fb7' },
  { name: 'Health', icon: '💊', accent: '#2dd4bf' },
  { name: 'Education', icon: '📚', accent: '#f59e0b' },
  { name: 'Utilities', icon: '💡', accent: '#8b5cf6' },
  { name: 'Others', icon: '🧾', accent: '#94a3b8' }
];

export function formatRupee(value) {
  const amount = Number(value || 0);
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatTimeStamp(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  }).format(new Date(timestamp));
}

export function formatShortTime(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export function transactionIcon(category) {
  return CATEGORIES.find((entry) => entry.name === category)?.icon || '•';
}
