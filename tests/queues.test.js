import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };
const cmd = (world, c) => queueCommand(world, { owner: PLAYER_ID, ...c });

function setup() {
  const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
  const economy = world.players[PLAYER_ID].economy;
  for (const r of ['mass', 'energy']) {
    economy[r].max = 1e7;
    economy[r].stored = 1e7;
  }
  return { world, acu: getEntity(world, world.acuId) };
}

describe('köa i en fabrik som uppgraderas', () => {
  it('T2-enheter går att köa medan fabriken uppgraderas och byggs när den är klar', () => {
    const { world } = setup();
    const f = addStructure(world, 'landFactory', { x: 64, z: 78, owner: PLAYER_ID });
    cmd(world, { type: 'produce', id: f.id, unit: 'pillar' });
    ticks(world, 1);
    expect(f.productionQueue).toEqual([]); // en T1-fabrik kan inte bygga Pillar

    cmd(world, { type: 'upgrade', ids: [f.id] });
    ticks(world, 1);
    cmd(world, { type: 'produce', id: f.id, unit: 'pillar', count: 2 });
    ticks(world, 1);
    expect(f.productionQueue).toEqual(['pillar', 'pillar']);

    ticks(world, Math.ceil((structures.landFactoryT2.buildTime / structures.landFactory.buildPower) * 10));
    expect(f.type).toBe('landFactoryT2');
    ticks(world, Math.ceil((units.pillar.buildTime / structures.landFactoryT2.buildPower) * 10) + 2);
    expect(world.entities.filter((e) => e.type === 'pillar')).toHaveLength(1);
  });

  it('avbryts uppgraderingen tas T2-enheterna bort ur kön, T1-enheterna ligger kvar', () => {
    const { world } = setup();
    const f = addStructure(world, 'landFactory', { x: 64, z: 78, owner: PLAYER_ID });
    cmd(world, { type: 'upgrade', ids: [f.id] });
    ticks(world, 1);
    cmd(world, { type: 'produce', id: f.id, unit: 'striker' });
    cmd(world, { type: 'produce', id: f.id, unit: 'pillar' });
    cmd(world, { type: 'produce', id: f.id, unit: 'engineer' });
    ticks(world, 1);
    cmd(world, { type: 'cancelUpgrade', ids: [f.id] });
    ticks(world, 1);
    expect(f.productionQueue).toEqual(['striker', 'engineer']);
  });
});

describe('ingenjörens byggkö', () => {
  it('valfria byggorder kan tas bort ur kön', () => {
    const { world, acu } = setup();
    const build = (x, queue) => cmd(world, { type: 'build', ids: [acu.id], structure: 'wall', x, z: 84.5, queue });
    build(50.5, false);
    build(52.5, true);
    build(54.5, true);
    build(56.5, true);
    ticks(world, 1);
    cmd(world, { type: 'cancelOrders', id: acu.id, indices: [1, 3] });
    ticks(world, 1);
    expect(acu.orders.map((o) => o.x)).toEqual([50.5, 54.5]);
  });

  it('tas den pågående bort står den påbörjade byggnaden kvar', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'build', ids: [acu.id], structure: 'pointDefense', x: 64.5, z: 72.5 });
    ticks(world, 30);
    const site = world.entities.find((e) => e.type === 'pointDefense');
    expect(site.progress).toBeGreaterThan(0);
    cmd(world, { type: 'cancelOrders', id: acu.id, indices: [0] });
    ticks(world, 2);
    expect(acu.orders).toEqual([]);
    expect(getEntity(world, site.id)).not.toBeNull();
    expect(site.built).toBe(false);
  });
});

describe('artilleri och missiler över berg', () => {
  /** Lobo vid (40, 40) som skjuter på en Mantis tolv rutor söderut, med eller utan ett berg emellan. */
  function shoot({ mountain }) {
    const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
    world.intel = null;
    const { terrain } = world;
    const n = terrain.size + 1;
    // Platt mark, och valfritt en hög bergsrygg mitt emellan.
    for (let z = 30; z <= 60; z++) {
      for (let x = 30; x <= 50; x++) terrain.heights[z * n + x] = mountain && z >= 45 && z <= 47 ? 40 : 5;
    }
    addUnit(world, 'lobo', { x: 40, z: 40, owner: PLAYER_ID });
    const target = addUnit(world, 'mantis', { x: 40, z: 52, owner: ENEMY_ID });
    ticks(world, 60);
    return target;
  }

  it('utan berg träffar granaten', () => {
    expect(shoot({ mountain: false }).hp).toBeLessThan(units.mantis.maxHp);
  });

  it('ett berg som är högre än bågen stoppar granaten', () => {
    expect(shoot({ mountain: true }).hp).toBe(units.mantis.maxHp);
  });
});

describe('direkt eld och terrängen', () => {
  /** Striker vid (40, 40) som skjuter på en Mantis åtta rutor söderut, med eller utan en kulle emellan. */
  function shoot({ ridge }) {
    const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
    world.intel = null;
    const n = world.terrain.size + 1;
    for (let z = 30; z <= 60; z++) {
      for (let x = 30; x <= 50; x++) world.terrain.heights[z * n + x] = ridge && z >= 43 && z <= 45 ? 9 : 5;
    }
    addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const target = addUnit(world, 'mantis', { x: 40, z: 48, owner: ENEMY_ID });
    ticks(world, 40);
    return target;
  }

  it('på slät mark träffar skotten', () => {
    expect(shoot({ ridge: false }).hp).toBeLessThan(units.mantis.maxHp);
  });

  it('en kulle mellan skytten och målet stoppar skotten, som i FA', () => {
    expect(shoot({ ridge: true }).hp).toBe(units.mantis.maxHp);
  });
});
