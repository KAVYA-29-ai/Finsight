const state = {
  view: 'home',
  summary: null,
  categories: null,
  daily: null,
  insights: null,
  weeklyReport: null,
  detailedReport: null
};

const apiBase = window.location.port === '3001'
  ? ''
  : `${window.location.protocol}//${window.location.hostname}:3001`;

function apiUrl(path) {
  if (!path.startsWith('/')) return path;
  return `${apiBase}${path}`;
}

function formatRupee(value) {
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))}`;
}

function optionalNumberFromInput(selector) {
  const value = String(document.querySelector(selector)?.value || '').trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreLabel(score) {
  if (score >= 76) return 'Excellent';
  if (score >= 50) return 'Healthy';
  if (score >= 25) return 'Risky';
  return 'Critical';
}

async function fileToBase64(file) {
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function apiGet(url) {
  const response = await fetch(apiUrl(url));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function apiSend(url, method, body = {}) {
  const response = await fetch(apiUrl(url), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    let message = `Request failed: ${url}`;
    try {
      const payload = JSON.parse(await response.text());
      if (payload?.message || payload?.error) {
        message = payload.message || payload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function setActiveView(view) {
  state.view = view;

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  document.querySelectorAll('[data-section]').forEach((section) => {
    section.style.display = section.dataset.section === view ? '' : 'none';
  });
}

function renderTopCards() {
  const summary = state.summary;
  if (!summary) return;

  const usage = Math.round(summary.totals.budget_usage_percent || 0);
  const score = Number(summary.health_score || 0);

  document.querySelector('#stat-monthly-spent').textContent = formatRupee(summary.totals.monthly_spent);
  document.querySelector('#stat-usage').textContent = `${usage}% used | UPI ${formatRupee(summary.totals.spent_by_upi)} | Cash ${formatRupee(summary.totals.spent_by_cash)}`;
  document.querySelector('#score-value').textContent = String(score);
  document.querySelector('#score-label').textContent = scoreLabel(score);
  document.querySelector('#score-caption').textContent = summary.health_breakdown.reasons?.[0] || 'Budget is in stable zone';
  document.querySelector('#stat-predicted').textContent = formatRupee(summary.totals.predicted_next_month_spend);
  document.querySelector('#stat-today-spent').textContent = formatRupee(summary.totals.today_spent);
  document.querySelector('#stat-budget-left').textContent = formatRupee(summary.wallet.monthly_limit);
  document.querySelector('#stat-avg-daily').textContent = formatRupee(summary.totals.average_daily_spend);
  document.querySelector('#budget-left').textContent = `Budget left: ${formatRupee(summary.totals.budget_left)} from ${formatRupee(summary.wallet.monthly_limit)}`;
  document.querySelector('#budget-input').value = Math.round(summary.wallet.monthly_limit);

  const scoreRing = document.querySelector('#score-ring');
  const ringColor = score >= 76 ? '#14c58f' : score >= 50 ? '#4f6dff' : score >= 25 ? '#ffb84d' : '#ff6b78';
  scoreRing.style.borderColor = `${ringColor}55`;
  scoreRing.querySelector('strong').style.color = ringColor;
}

function renderCriticalAlert() {
  const host = document.querySelector('#critical-alert');
  if (!state.summary) return;

  if (state.summary.critical_alert) {
    host.innerHTML = '<div class="critical-banner">Critical alert active. Pause non-essential spending for 72 hours.</div>';
  } else {
    host.innerHTML = '';
  }
}

function renderCategoryDonut() {
  const donut = document.querySelector('#category-donut');
  const legend = document.querySelector('#category-chart');
  const rows = (state.categories?.categories || []).slice(0, 6);

  if (!rows.length) {
    legend.innerHTML = '<p class="muted">No category data yet.</p>';
    donut.style.background = 'conic-gradient(#355de0 0 100%)';
    return;
  }

  const palette = ['#15cb7a', '#33a8ff', '#21c8c2', '#ffb600', '#8f5fff', '#fd5f55'];
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0) || 1;
  let start = 0;
  const slices = rows.map((row, index) => {
    const percent = (Number(row.total || 0) / total) * 100;
    const end = start + percent;
    const chunk = `${palette[index % palette.length]} ${start}% ${end}%`;
    start = end;
    return chunk;
  });

  donut.style.background = `conic-gradient(${slices.join(', ')})`;
  legend.innerHTML = rows.map((row, index) => `
    <div class="line-item">
      <span><i style="display:inline-block;width:10px;height:10px;border-radius:99px;background:${palette[index % palette.length]};margin-right:8px"></i>${row.category}</span>
      <strong>${formatRupee(row.total)}</strong>
    </div>
  `).join('');
}

function renderDailyBars() {
  const host = document.querySelector('#daily-chart');
  const values = state.daily?.values || [];
  const labels = state.daily?.labels || [];
  if (!values.length) {
    host.innerHTML = '<p class="muted">No daily data.</p>';
    return;
  }

  const max = Math.max(...values.map((value) => Number(value || 0)), 1);
  const width = 640;
  const height = 260;
  const padX = 34;
  const padY = 18;
  const spanX = Math.max(width - padX * 2, 1);
  const spanY = Math.max(height - padY * 2, 1);
  const step = values.length > 1 ? spanX / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const amount = Number(value || 0);
    const x = padX + step * index;
    const y = padY + (1 - amount / max) * spanY;
    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      value: amount,
      label: labels[index] || ''
    };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  host.innerHTML = `
    <div class="line-chart-wrap">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Daily spend line chart">
        <defs>
          <linearGradient id="dailyAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(82, 176, 255, 0.34)" />
            <stop offset="100%" stop-color="rgba(82, 176, 255, 0.02)" />
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="line-axis" />
        <path d="${areaPath}" class="line-area"></path>
        <path d="${linePath}" class="line-path"></path>
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4.2" class="line-point"></circle>`).join('')}
      </svg>
      <div class="line-values">${points.map((point) => `<span>${point.value ? formatRupee(point.value) : '—'}</span>`).join('')}</div>
      <div class="line-labels">${points.map((point) => `<small>${point.label}</small>`).join('')}</div>
    </div>
  `;
}

function renderInsights() {
  const insightList = document.querySelector('#insights-list');
  const warningHost = document.querySelector('#insights-warning');
  const futureAlertsHost = document.querySelector('#future-alerts');
  const health = document.querySelector('#insights-health');
  const needs = document.querySelector('#needs-share');
  const wants = document.querySelector('#wants-share');
  const needsBar = document.querySelector('#needs-bar');
  const wantsBar = document.querySelector('#wants-bar');
  const impact = document.querySelector('#insights-impact');
  const remark = document.querySelector('#need-want-remark');

  if (!state.insights) return;

  const needsShare = Math.round(state.insights.needs_share || 0);
  const wantsShare = Math.round(state.insights.wants_share || 0);
  const impactLabel = wantsShare >= 70 ? 'Risk-heavy' : wantsShare >= 45 ? 'Needs attention' : 'Balanced';

  insightList.innerHTML = (state.insights.tips || []).map((tip, index) => `
    <li class="tip-card">
      <span class="tip-index">0${index + 1}</span>
      <p>${tip}</p>
    </li>
  `).join('') || '<li class="tip-card"><p>No insights yet.</p></li>';

  warningHost.innerHTML = state.insights.warning ? `<div class="warning-banner impact-banner">${state.insights.warning}</div>` : '';
  futureAlertsHost.innerHTML = (state.insights.future_alerts || []).map((alert) => `
    <div class="future-alert ${String(alert.priority || '').toLowerCase()}">
      <div class="future-alert-head">
        <span class="pill">${alert.priority}</span>
        <strong>${alert.title}</strong>
      </div>
      <span>${alert.message}</span>
    </div>
  `).join('');
  health.textContent = `Health: ${state.insights.health_score || 0}`;
  needs.textContent = `${needsShare}%`;
  wants.textContent = `${wantsShare}%`;
  if (needsBar) needsBar.style.width = `${needsShare}%`;
  if (wantsBar) wantsBar.style.width = `${wantsShare}%`;
  if (impact) impact.textContent = impactLabel;
  if (remark) {
    remark.textContent = state.insights.need_want_insight || 'AI will suggest a need-vs-want action after enough spending data.';
  }
}

function renderReport() {
  const host = document.querySelector('#weekly-report');
  if (!state.weeklyReport) return;

  host.innerHTML = [
    ['Impulse spent', formatRupee(state.weeklyReport.impulse_spent)],
    ['Savings missed', formatRupee(state.weeklyReport.savings_missed)],
    ['Next week forecast', formatRupee(state.weeklyReport.next_week_forecast)],
    ['Next month forecast', formatRupee(state.weeklyReport.next_month_prediction)],
    ['Suggested budget', formatRupee(state.weeklyReport.suggested_budget)],
    ['Essentials spent', formatRupee(state.weeklyReport.essentials_spent)],
    ['Lifestyle spent', formatRupee(state.weeklyReport.lifestyle_spent)]
  ].map(([label, value]) => `
    <div class="line-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');

  host.innerHTML += `<p class="muted">${state.weeklyReport.summary}</p>`;
}

function renderDetailedReport() {
  const host = document.querySelector('#detailed-report');
  if (!state.detailedReport) {
    host.innerHTML = '<p class="muted">No detailed report data.</p>';
    return;
  }

  const days = state.detailedReport.days || [];
  if (!days.length) {
    host.innerHTML = '<p class="muted">No entries recorded this month.</p>';
    return;
  }

  host.innerHTML = days.map((day) => `
    <article class="day-card">
      <div class="day-head">
        <strong>${new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
        <span>Total ${formatRupee(day.total)} | UPI ${formatRupee(day.upi_total)} | Cash ${formatRupee(day.cash_total)}</span>
      </div>
      <div class="day-table-wrap">
        <table class="day-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Name</th>
              <th>Category</th>
              <th>Mode</th>
              <th>Need/Want</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${day.entries.map((entry) => `
              <tr>
                <td>${entry.time}</td>
                <td>${entry.name}</td>
                <td>${entry.category}</td>
                <td>${String(entry.payment_mode || '').toUpperCase()}</td>
                <td>${entry.need_or_want}</td>
                <td>${formatRupee(entry.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>
  `).join('');
}

function renderAll() {
  renderTopCards();
  renderCriticalAlert();
  renderCategoryDonut();
  renderDailyBars();
  renderInsights();
  renderReport();
  renderDetailedReport();
}

async function refreshDashboard() {
  const [summary, categories, daily, insights, report, detailedReport] = await Promise.all([
    apiGet('/api/analytics/summary'),
    apiGet('/api/analytics/categories'),
    apiGet('/api/analytics/daily'),
    apiGet('/api/analytics/insights'),
    apiGet('/api/analytics/weekly-report'),
    apiGet('/api/analytics/detailed-report')
  ]);

  state.summary = summary;
  state.categories = categories;
  state.daily = daily;
  state.insights = insights;
  state.weeklyReport = report;
  state.detailedReport = detailedReport;

  renderAll();
}

async function updateBudget() {
  const input = document.querySelector('#budget-input');
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Budget amount should be positive');
  }

  await apiSend('/api/budget', 'PUT', { monthly_limit: amount });
  await refreshDashboard();
}

async function parseReceipt() {
  const file = document.querySelector('#receipt-file').files?.[0];
  if (!file) {
    throw new Error('Choose a receipt file first');
  }

  const fileBase64 = await fileToBase64(file);

  const payload = await apiSend('/api/analytics/receipt-upload', 'POST', {
    filename: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    file_base64: fileBase64,
    merchant_hint: document.querySelector('#bill-merchant').value || null
  });

  document.querySelector('#bill-merchant').value = payload.merchant_name || '';
  document.querySelector('#bill-category').value = payload.category || '';
  document.querySelector('#bill-amount').value = Math.round(payload.estimated_amount || 0);
  if (Number.isFinite(Number(payload.gst_rate))) {
    document.querySelector('#bill-gst').value = Number(payload.gst_rate);
  }
  document.querySelector('#bill-gst-number').value = payload.gst_number || '';
  document.querySelector('#bill-result').textContent = payload.message;
}

async function uploadReceiptAndSave() {
  const file = document.querySelector('#receipt-file').files?.[0];
  const merchant = document.querySelector('#bill-merchant').value || null;
  const amount = optionalNumberFromInput('#bill-amount');

  if (!file && (!merchant || !Number.isFinite(amount) || amount <= 0)) {
    throw new Error('For manual entry fill merchant and amount, or choose a receipt file');
  }

  const fileBase64 = file ? await fileToBase64(file) : null;

  const payload = await apiSend('/api/analytics/receipt-upload-save', 'POST', {
    filename: file?.name || null,
    file_size: file?.size || 0,
    mime_type: file?.type || null,
    file_base64: fileBase64,
    merchant_hint: merchant,
    amount,
    category: document.querySelector('#bill-category').value || null,
    gst_number: document.querySelector('#bill-gst-number').value || null,
    gst_rate: Number(document.querySelector('#bill-gst').value || '18'),
    amount_is_inclusive: true,
    transaction_type: document.querySelector('#bill-transaction-type').value,
    entry_action: document.querySelector('#bill-entry-action').value
  });

  document.querySelector('#bill-result').textContent = `${payload.message}. Balance: ${formatRupee(payload.balance)}`;
  await refreshDashboard();
}

async function uploadBillsFile() {
  const file = document.querySelector('#bills-file').files?.[0];
  if (!file) {
    throw new Error('Choose a bills file first');
  }

  const text = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')
    ? await file.text()
    : '';

  const payload = await apiSend('/api/analytics/bills-csv-import', 'POST', {
    filename: file.name,
    file_text: text,
    file_size: file.size,
    merchant_hint: document.querySelector('#bill-merchant').value || null,
    gst_rate: Number(document.querySelector('#bill-gst').value || '18'),
    transaction_type: document.querySelector('#bill-transaction-type').value,
    entry_action: document.querySelector('#bill-entry-action').value
  });

  document.querySelector('#bill-result').textContent = `${payload.message}. Imported: ${payload.imported_count}, Failed: ${payload.failed_count}`;
  await refreshDashboard();
}

async function simulateBillScan() {
  const payload = await apiSend('/api/analytics/bill-scan', 'POST', {
    merchant_name: document.querySelector('#bill-merchant').value || 'Unknown Merchant',
    category: document.querySelector('#bill-category').value || 'Others',
    amount: optionalNumberFromInput('#bill-amount') || 0,
    gst_rate: Number(document.querySelector('#bill-gst').value || '18'),
    gst_number: document.querySelector('#bill-gst-number').value || null,
    notes: 'Simulated from homepage scanner',
    transaction_type: document.querySelector('#bill-transaction-type').value,
    entry_action: document.querySelector('#bill-entry-action').value
  });

  document.querySelector('#bill-result').textContent = `${payload.message}. Saved ${formatRupee(payload.total_saved)} (${payload.verified_badge})`;
  await refreshDashboard();
}

async function handleReceiptUpload() {
  const fileInput = document.querySelector('[data-section="track"] #receipt-file');
  const file = fileInput?.files?.[0];
  const resultDiv = document.querySelector('#receipt-parse-result');

  if (!file) {
    if (resultDiv) resultDiv.textContent = 'Please select a receipt image/PDF first.';
    throw new Error('Choose a receipt image or PDF first');
  }

  if (resultDiv) resultDiv.textContent = 'Parsing receipt with Gemini...';
  const fileBase64 = await fileToBase64(file);

  const payload = await apiSend('/api/analytics/receipt-upload', 'POST', {
    filename: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    file_base64: fileBase64,
    merchant_hint: null
  });

  const merchantInput = document.querySelector('#receipt-merchant');
  const amountInput = document.querySelector('#receipt-amount');
  const categoryInput = document.querySelector('#receipt-category');
  const gstInput = document.querySelector('#receipt-gst');
  const form = document.querySelector('#receipt-form');

  if (merchantInput) {
    merchantInput.value = payload.merchant_name || '';
    merchantInput.dataset.parsedFileKey = payload.parsed_file_key || '';
  }
  if (amountInput) amountInput.value = Math.round(payload.estimated_amount || 0);
  if (categoryInput && payload.category) categoryInput.value = payload.category;
  if (gstInput) gstInput.value = payload.gst_number || '';
  if (form) form.style.display = '';
  if (resultDiv) resultDiv.textContent = payload.message || 'Receipt parsed successfully.';
}

async function handleReceiptSave() {
  const file = document.querySelector('[data-section="track"] #receipt-file')?.files?.[0] || null;
  const merchantInput = document.querySelector('#receipt-merchant');
  const amountInput = optionalNumberFromInput('#receipt-amount');
  const category = document.querySelector('#receipt-category')?.value || null;
  const gstNumber = document.querySelector('#receipt-gst')?.value || null;
  const parsedFileKey = merchantInput?.dataset?.parsedFileKey || null;
  const merchant = merchantInput?.value?.trim() || null;

  if (!merchant || !Number.isFinite(amountInput) || amountInput <= 0) {
    throw new Error('Fill merchant and amount before saving track entry');
  }

  const fileBase64 = file ? await fileToBase64(file) : null;
  const payload = await apiSend('/api/analytics/receipt-upload-save', 'POST', {
    filename: file?.name || null,
    file_size: file?.size || 0,
    mime_type: file?.type || null,
    file_base64: fileBase64,
    parsed_file_key: parsedFileKey,
    merchant_hint: merchant,
    amount: amountInput,
    category,
    gst_number: gstNumber,
    gst_rate: 18,
    amount_is_inclusive: true,
    transaction_type: 'cash',
    entry_action: 'track_only',
    note: 'Tracked from receipt upload'
  });

  const resultDiv = document.querySelector('#receipt-parse-result');
  if (resultDiv) resultDiv.textContent = `${payload.message} | Saved ${formatRupee(payload.total_saved)}`;
  showResult(payload.message, 'success');
  await refreshDashboard();
}

async function handleManualEntry() {
  const merchant = String(document.querySelector('#manual-merchant')?.value || '').trim();
  const amount = optionalNumberFromInput('#manual-amount');
  const category = document.querySelector('#manual-category')?.value || 'Others';
  const type = document.querySelector('#manual-type')?.value || 'cash';

  if (!merchant || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter valid manual entry details');
  }

  const payload = await apiSend('/api/analytics/receipt-upload-save', 'POST', {
    filename: `manual-${Date.now()}`,
    file_size: 0,
    merchant_hint: merchant,
    amount,
    category,
    gst_number: null,
    gst_rate: 0,
    amount_is_inclusive: true,
    transaction_type: type,
    entry_action: type === 'upi' ? 'track_and_deduct' : 'track_only',
    note: 'Manual track entry'
  });

  const manualResult = document.querySelector('#manual-result');
  if (manualResult) manualResult.textContent = `${payload.message} | ${formatRupee(payload.total_saved)}`;
  showResult('Manual entry saved', 'success');
  await refreshDashboard();
}

async function handleMarketplaceList() {
  const type = document.querySelector('#marketplace-type')?.value || 'gift-card';
  const brand = String(document.querySelector('#marketplace-brand')?.value || '').trim();
  const originalValue = optionalNumberFromInput('#marketplace-original');
  const askingPrice = optionalNumberFromInput('#marketplace-asking');
  const expiry = document.querySelector('#marketplace-expiry')?.value || '';
  const sellerNote = String(document.querySelector('#marketplace-note')?.value || '').trim();

  if (!brand || !Number.isFinite(originalValue) || originalValue <= 0 || !Number.isFinite(askingPrice) || askingPrice <= 0) {
    throw new Error('Fill brand, original value, and asking price correctly');
  }

  const payload = await apiSend('/api/marketplace/list', 'POST', {
    type,
    brand,
    originalValue,
    askingPrice,
    expiry,
    sellerNote
  });

  const messageHost = document.querySelector('#marketplace-sell-result');
  if (messageHost) {
    messageHost.textContent = `Listed ${payload.listing.brand} | Fee ${formatRupee(payload.listing.platformFee)} | Seller receives ${formatRupee(payload.listing.askingPrice - payload.listing.platformFee)}`;
  }

  document.querySelector('#marketplace-brand').value = '';
  document.querySelector('#marketplace-original').value = '';
  document.querySelector('#marketplace-asking').value = '';
  document.querySelector('#marketplace-expiry').value = '';
  document.querySelector('#marketplace-note').value = '';

  await loadMarketplaceListings();
}

async function loadMarketplaceListings() {
  const host = document.querySelector('#marketplace-listings');
  if (!host) return;

  host.innerHTML = '<p class="muted">Loading listings...</p>';
  const payload = await apiGet('/api/marketplace/listings');
  const query = String(document.querySelector('#marketplace-search')?.value || '').trim().toLowerCase();
  const listings = (payload.listings || []).filter((item) => {
    if (!query) return true;
    const haystack = `${item.brand} ${item.type} ${item.sellerNote || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!listings.length) {
    host.innerHTML = '<p class="muted">No active listings yet.</p>';
    return;
  }

  host.innerHTML = listings.map((item) => {
    const sellerGet = Number(item.askingPrice || 0) - Number(item.platformFee || 0);
    return `
      <article class="mini card marketplace-card">
        <div class="mini-header">
          <strong>${item.brand}</strong>
          <span class="pill">${item.type}</span>
        </div>
        <div class="mini-row">
          <span>Original ${formatRupee(item.originalValue)}</span>
          <strong class="price">${formatRupee(item.askingPrice)}</strong>
        </div>
        <p class="muted">Note: ${item.sellerNote || 'No note added.'}</p>
        <div class="mini-row">
          <span>Platform fee: ${formatRupee(item.platformFee)}</span>
          <span>Seller gets: ${formatRupee(sellerGet)}</span>
        </div>
      </article>
    `;
  }).join('');
}

async function downloadReport() {
  const lines = (state.detailedReport?.days || []).slice(0, 10).flatMap((day) => {
    const dateLine = `\n${day.date} | Total ${day.total} | UPI ${day.upi_total} | Cash ${day.cash_total}`;
    const entryLines = (day.entries || []).slice(0, 8).map((entry) => `- ${entry.time} | ${entry.name} | ${entry.category} | ${entry.payment_mode.toUpperCase()} | ${entry.need_or_want} | ${entry.amount}`);
    return [dateLine, ...entryLines];
  }).join('\n');

  const payload = await apiSend('/api/report-download', 'POST', {
    title: 'FinSight weekly report',
    summary: `${state.weeklyReport?.summary || 'Weekly report summary.'}\n\nNext month forecast: ${formatRupee(state.weeklyReport?.next_month_prediction || 0)}\nSuggested budget: ${formatRupee(state.weeklyReport?.suggested_budget || 0)}\n${lines}`
  });

  const blob = new Blob([
    `${payload.data.title}\n\nGenerated at: ${new Date(payload.data.generatedAt).toLocaleString('en-IN')}\n\n${payload.data.summary}`
  ], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = payload.data.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  window.location.href = '/api/analytics/transactions-csv';
}

function showResult(message, tone = 'warning') {
  const host = document.querySelector('#bill-result');
  const toneClass = tone === 'critical' ? 'critical-banner' : tone === 'success' ? 'success-banner' : 'warning-banner';
  host.innerHTML = `<span class="${toneClass}">${message}</span>`;
}

document.addEventListener('click', async (event) => {
  const navButton = event.target.closest('[data-view]');
  if (navButton) {
    setActiveView(navButton.dataset.view);
    if (navButton.dataset.view === 'marketplace') {
      setTimeout(() => loadMarketplaceListings(), 50);
    }
    return;
  }
  try {
    if (event.target.closest('#refresh-dashboard')) {
      await refreshDashboard();
      return;
    }

    if (event.target.closest('#update-budget')) {
      await updateBudget();
      showResult('Budget updated successfully', 'success');
      return;
    }

    if (event.target.closest('#parse-receipt')) {
      await parseReceipt();
      return;
    }

    if (event.target.closest('#upload-receipt')) {
      await uploadReceiptAndSave();
      return;
    }

    if (event.target.closest('#receipt-upload-btn')) {
      await handleReceiptUpload();
      return;
    }

    if (event.target.closest('#receipt-save-btn')) {
      await handleReceiptSave();
      return;
    }

    if (event.target.closest('#manual-save-btn')) {
      await handleManualEntry();
      return;
    }

    if (event.target.closest('#marketplace-list-btn')) {
      await handleMarketplaceList();
      return;
    }

    if (event.target.closest('#marketplace-refresh-btn')) {
      await loadMarketplaceListings();
      return;
    }

    if (event.target.closest('#marketplace-search')) {
      await loadMarketplaceListings();
      return;
    }

    if (event.target.closest('#upload-bills')) {
      await uploadBillsFile();
      return;
    }

    if (event.target.closest('#simulate-bill-scan')) {
      await simulateBillScan();
      return;
    }

    if (event.target.closest('#download-report')) {
      await downloadReport();
      return;
    }

    if (event.target.closest('#download-csv')) {
      downloadCsv();
      return;
    }

    if (event.target.closest('.poll-chip')) {
      const button = event.target.closest('.poll-chip');
      document.querySelectorAll('.poll-chip').forEach((chip) => chip.classList.remove('active'));
      button.classList.add('active');
      return;
    }
  } catch (error) {
    showResult(error.message, 'critical');
  }
});

try {
  await refreshDashboard();
} catch (error) {
  showResult(`Dashboard load failed: ${error.message}`, 'critical');
}

setActiveView(state.view);
