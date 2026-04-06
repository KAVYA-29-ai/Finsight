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

export function formatShortRupee(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100000) {
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;
  }
  return formatRupee(amount);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  }).format(new Date(timestamp));
}

export function formatClock(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export function formatDateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function startOfMonth(date = new Date()) {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function daysInMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function monthLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function normalizeCategory(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'Others';
  const map = new Map([
    ['food', 'Food'],
    ['transport', 'Transport'],
    ['travel', 'Transport'],
    ['shopping', 'Shopping'],
    ['entertainment', 'Entertainment'],
    ['health', 'Health'],
    ['education', 'Education'],
    ['utilities', 'Utilities'],
    ['rent', 'Utilities'],
    ['others', 'Others']
  ]);
  return map.get(value) || 'Others';
}

export function inferNeedOrWant(name, category) {
  const text = `${String(name || '').toLowerCase()} ${String(category || '').toLowerCase()}`;
  const needKeywords = ['metro', 'bus', 'auto', 'fuel', 'petrol', 'diesel', 'medicine', 'doctor', 'school', 'college', 'tuition', 'rent', 'electricity', 'water', 'internet', 'health'];
  const wantKeywords = ['swiggy', 'zomato', 'instamart', 'blinkit', 'shopping', 'movie', 'cinema', 'restaurant', 'food delivery', 'amazon', 'myntra', 'netflix', 'hotstar'];

  let needScore = 0;
  let wantScore = 0;

  if (['Transport', 'Health', 'Education', 'Utilities'].includes(normalizeCategory(category))) {
    needScore += 2;
  }
  if (['Food', 'Shopping', 'Entertainment', 'Others'].includes(normalizeCategory(category))) {
    wantScore += 1;
  }

  for (const keyword of needKeywords) {
    if (text.includes(keyword)) needScore += 2;
  }
  for (const keyword of wantKeywords) {
    if (text.includes(keyword)) wantScore += 2;
  }

  return wantScore > needScore ? 'want' : 'need';
}

export function calculatePlatformFee(originalValue) {
  const amount = Number(originalValue || 0);
  if (amount < 500) {
    return amount <= 0 ? 0 : 10;
  }
  if (amount <= 2000) {
    return 20;
  }
  return Math.round(amount * 0.02);
}

export function dailyBudget(monthlyBudget, date = new Date()) {
  return Number(monthlyBudget || 0) / daysInMonth(date);
}

export function healthScoreForSpend(spentToday, monthlyBudget, date = new Date()) {
  const dailyCap = dailyBudget(monthlyBudget, date);
  if (dailyCap <= 0) {
    return { score: 100, label: 'Excellent', color: 'green' };
  }
  const ratio = spentToday / dailyCap;
  if (ratio <= 1) return { score: 92, label: 'Excellent', color: 'green' };
  if (ratio <= 1.3) return { score: 68, label: 'Healthy', color: 'yellow' };
  if (ratio <= 1.5) return { score: 36, label: 'Risky', color: 'orange' };
  return { score: 12, label: 'Critical', color: 'red' };
}

export function computeSpendByCategory(transactions = [], monthStart = startOfMonth()) {
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category.name, 0]));
  for (const transaction of transactions) {
    const timestamp = Number(transaction.timestamp || transaction.timestamp_ms || 0);
    if (timestamp < monthStart.getTime()) continue;
    const category = normalizeCategory(transaction.category);
    totals[category] = Number(totals[category] || 0) + Number(transaction.amount || 0);
  }
  return totals;
}

export function computeNeedWantSplit(transactions = []) {
  let need = 0;
  let want = 0;
  for (const transaction of transactions) {
    const amount = Number(transaction.amount || 0);
    if (String(transaction.needOrWant || transaction.need_or_want || '').toLowerCase() === 'need') {
      need += amount;
    } else {
      want += amount;
    }
  }
  const total = need + want || 1;
  return {
    need,
    want,
    needPercent: (need / total) * 100,
    wantPercent: (want / total) * 100
  };
}

export function summarizeTransactions(transactions = [], date = new Date()) {
  const monthStart = startOfMonth(date).getTime();
  const todayStart = startOfDay(date).getTime();
  const monthTransactions = transactions.filter((transaction) => Number(transaction.timestamp || transaction.timestamp_ms || 0) >= monthStart);
  const todayTransactions = monthTransactions.filter((transaction) => Number(transaction.timestamp || transaction.timestamp_ms || 0) >= todayStart);
  const monthlySpent = monthTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const todaySpent = todayTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const daysElapsed = Math.max(date.getDate(), 1);
  const averageDaily = monthlySpent / daysElapsed;
  const remainingBudget = 0;
  return { monthTransactions, todayTransactions, monthlySpent, todaySpent, averageDaily, remainingBudget };
}

export function createEmptyDayGrid(days = 30) {
  return Array.from({ length: days }, (_, index) => ({
    date: null,
    status: 'gray',
    spent: 0,
    budget: 0,
    label: index
  }));
}

export function streakStatusForDay(spent, budget) {
  if (!budget) return 'gray';
  if (spent <= budget) return 'green';
  if (spent <= budget * 1.3) return 'yellow';
  if (spent <= budget * 1.5) return 'orange';
  return 'red';
}

export function platformFeeLabel(fee) {
  return formatRupee(fee);
}
