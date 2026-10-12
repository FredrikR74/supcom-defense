import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, addWreck, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };
const cmd = (w, c) => queueCommand(w, { owner: PLAYER_ID, ...c });

function setup() {
  const world = createWorld({ map: firstDefense, config: { difficulty: 0 } });
  const economy = world.players[PLAYER_ID].economy;
  economy.mass.max = economy.mass.stored = 5000;
  economy.energy.max = economy.energy.stored = 50000;
  return { world, economy, acu: getEntity(world, world.acuId) };
}

describe('patrull köad efter ett bygge', () => {
  it('ACU:n fortsätter patrullera när patrullen börjar mitt i den nya byggnaden', () => {
    const { world, acu } = setup();
    const deposit = firstDefense.massDeposits[0];
    cmd(world, { type: 'build', ids: [acu.id], structure: 'massExtractor', x: deposit.x, z: deposit.z });
    cmd(world, { type: 'patrol', ids: [acu.id], x: deposit.x + 10, z: deposit.z, queue: true });
    ticks(world, 200);
    expect(acu.orders.map((o) => o.type)).toEqual(['patrol']);
    // Den ska röra sig fram och tillbaka, inte stå still.
    const xs = [];
    for (let i = 0; i < 200; i++) {
      tickWorld(world);
      xs.push(acu.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
    const moving = xs.slice(100).some((x, i, a) => i > 0 && x !== a[i - 1]);
    expect(moving).toBe(true);
  });
});

describe('ACU:n på patrull', () => {
  it('skjuter på fiender innan den återvinner', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'patrol', ids: [acu.id], x: acu.x + 10, z: acu.z });
    tickWorld(world);
    const wreck = addWreck(world, { type: 'mantis', x: acu.x - 3, z: acu.z + 3, radius: 0.6, mass: 500 });
    const enemy = addUnit(world, 'mantis', { x: acu.x + 4, z: acu.z + 6, owner: ENEMY_ID });
    enemy.hp = enemy.maxHp = 1000;
    ticks(world, 10);
    expect(acu.targetId).toBe(enemy.id);
    expect(acu.orders.some((o) => o.type === 'reclaim')).toBe(false);
    enemy.hp = 0;
    ticks(world, 60);
    expect(getEntity(world, wreck.id)?.mass ?? 0).toBeLessThan(500);
  });

  it('går och anfaller fiender inom sin GuardScanRadius i stället för att återvinna', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'patrol', ids: [acu.id], x: acu.x + 10, z: acu.z });
    tickWorld(world);
    addWreck(world, { type: 'mantis', x: acu.x - 2, z: acu.z, radius: 0.6, mass: 500 });
    // Utom räckvidd (11) men inom GuardScanRadius (15,75).
    const enemy = addUnit(world, 'mantis', { x: acu.x, z: acu.z + 14, owner: ENEMY_ID });
    tickWorld(world);
    expect(acu.orders[0]).toMatchObject({ type: 'attack', targetId: enemy.id });
  });
});

describe('pausade fabriker', () => {
  it('en pausad fabrik står still med kön kvar och fortsätter när pausen hävs', () => {
    const { world } = setup();
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    ticks(world, 10);
    const progress = factory.productionProgress;
    expect(progress).toBeGreaterThan(0);
    cmd(world, { type: 'setPaused', ids: [factory.id], value: true });
    ticks(world, 50);
    expect(factory.paused).toBe(true);
    expect(factory.productionProgress).toBe(progress);
    expect(factory.productionQueue).toEqual(['engineer']);
    cmd(world, { type: 'setPaused', ids: [factory.id], value: false });
    ticks(world, 10);
    expect(factory.productionProgress).toBeGreaterThan(progress);
  });
});

describe('Mass Storage och Energy Storage', () => {
  it('värden från FAF (UEB1106, UEB1105) och ACU:n kan bygga dem', () => {
    expect(structures.massStorage).toMatchObject({ name: 'Mass Storage', maxHp: 800, cost: { mass: 200, energy: 1500 }, buildTime: 250 });
    expect(structures.energyStorage).toMatchObject({ name: 'Energy Storage', maxHp: 500, cost: { mass: 250, energy: 1200 }, buildTime: 200 });
    expect(units.acu.builds).toEqual(expect.arrayContaining(['massStorage', 'energyStorage']));
    expect(units.engineer.builds).toEqual(expect.arrayContaining(['massStorage', 'energyStorage']));
  });

  it('ökar lagret när de är klara och minskar det när de försvinner', () => {
    const world = createWorld({ map: firstDefense });
    const economy = world.players[PLAYER_ID].economy;
    const base = { mass: economy.mass.max, energy: economy.energy.max };
    const ms = addStructure(world, 'massStorage', { x: 50, z: 80, owner: PLAYER_ID, built: false });
    addStructure(world, 'energyStorage', { x: 54, z: 80, owner: PLAYER_ID });
    tickWorld(world);
    expect(economy.mass.max).toBe(base.mass);
    expect(economy.energy.max).toBe(base.energy + 10000);
    ms.built = true;
    ms.progress = 1;
    tickWorld(world);
    expect(economy.mass.max).toBe(base.mass + 500);
    economy.mass.stored = economy.mass.max;
    ms.hp = 0;
    ticks(world, 2);
    expect(economy.mass.max).toBe(base.mass);
    expect(economy.mass.stored).toBeLessThanOrEqual(base.mass);
  });
});
