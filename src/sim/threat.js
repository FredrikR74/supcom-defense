import gameConfig from '../data/gameConfig.js';
import { weaponOf } from './entities.js';
import { PLAYER_ID } from './constants.js';

/** Skada per sekund för ett vapen (alla projektiler i salvan). */
export const weaponDps = (w) => w.damage * (w.projectiles ?? 1) * w.rateOfFire;

/** Inställningarna för fiendens AI (data/gameConfig.js). */
export const enemyAiConfig = (world) => world.config?.enemyAi ?? gameConfig.enemyAi;

/**
 * Spelarens färdiga byggnader med vapen som kan skjuta på markenheter och som
 * fienden känner till (har sett, se intel.js).
 */
export function knownDefenses(world) {
  return world.entities.filter((e) => {
    if (e.kind !== 'structure' || e.owner !== PLAYER_ID || !e.built || e.hp <= 0 || !e.enemySeen) return false;
    const w = weaponOf(e);
    return Boolean(w) && !w.antiAir;
  });
}

/**
 * Hotkostnad per ruta för fiendens flödesfält: varje känd försvarsbyggnad
 * lägger till (dps × threatCostPerDps) i rutorna den når (mellan minsta och
 * största räckvidd). null om fienden inte känner till något försvar.
 */
export function threatCosts(world) {
  const perDps = enemyAiConfig(world).threatCostPerDps;
  const defenses = perDps ? knownDefenses(world) : [];
  if (defenses.length === 0) return null;
  const n = world.terrain.size;
  const threat = new Float32Array(n * n);
  for (const s of defenses) {
    const w = weaponOf(s);
    const extra = weaponDps(w) * perDps;
    // En enhet räknas som inom räckvidd när dess kant är det (ungefär en halv ruta).
    const r = w.range + 0.5;
    const rMin = w.minRange ?? 0;
    const z0 = Math.max(0, Math.floor(s.z - r));
    const z1 = Math.min(n - 1, Math.floor(s.z + r));
    const x0 = Math.max(0, Math.floor(s.x - r));
    const x1 = Math.min(n - 1, Math.floor(s.x + r));
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const d = Math.hypot(cx + 0.5 - s.x, cz + 0.5 - s.z);
        if (d <= r && d >= rMin) threat[cz * n + cx] += extra;
      }
    }
  }
  return threat;
}
