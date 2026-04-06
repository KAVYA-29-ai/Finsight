import { api } from './api.js';
import { renderHome } from './components/home.js';
import { renderPay } from './components/pay.js';
import { renderPaymentDone } from './components/paymentDone.js';
import { renderEmi } from './components/emi.js';
import { renderHistory, renderHistoryTransactions } from './components/history.js';

const appEl = document.querySelector('#app');
const statusEl = document.querySelector('#status');

const ui = {
  view: 'home',
  search: '',
  selectedCategory: 'Food',
  paymentResult: null
};

let state = null;
let isLoading = false;

/**
 * Updates the top status banner with the latest app message.
 * @param {string} message - Text to show in the banner.
 * @param {'info'|'success'|'error'} tone - Visual tone for the message.
 */
function setStatus(message, tone = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

/**
 * Returns the active screen markup based on the current UI state.
 * @returns {string} Rendered HTML for the visible PhonePe screen.
 */
function screenMarkup() {
  switch (ui.view) {
    case 'pay':
      return renderPay(ui.selectedCategory);
    case 'paymentDone':
      return renderPaymentDone(ui.paymentResult);
    case 'emi':
      return renderEmi(state);
    case 'history':
      return renderHistory(state, ui);
    case 'home':
    default:
      return renderHome(state);
  }
}

/**
 * Builds the bottom navigation bar for the PhonePe shell.
 * @returns {string} HTML string for the bottom nav.
 */
function navMarkup() {
  const tabs = [
    ['home', 'Home'],
    ['history', 'History'],
    ['emi', 'Current EMI'],
    ['pay', 'Pay']
  ];

  return `
    <nav class="bottom-nav card">
      ${tabs.map(([key, label]) => `
        <button type="button" class="nav-tab ${ui.view === key ? 'active' : ''}" data-view="${key}">${label}</button>
      `).join('')}
    </nav>
  `;
}

/**
 * Wraps the active screen and navigation into the main app layout.
 * @returns {string} Full rendered layout HTML.
 */
function layoutMarkup() {
  return `
    <div class="app-shell">
      <div class="main-panel">
        ${screenMarkup()}
      </div>
      ${ui.view === 'paymentDone' ? '' : navMarkup()}
    </div>
  `;
}

/**
 * Renders the full app into the root container.
 */
function render() {
  if (!state) {
    appEl.innerHTML = '<div class="loading card">Loading PhonePe data...</div>';
    return;
  }

  if (state.source && state.source.connected === false) {
    appEl.innerHTML = `
      <div class="app-shell">
        <div class="main-panel">
          <div class="card loading">
            <strong>Supabase not configured</strong>
            <p class="muted">The app is running in read-only empty mode. Set Supabase env values to enable live data.</p>
          </div>
        </div>
      </div>
    `;
    statusEl.style.display = '';
    setStatus('Supabase required for live data', 'error');
    return;
  }

  if (ui.view === 'paymentDone') {
    statusEl.style.display = 'none';
  } else {
    statusEl.style.display = '';
  }

  appEl.innerHTML = layoutMarkup();
}

/**
 * Loads fresh data from the API and updates the visible UI.
 * @param {string} [message='Synced with app state'] - Sync message for the status banner.
 * @returns {Promise<void>}
 */
async function refreshData(message = 'Synced with app state') {
  if (isLoading) {
    return;
  }

  isLoading = true;
  setStatus('Refreshing app state...', 'info');

  try {
    state = await api.getState();
    render();
    setStatus(`${message} • ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    isLoading = false;
  }
}

/**
 * Adds money to the wallet and refreshes the screen.
 * @param {HTMLFormElement} form - Top-up form element.
 * @returns {Promise<void>}
 */
async function handleTopUp(form) {
  const amount = form.amount.value;
  const nextState = await api.addMoney(amount);
  state = nextState;
  render();
  setStatus(`Wallet topped up by ₹${Number(amount).toLocaleString('en-IN')}`, 'success');
}

/**
 * Saves a payment transaction and shows the payment-done screen.
 * @param {HTMLFormElement} form - Payment form element.
 * @returns {Promise<void>}
 */
async function handlePayment(form) {
  const payload = {
    name: form.name.value,
    amount: form.amount.value,
    category: form.category.value
  };
  const nextState = await api.createTransaction(payload);
  state = nextState;
  ui.paymentResult = {
    name: payload.name,
    amount: Number(payload.amount),
    category: payload.category
  };
  ui.view = 'paymentDone';
  render();
}

/**
 * Creates a new EMI entry.
 * @param {HTMLFormElement} form - EMI form element.
 * @returns {Promise<void>}
 */
async function handleEmi(form) {
  const payload = {
    name: form.name.value,
    amount: form.amount.value,
    dueDate: form.dueDate.value
  };
  const nextState = await api.createEmi(payload);
  state = nextState;
  render();
  setStatus(`EMI added for ${payload.name}`, 'success');
}

document.addEventListener('click', async (event) => {
  const navButton = event.target.closest('[data-view]');
  if (navButton) {
    ui.view = navButton.dataset.view;
    ui.search = '';
    render();
    return;
  }

  const categoryButton = event.target.closest('[data-category]');
  if (categoryButton) {
    ui.selectedCategory = categoryButton.dataset.category;
    ui.view = 'pay';
    render();
    return;
  }

  const backHomeButton = event.target.closest('[data-action="back-home"]');
  if (backHomeButton) {
    ui.view = 'home';
    ui.paymentResult = null;
    render();
    return;
  }

  const clearSearchButton = event.target.closest('[data-clear-search]');
  if (clearSearchButton) {
    ui.search = '';
    const historyInput = document.querySelector('#history-search');
    if (historyInput instanceof HTMLInputElement) {
      historyInput.value = '';
      historyInput.focus();
    }

    const historyList = document.querySelector('[data-history-list]');
    const historyCount = document.querySelector('[data-history-count]');
    if (historyList && historyCount) {
      const nextHistory = renderHistoryTransactions(state, ui.search);
      historyList.innerHTML = nextHistory.markup;
      historyCount.textContent = nextHistory.countText;
    }
    return;
  }

  if (event.target.closest('#refresh-btn')) {
    await refreshData();
  }
});

document.addEventListener('submit', async (event) => {
  if (!(event.target instanceof HTMLFormElement)) {
    return;
  }

  event.preventDefault();

  try {
    if (event.target.id === 'topup-form') {
      await handleTopUp(event.target);
      return;
    }

    if (event.target.id === 'pay-form') {
      await handlePayment(event.target);
      return;
    }

    if (event.target.id === 'emi-form') {
      await handleEmi(event.target);
    }
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.id === 'history-search') {
    ui.search = event.target.value;
    const historyList = document.querySelector('[data-history-list]');
    const historyCount = document.querySelector('[data-history-count]');

    if (historyList && historyCount) {
      const nextHistory = renderHistoryTransactions(state, ui.search);
      historyList.innerHTML = nextHistory.markup;
      historyCount.textContent = nextHistory.countText;
      return;
    }

    render();
  }
});

await refreshData('PhonePe ready');
