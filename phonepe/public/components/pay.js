import { CATEGORIES, formatRupee } from '../config.js';

export function renderPay(selectedCategory = CATEGORIES[0].name) {
  return `
    <section class="screen active-screen">
      <div class="section-head">
        <div>
          <p class="section-label">Pay screen</p>
          <h3>Pay to ${selectedCategory}</h3>
        </div>
        <span class="pill danger">UPI deducts wallet</span>
      </div>

      <form id="pay-form" class="card form-card">
        <label>
          <span>Recipient name</span>
          <input name="name" type="text" placeholder="Swiggy, Ola, Friend" required />
        </label>
        <label>
          <span>Amount</span>
          <input name="amount" type="number" min="1" step="1" placeholder="800" required />
        </label>
        <label>
          <span>Category</span>
          <select name="category" required>
            ${CATEGORIES.map((category) => `<option value="${category.name}" ${category.name === selectedCategory ? 'selected' : ''}>${category.name}</option>`).join('')}
          </select>
        </label>
        <button class="primary-btn full-width" type="submit">Pay Now</button>
        <p class="muted">Preview amount: <strong>${formatRupee(0)}</strong></p>
      </form>
    </section>
  `;
}
