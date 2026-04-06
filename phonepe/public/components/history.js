import { escapeHtml, formatRupee, formatTimeStamp, transactionIcon } from '../config.js';

function matchesSearch(transaction, search) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [transaction.name, transaction.type, transaction.needOrWant, transaction.gst]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function renderHistory(state, ui) {
  const transactions = state?.transactions || [];
  const search = ui.search || '';

  const filteredTransactions = transactions.filter((transaction) => matchesSearch(transaction, search));
  const transactionMarkup = filteredTransactions.length ? filteredTransactions.map((transaction) => `
          <article class="transaction-row card">
            <div class="transaction-icon">${transactionIcon(transaction.category)}</div>
            <div class="transaction-body">
              <div class="transaction-topline">
                <strong>${escapeHtml(transaction.name)}</strong>
                <span class="transaction-amount">-${formatRupee(transaction.amount)}</span>
              </div>
              <div class="transaction-meta">
                <span>${escapeHtml(transaction.type.toUpperCase())}</span>
                <span>${escapeHtml(transaction.needOrWant.toUpperCase())}</span>
                <span>${formatTimeStamp(transaction.timestamp)}</span>
              </div>
              ${transaction.gst ? `<div class="gst-tag">GST ${escapeHtml(transaction.gst)}</div>` : ''}
            </div>
          </article>
        `).join('') : '<div class="empty-state card">No matching transactions found.</div>';

  return `
    <section class="screen active-screen">
      <div class="section-head">
        <div>
          <p class="section-label">History screen</p>
          <h3>All transactions</h3>
        </div>
        <span class="pill" data-history-count>${filteredTransactions.length} items</span>
      </div>

      <label class="search-box card">
        <span>Search</span>
        <input id="history-search" type="search" placeholder="Search name, type, or GST" value="${escapeHtml(search)}" />
      </label>

      <div class="transaction-list history-list" data-history-list>
        ${transactionMarkup}
      </div>
    </section>
  `;
}

export function renderHistoryTransactions(state, search) {
  const transactions = state?.transactions || [];
  const filteredTransactions = transactions.filter((transaction) => matchesSearch(transaction, search || ''));

  return {
    countText: `${filteredTransactions.length} items`,
    markup: filteredTransactions.length ? filteredTransactions.map((transaction) => `
      <article class="transaction-row card">
        <div class="transaction-icon">${transactionIcon(transaction.category)}</div>
        <div class="transaction-body">
          <div class="transaction-topline">
            <strong>${escapeHtml(transaction.name)}</strong>
            <span class="transaction-amount">-${formatRupee(transaction.amount)}</span>
          </div>
          <div class="transaction-meta">
            <span>${escapeHtml(transaction.type.toUpperCase())}</span>
            <span>${escapeHtml(transaction.needOrWant.toUpperCase())}</span>
            <span>${formatTimeStamp(transaction.timestamp)}</span>
          </div>
          ${transaction.gst ? `<div class="gst-tag">GST ${escapeHtml(transaction.gst)}</div>` : ''}
        </div>
      </article>
    `).join('') : '<div class="empty-state card">No matching transactions found.</div>'
  };
}
