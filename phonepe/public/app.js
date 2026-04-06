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

function setStatus(message, tone = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

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

function render() {
  if (!state) {
    appEl.innerHTML = '<div class="loading card">Loading local PhonePe data...</div>';
    return;
  }

  appEl.innerHTML = layoutMarkup();
}

async function refreshData(message = 'Synced with local SQLite .db') {
  if (isLoading) {
    return;
  }

  isLoading = true;
  setStatus('Refreshing local database...', 'info');

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

async function handleTopUp(form) {
  const amount = form.amount.value;
  const nextState = await api.addMoney(amount);
  state = nextState;
  render();
  setStatus(`Wallet topped up by ₹${Number(amount).toLocaleString('en-IN')}`, 'success');
}

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
  setStatus(`Payment saved for ${payload.name}`, 'success');
}

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

await refreshData('Local PhonePe ready');
