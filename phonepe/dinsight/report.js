const DAY_MS = 24 * 60 * 60 * 1000;

function formatRupee(value) {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
}

function dayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit'
  }).format(new Date(timestamp));
}

function sumAmount(items, predicate = () => true) {
  return items.reduce((total, item) => (predicate(item) ? total + Number(item.amount || 0) : total), 0);
}

function pickTopEntry(entries) {
  let topName = '';
  let topAmount = 0;

  for (const [name, amount] of Object.entries(entries || {})) {
    if (Number(amount || 0) > topAmount) {
      topName = name;
      topAmount = Number(amount || 0);
    }
  }

  return topName ? { name: topName, amount: topAmount } : null;
}

function buildDailySeries(transactions, receipts, span = 7) {
  const today = new Date();
  const buckets = new Map();

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY_MS);
    buckets.set(dayKey(date.getTime()), {
      date: date.getTime(),
      label: dayLabel(date.getTime()),
      total: 0
    });
  }

  for (const item of [...transactions, ...receipts]) {
    const bucket = buckets.get(dayKey(item.timestamp));
    if (bucket) {
      bucket.total += Number(item.amount || 0);
    }
  }

  return [...buckets.values()];
}

function buildReportText(summary) {
  const lines = [
    'FinSight report',
    `Generated: ${new Date(summary.generatedAt).toLocaleString('en-IN')}`,
    '',
    'Wallet',
    `Current balance: ${formatRupee(summary.walletBalance)}`,
    `UPI spend this month: ${formatRupee(summary.upiSpend)}`,
    '',
    'Tracked spending',
    `Transactions this month: ${formatRupee(summary.transactionSpend)}`,
    `Receipt entries this month: ${formatRupee(summary.receiptSpend)}`,
    `Total tracked spend: ${formatRupee(summary.trackedSpend)}`,
    `Need spend: ${formatRupee(summary.needSpend)}`,
    `Want spend: ${formatRupee(summary.wantSpend)}`,
    `Receipt entries: ${summary.receiptCount}`,
    '',
    'Top category',
    summary.topCategory ? `${summary.topCategory.name} (${formatRupee(summary.topCategory.amount)})` : 'No category data yet',
    '',
    'Daily graph',
    ...summary.dailySeries.map((entry) => `${entry.label}: ${formatRupee(entry.total)}`),
    '',
    'AI suggestions',
    ...summary.suggestions.map((suggestion) => `- ${suggestion.title}: ${suggestion.detail}`)
  ];

  return lines.join('\n');
}

/**
 * Builds dashboard insights and a downloadable text report from the current app state.
 * @param {object} state - App state snapshot.
 * @returns {{summary: object, suggestions: Array<object>, report: object}} Dashboard payload.
 */
export function buildDashboardInsights(state) {
  const wallet = state?.wallet || { balance: 0 };
  const transactions = state?.transactions || [];
  const receipts = state?.receipts || [];
  const categoryTotals = state?.categoryTotals || {};

  const transactionSpend = sumAmount(transactions);
  const upiSpend = sumAmount(transactions, (transaction) => transaction.type === 'upi');
  const needSpend = sumAmount(transactions, (transaction) => transaction.needOrWant === 'need');
  const wantSpend = sumAmount(transactions, (transaction) => transaction.needOrWant === 'want');
  const receiptSpend = sumAmount(receipts);
  const trackedSpend = transactionSpend + receiptSpend;
  const receiptCount = receipts.length;
  const dailySeries = buildDailySeries(transactions, receipts);
  const topCategory = pickTopEntry(categoryTotals);
  const largestDay = [...dailySeries].sort((left, right) => right.total - left.total)[0] || null;

  const suggestions = [];

  if (receiptCount > 0) {
    suggestions.push({
      title: 'Receipt log is separate',
      detail: `${receiptCount} receipt entries are stored without reducing wallet balance.`
    });
  }

  if (wantSpend > needSpend && wantSpend > 0) {
    suggestions.push({
      title: 'Want spend is ahead',
      detail: `${formatRupee(wantSpend)} is tagged as wants this month. Trim one non-essential category first.`
    });
  } else {
    suggestions.push({
      title: 'Need spend is steady',
      detail: `${formatRupee(needSpend)} is tagged as needs. Keep recurring essentials on this pattern.`
    });
  }

  if (topCategory) {
    suggestions.push({
      title: 'Top category watch',
      detail: `${topCategory.name} has the highest tracked spend at ${formatRupee(topCategory.amount)}.`
    });
  }

  if (largestDay) {
    suggestions.push({
      title: 'Peak day insight',
      detail: `${largestDay.label} was your heaviest tracked day at ${formatRupee(largestDay.total)}.`
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      title: 'Ready for tracking',
      detail: 'Add a receipt or pay transaction to unlock spending suggestions.'
    });
  }

  const reportSummary = {
    generatedAt: Date.now(),
    walletBalance: Number(wallet.balance || 0),
    transactionSpend,
    upiSpend,
    receiptSpend,
    trackedSpend,
    needSpend,
    wantSpend,
    receiptCount,
    topCategory,
    dailySeries,
    suggestions
  };

  return {
    summary: reportSummary,
    suggestions,
    report: {
      filename: `finsight-report-${dayKey(Date.now())}.txt`,
      generatedAt: reportSummary.generatedAt,
      text: buildReportText(reportSummary)
    }
  };
}