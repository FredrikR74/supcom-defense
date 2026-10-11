const LABELS = { mass: 'Mass', energy: 'Energy' };

const fmt = (v) => Math.floor(v).toLocaleString('en-US');
const rate = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

/**
 * Resurspanel högst upp: lager, maxkapacitet, inkomst och efterfrågan per sekund.
 * Efterfrågan (inte det som faktiskt dras) visas, så att man ser hur mycket som
 * fattas vid brist. En resurs som tagit slut blir röd och visar underskottet.
 * Alla fält har fasta mått, så panelen byter aldrig bredd när texterna ändras.
 */
export function createResourcePanel(el) {
  const rows = {};
  for (const r of ['mass', 'energy']) {
    const row = document.createElement('div');
    row.className = `resource resource-${r}`;
    row.innerHTML = `
      <span class="resource-head">
        <span class="resource-icon"></span>
        <span class="resource-label">${LABELS[r]}</span>
        <span class="resource-deficit"></span>
      </span>
      <span class="resource-stored"><span class="resource-now"></span><span class="resource-max"></span></span>
      <span class="resource-bar"><span class="resource-fill"></span></span>
      <span class="resource-rates"><span class="resource-income"></span><span class="resource-spent"></span></span>`;
    el.appendChild(row);
    rows[r] = {
      row,
      now: row.querySelector('.resource-now'),
      max: row.querySelector('.resource-max'),
      fill: row.querySelector('.resource-fill'),
      income: row.querySelector('.resource-income'),
      spent: row.querySelector('.resource-spent'),
      deficit: row.querySelector('.resource-deficit'),
    };
  }
  const efficiency = document.createElement('div');
  efficiency.className = 'resource-efficiency';
  efficiency.hidden = true;
  el.appendChild(efficiency);

  return {
    update(economy) {
      for (const [r, ui] of Object.entries(rows)) {
        const res = economy[r];
        ui.now.textContent = fmt(res.stored);
        ui.max.textContent = ` / ${fmt(res.max)}`;
        ui.fill.style.width = `${(res.stored / res.max) * 100}%`;
        ui.income.textContent = rate(res.income);
        ui.spent.textContent = rate(-res.requested);
        // Brist: lagret är tomt och efterfrågan är större än inkomsten.
        const missing = res.requested - res.income;
        const stalled = res.stored < 1 && missing > 0.05;
        ui.row.classList.toggle('resource-stalled', stalled);
        ui.deficit.textContent = stalled ? `${rate(-missing)} short` : '';
      }
      const stalled = economy.efficiency < 1;
      efficiency.textContent = stalled ? `Build efficiency ${Math.round(economy.efficiency * 100)}%` : '';
      efficiency.hidden = !stalled;
    },
  };
}
