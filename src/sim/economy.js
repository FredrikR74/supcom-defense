/**
 * Flödesbaserad ekonomi som i SupCom: producenter ger en jämn inkomst per sekund
 * och förbrukare drar löpande. Räcker det inte sjunker effektiviteten, och
 * alla förbrukare saktar ner lika mycket.
 */

export const RESOURCES = ['mass', 'energy'];

export function createEconomy({ stored, max }) {
  const economy = { efficiency: 1 };
  for (const r of RESOURCES) {
    economy[r] = {
      stored: Math.min(stored[r], max[r]),
      max: max[r],
      income: 0, // per sekund, senaste tick
      requested: 0, // per sekund, senaste tick
      spent: 0, // per sekund, senaste tick
    };
  }
  return economy;
}

/**
 * Stegar ekonomin ett tick.
 * `producers`: [{mass, energy}] per sekund.
 * `consumers`: objekt med `demand: {mass, energy}` per sekund. Varje förbrukare
 * får `efficiency` satt till hur stor del av efterfrågan den fick (0..1).
 */
export function stepEconomy(economy, producers, consumers, dt) {
  const income = {};
  const requested = {};
  const resourceEfficiency = {};

  for (const r of RESOURCES) {
    income[r] = 0;
    for (const p of producers) income[r] += p[r] ?? 0;
    requested[r] = 0;
    for (const c of consumers) requested[r] += c.demand[r] ?? 0;

    const available = economy[r].stored + income[r] * dt;
    const wanted = requested[r] * dt;
    resourceEfficiency[r] = wanted > 0 ? Math.min(1, available / wanted) : 1;
  }

  // Varje förbrukare styrs av den bristfälligaste av de resurser den behöver:
  // en byggare som drar både mass och energi saktar ner vid brist på någon av dem,
  // medan en Mass Extractor (drar bara energi) bara påverkas av energibrist.
  economy.efficiency = Math.min(...RESOURCES.map((r) => resourceEfficiency[r]));
  const spent = { mass: 0, energy: 0 };
  for (const c of consumers) {
    let eff = 1;
    for (const r of RESOURCES) if ((c.demand[r] ?? 0) > 0) eff = Math.min(eff, resourceEfficiency[r]);
    c.efficiency = eff;
    for (const r of RESOURCES) spent[r] += (c.demand[r] ?? 0) * eff;
  }

  for (const r of RESOURCES) {
    const res = economy[r];
    res.stored = Math.min(res.max, Math.max(0, res.stored + (income[r] - spent[r]) * dt));
    res.income = income[r];
    res.requested = requested[r];
    res.spent = spent[r];
  }
}
