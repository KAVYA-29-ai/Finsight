import { formatRupee } from '../config.js';

export function renderPaymentDone(result) {
  const name = result?.name || 'Recipient';
  const amount = result?.amount || 0;

  return `
    <section class="screen active-screen payment-done-screen">
      <div class="payment-done-card card">
        <div class="done-badge">✓</div>
        <p class="section-label">Payment done</p>
        <h2>${formatRupee(amount)}</h2>
        <p class="done-name">Paid to ${name}</p>
        <p class="muted">Success</p>

        <button type="button" class="primary-btn full-width" data-action="back-home">Back to Home</button>
      </div>
    </section>
  `;
}
