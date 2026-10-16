import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addUnit, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { applyEnhancement } from '../src/sim/enhancements.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (world, n, each) => {
  for (let i = 0; i < n; i++) {
    tickWorld(world);
    each?.();
  }
};
const cmd = (world, c) => queueCommand(world, { owner: PLAYER_ID, ...c });
const oc = units.acu.overcharge;

/** ACU:n utan egen produktion och med `energy` i lagret. */
function setup(energy = 100000) {
  const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
  const economy = world.players[PLAYER_ID].economy;
  economy.energy.max = 1e7;
  economy.energy.stored = energy;
  const acu = getEntity(world, world.acuId);
  acu.production = { mass: 0, energy: 0 };
  return { world, economy, acu };
}
const enemy = (world, type, x, z) => addUnit(world, type, { x, z, owner: ENEMY_ID });
/** Overcharge-skott i luften. */
const ocShots = (world) => world.projectiles.filter((p) => p.overcharge);

describe('Overcharge', () => {
  it('FAF:s värden', () => {
    expect(oc).toMatchObject({ energyRequired: 7500, energyMult: 0.9, energyRatio: 6, minDamage: 1250, maxDamage: 15000, structureDamage: 800 });
  });

  it('dödar en Rhino med precis så mycket som behövs och drar skadan × 6 i energi', () => {
    const { world, economy, acu } = setup();
    const rhino = enemy(world, 'rhino', acu.x, acu.z + 8);
    rhino.hp = 1900;
    cmd(world, { type: 'overcharge', ids: [acu.id], targetId: rhino.id });
    let drained = 0;
    let before = economy.energy.stored;
    ticks(world, 20, () => {
      if (economy.energy.stored < before) drained += before - economy.energy.stored;
      before = economy.energy.stored;
    });
    expect(getEntity(world, rhino.id)).toBe(null);
    // Rhinon kan ha tagit en kanonträff (100) innan Overcharge slog ner.
    expect(drained).toBeGreaterThanOrEqual((1900 - 100) * 6 - 1);
    expect(drained).toBeLessThanOrEqual(1900 * 6 + 1);
    expect(acu.orders.length).toBe(0); // ordern är klar
  });

  it('gör minst 1250 skada (7500 energi) även mot en svag enhet', () => {
    const { world, economy, acu } = setup();
    const mantis = enemy(world, 'mantis', acu.x, acu.z + 8);
    cmd(world, { type: 'overcharge', ids: [acu.id], targetId: mantis.id });
    ticks(world, 20);
    expect(getEntity(world, mantis.id)).toBe(null);
    expect(economy.energy.stored).toBeCloseTo(100000 - oc.minDamage * oc.energyRatio, 0);
  });

  it('skjuter inte utan 7500 energi i lagret, men väl när det finns', () => {
    const { world, economy, acu } = setup(7000);
    const rhino = enemy(world, 'rhino', acu.x, acu.z + 8);
    cmd(world, { type: 'overcharge', ids: [acu.id], targetId: rhino.id });
    ticks(world, 10);
    expect(ocShots(world)).toHaveLength(0);
    expect(acu.orders[0]?.type).toBe('overcharge');
    economy.energy.stored = 8000;
    ticks(world, 1);
    expect(ocShots(world)).toHaveLength(1);
  });

  it('går inom räckhåll först, och räckvidden följer Zephyr Amplifier', () => {
    const { world, acu } = setup();
    const far = enemy(world, 'rhino', acu.x, acu.z + 14);
    cmd(world, { type: 'overcharge', ids: [acu.id], targetId: far.id });
    ticks(world, 1);
    expect(ocShots(world)).toHaveLength(0);
    ticks(world, 30);
    expect(ocShots(world).length + (far.hp < far.maxHp ? 1 : 0)).toBeGreaterThan(0);

    const { world: w2, acu: acu2 } = setup();
    applyEnhancement(acu2, 'zephyrAmplifier');
    const t = enemy(w2, 'rhino', acu2.x, acu2.z + 14);
    cmd(w2, { type: 'overcharge', ids: [acu2.id], targetId: t.id });
    ticks(w2, 1);
    expect(ocShots(w2)).toHaveLength(1); // 14 < 15: inom räckhåll direkt
  });

  it('automatiskt Overcharge skjuter på kanonens mål, en gång per 3,3 s', () => {
    const { world, acu } = setup(1e6);
    const rhinos = [0, 1, 2].map((k) => enemy(world, 'rhino', acu.x - 2 + k * 2, acu.z + 8));
    for (const r of rhinos) r.hp = r.maxHp = 1e5; // överlever flera skott
    ticks(world, 20);
    expect(ocShots(world)).toHaveLength(0); // av som standard
    cmd(world, { type: 'setAutoOvercharge', ids: [acu.id], value: true });
    let fired = 0;
    ticks(world, 70, () => { fired += world.events.filter((e) => e.type === 'fire' && e.overcharge).length; world.events.length = 0; });
    expect(fired).toBe(3); // tick 0, 3,3 s och 6,6 s
  });

  it('skjuter inte medan ACU:n bygger', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'setAutoOvercharge', ids: [acu.id], value: true });
    cmd(world, { type: 'build', ids: [acu.id], structure: 'powerGenerator', x: acu.x + 3, z: acu.z });
    ticks(world, 5);
    expect(acu.buildJob).toBeTruthy();
    enemy(world, 'rhino', acu.x, acu.z + 8);
    ticks(world, 10);
    expect(ocShots(world)).toHaveLength(0);
  });

  it('Stop släpper alla order', () => {
    const { world, acu } = setup();
    const rhino = enemy(world, 'rhino', acu.x, acu.z + 30);
    cmd(world, { type: 'overcharge', ids: [acu.id], targetId: rhino.id });
    ticks(world, 1);
    cmd(world, { type: 'stop', ids: [acu.id] });
    ticks(world, 1);
    expect(acu.orders).toHaveLength(0);
  });
});
