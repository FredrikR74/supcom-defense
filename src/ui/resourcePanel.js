const LABELS = { mass: 'Mass', energy: 'Energi' };

const fmt = (v) => Math.floor(v).toLocaleString('sv-SE');
const rate = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

/** Resurspanel högst upp: lager, maxkapacitet, inkomst och utgift per sekund. */
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
      <span class="resource-spent"></span>`;
    el.appendChild(row);
    rows[r] = {
      stored: row.querySelector('.resource-stored'),
      fill: row.querySelector('.resource-fill'),
      income: row.querySelector('.resource-income'),
      spent: row.querySelector('.resource-spent'),
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
        ui.spent.textContent = rate(-res.spent);
      }
      const stalled = economy.efficiency < 1;
      efficiency.textContent = stalled ? `Effektivitet ${Math.round(economy.efficiency * 100)} %` : '';
      efficiency.hidden = !stalled;
    },
  };
}
