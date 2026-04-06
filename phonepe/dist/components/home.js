import { CATEGORIES, formatRupee } from '../config.js';

export function renderHome(state) {
  const balance = state?.wallet?.balance ?? 0;

  return `
    <section class="screen active-screen">
      <div class="hero-card card">
        <div>
          <p class="section-label">Current money</p>
          <h2 class="balance-value">${formatRupee(balance)}</h2>
        </div>
        <form id="topup-form" class="inline-form">
          <input id="topup-amount" name="amount" type="number" min="1" step="1" placeholder="Add money" required />
          <button class="primary-btn" type="submit">Add Money</button>
        </form>
      </div>

      <div class="section-head">
        <div>
          <p class="section-label">Pay & recharge</p>
        </div>
      </div>

      <div class="category-grid">
        ${CATEGORIES.map((category) => `
          <button type="button" class="category-card card category-button" data-category="${category.name}" style="--tile-accent:${category.accent};">
            <div class="category-icon" style="background:${category.accent}22;color:${category.accent};">${category.icon}</div>
            <p>${category.name}</p>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}
