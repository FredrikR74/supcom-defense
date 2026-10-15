import structures from '../data/structures.js';

/**
 * Uppgradering av byggnader som i FA (UpgradesTo): en färdig Land Factory blir
 * en Land Factory HQ, en Mass Extractor blir T2 och sedan T3. Byggnaden bygger
 * uppgraderingen själv med sin byggkraft (FA:s BuildRate) och kostnaden dras
 * löpande; ingenjörer kan assistera (se guard.js). Medan den uppgraderas
 * fortsätter en utvinnare att producera, men en fabrik bygger inga enheter
 * (kön ligger kvar). När den är klar byter byggnaden typ på samma plats.
 *
 * `e.upgrade`: { to, progress } medan uppgraderingen pågår.
 */

/** Typen som byggnaden kan uppgraderas till just nu, eller null. */
export function upgradeTarget(e) {
  if (e.kind !== 'structure' || !e.built || e.upgrade) return null;
  return structures[e.type]?.upgradesTo ?? null;
}

/** Startar uppgraderingen; returnerar false om byggnaden inte kan uppgraderas. */
export function startUpgrade(e) {
  const to = upgradeTarget(e);
  if (!to) return false;
  e.upgrade = { to, progress: 0 };
  return true;
}

/** Avbryter uppgraderingen och ger tillbaka det den kostat hittills. */
export function cancelUpgrade(world, e) {
  if (!e.upgrade) return;
  const economy = world.players[e.owner]?.economy;
  const { cost } = structures[e.upgrade.to];
  if (economy) {
    for (const r of ['mass', 'energy']) {
      economy[r].stored = Math.min(economy[r].max, economy[r].stored + cost[r] * e.upgrade.progress);
    }
  }
  e.upgrade = null;
}

/**
 * Byter byggnaden till den uppgraderade typen. Som FA:s MaxHealth-buff: max-HP
 * höjs och HP lika mycket, så en skadad byggnad förblir lika skadad.
 */
export function completeUpgrade(world, e) {
  const from = e.type;
  const def = structures[e.upgrade.to];
  e.type = e.upgrade.to;
  e.upgrade = null;
  const oldMax = e.maxHp;
  e.maxHp = def.maxHp * (1 + 0.1 * (e.vetLevel ?? 0));
  e.hp = Math.min(e.maxHp, e.hp + Math.max(0, e.maxHp - oldMax));
  e.production = def.production ? { ...def.production } : null;
  e.radius = def.size / 2;
  world.events.push({ type: 'upgraded', owner: e.owner, from, structure: e.type, x: e.x, z: e.z });
}
