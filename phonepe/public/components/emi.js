import { escapeHtml, formatRupee } from '../config.js';

function progressForDueDate(dueDate) {
  const today = new Date().getDate();
  return Math.max(8, Math.min(100, Math.round((today / Number(dueDate)) * 100)));
}

export function renderEmi(state) {
  const emis = state?.emis || [];

  return `
    <section class="screen active-screen">
      <div class="section-head">
        <div>
          <p class="section-label">EMI screen</p>
          <h3>Active EMIs</h3>
        </div>
        <span class="pill">${emis.length} active</span>
      </div>

      <div class="stack-list">
        ${emis.length ? emis.map((emi) => {
          const progress = progressForDueDate(emi.dueDate);
          return `
            <article class="card emi-card">
              <div class="transaction-topline">
                <strong>${escapeHtml(emi.name)}</strong>
                <span>${formatRupee(emi.amount)}</span>
              </div>
              <div class="transaction-meta">
                <span>Due on ${emi.dueDate}th</span>
                <span>${progress}% progress</span>
              </div>
              <div class="progress-shell"><div class="progress-fill" style="width:${progress}%"></div></div>
            </article>
          `;
        }).join('') : '<div class="empty-state card">No EMIs saved yet.</div>'}
      </div>

      <form id="emi-form" class="card form-card compact-form">
        <label>
          <span>EMI name</span>
          <input name="name" type="text" placeholder="Phone EMI" required />
        </label>
        <label>
          <span>Monthly amount</span>
          <input name="amount" type="number" min="1" step="1" placeholder="2500" required />
        </label>
        <label>
          <span>Due date</span>
          <input name="dueDate" type="number" min="1" max="31" step="1" placeholder="5" required />
        </label>
        <button class="primary-btn full-width" type="submit">Add EMI</button>
      </form>
    </section>
  `;
}
