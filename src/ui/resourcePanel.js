const LABELS = { mass: 'Mass', energy: 'Energy' };

const fmt = (v) => Math.floor(v).toLocaleString('en-US');
const rate = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

/**
 * Resurspanel högst upp: lager, maxkapacitet, inkomst och efterfrågan per sekund.
 * Efterfrågan (inte det som faktiskt dras) visas, så att man ser hur mycket som
 * fattas vid brist. Raden för en resurs som tagit slut blir röd och visar underskottet.
 */
export function createResourcePanel(el) {
  const rows = {};
  for (const r of ['mass', 'energy']) {
    const row = document.createElement('div');
    row.className = `resource resource-${r}`;
    row.innerHTML = `
      <span class="resource-label">${LABELS[r]}</span>
      <span class="resource-stored"></span>
      <span class="resource-bar"><span class="resource-fill"></span></span>
      <span class="resource-income"></span>
      <span class="resource-spent"></span>
      <span class="resource-deficit"></span>`;
    el.appendChild(row);
    rows[r] = {
      row,
      stored: row.querySelector('.resource-stored'),
      fill: row.querySelector('.resource-fill'),
      income: row.querySelector('.resource-income'),
      spent: row.querySelector('.resource-spent'),
      deficit: row.querySelector('.resource-deficit'),
    };
  }
  const efficiency = document.createElement('div');
  efficiency.className = 'resource-efficiency';
  el.appendChild(efficiency);

  return {
    update(economy) {
      for (const [r, ui] of Object.entries(rows)) {
        const res = economy[r];
        ui.stored.textContent = `${fmt(res.stored)} / ${fmt(res.max)}`;
        ui.fill.style.width = `${(res.stored / res.max) * 100}%`;
        ui.income.textContent = rate(res.income);
        ui.spent.textContent = rate(-res.requested);
        // Brist: lagret är tomt och efterfrågan är större än inkomsten.
        const missing = res.requested - res.income;
        const stalled = res.stored < 1 && missing > 0.05;
        ui.row.classList.toggle('resource-stalled', stalled);
        ui.deficit.textContent = stalled ? `(${rate(-missing)} short)` : '';
      }
      const stalled = economy.efficiency < 1;
      efficiency.textContent = stalled ? `Efficiency ${Math.round(economy.efficiency * 100)}%` : '';
      efficiency.hidden = !stalled;
    },
  };
}
