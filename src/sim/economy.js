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

  // En förbrukare behöver båda resurserna, så den bristfälligaste styr.
  const efficiency = Math.min(...RESOURCES.map((r) => resourceEfficiency[r]));
  economy.efficiency = efficiency;
  for (const c of consumers) c.efficiency = efficiency;

  for (const r of RESOURCES) {
    const res = economy[r];
    const spent = requested[r] * efficiency;
    res.stored = Math.min(res.max, Math.max(0, res.stored + (income[r] - spent) * dt));
    res.income = income[r];
    res.requested = requested[r];
    res.spent = spent;
  }
}
