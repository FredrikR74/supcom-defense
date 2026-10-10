import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, addWreck, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import units from '../src/data/units.js';
import structures from '../src/data/structures.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };
const cmd = (w, c) => queueCommand(w, { owner: PLAYER_ID, ...c });

function setup() {
  const world = createWorld({ map: firstDefense });
  const economy = world.players[PLAYER_ID].economy;
  economy.mass.max = economy.mass.stored = 5000;
  economy.energy.max = economy.energy.stored = 50000;
  return { world, acu: getEntity(world, world.acuId), economy };
}

describe('reparation', () => {
  it('reparerar i byggtakt och kostar som att bygga den saknade delen', () => {
    const { world, acu, economy } = setup();
    const pd = addStructure(world, 'pointDefense', { x: 60.5, z: 69.5, owner: PLAYER_ID });
    pd.hp = pd.maxHp / 2;
    economy.mass.stored = 1000;
    cmd(world, { type: 'repair', ids: [acu.id], targetId: pd.id });
    // Halva HP:n tar halva byggtiden för ACU:n: 250 / 10 / 2 = 12,5 s.
    const n = Math.round(structures.pointDefense.buildTime / units.acu.buildPower / 2 * 10);
    const before = economy.mass.stored;
    ticks(world, n + 1);
    expect(pd.hp).toBeCloseTo(pd.maxHp);
    // Kostnad: halva massan, minus ACU:ns inkomst under tiden.
    const spent = before - economy.mass.stored + units.acu.production.mass * (n + 1) / 10;
    expect(spent).toBeCloseTo(structures.pointDefense.cost.mass / 2, 0);
    ticks(world, 2);
    expect(acu.orders).toEqual([]);
  });

  it('reparerar kärnan (Quantum Gateway)', () => {
    const { world, acu } = setup();
    const core = getEntity(world, world.coreId);
    expect(structures.core.name).toBe('Quantum Gateway');
    core.hp = 5000;
    cmd(world, { type: 'repair', ids: [acu.id], targetId: core.id });
    ticks(world, 50);
    expect(core.hp).toBeGreaterThan(5000);
  });

  it('reparerar inte fiender eller det som är helt', () => {
    const { world, acu } = setup();
    const pd = addStructure(world, 'pointDefense', { x: 60.5, z: 69.5, owner: PLAYER_ID });
    // Långt bort, så att ingen skjuter på den under testet.
    const enemy = addStructure(world, 'pointDefense', { x: 110.5, z: 110.5, owner: ENEMY_ID });
    enemy.hp = 10;
    cmd(world, { type: 'repair', ids: [acu.id], targetId: enemy.id });
    cmd(world, { type: 'repair', ids: [acu.id], targetId: pd.id, queue: true });
    ticks(world, 3);
    expect(enemy.hp).toBe(10);
    expect(acu.orders).toEqual([]);
  });
});

describe('återvinning', () => {
  it('vrak innehåller 81 % av massan för T1, som i FA', () => {
    const { world } = setup();
    const m = addUnit(world, 'mantis', { x: 30, z: 30, owner: ENEMY_ID });
    m.hp = 0;
    tickWorld(world);
    const wreck = world.entities.find((e) => e.kind === 'wreck');
    expect(wreck.mass).toBeCloseTo(units.mantis.cost.mass * 0.81);
  });

  it('tar massan / (byggkraft × 10) sekunder och ger massan', () => {
    const { world, economy } = setup();
    const eng = addUnit(world, 'engineer', { x: 40, z: 40, owner: PLAYER_ID });
    const wreck = addWreck(world, { type: 'mantis', x: 42, z: 40, radius: 0.6, mass: 50 });
    economy.mass.stored = 0;
    cmd(world, { type: 'reclaim', ids: [eng.id], targetId: wreck.id });
    // 50 / (5 × 10) = 1 s.
    ticks(world, 10);
    expect(getEntity(world, wreck.id)).toBeNull();
    const income = units.acu.production.mass * 1;
    expect(economy.mass.stored).toBeCloseTo(50 + income);
    ticks(world, 2);
    expect(eng.orders).toEqual([]);
  });

  it('går till vraket först om det är långt bort', () => {
    const { world } = setup();
    const eng = addUnit(world, 'engineer', { x: 40, z: 40, owner: PLAYER_ID });
    const wreck = addWreck(world, { type: 'mantis', x: 60, z: 40, radius: 0.6, mass: 30 });
    cmd(world, { type: 'reclaim', ids: [eng.id], targetId: wreck.id });
    ticks(world, 10);
    expect(getEntity(world, wreck.id)).not.toBeNull();
    ticks(world, 80);
    expect(getEntity(world, wreck.id)).toBeNull();
  });
});

describe('patrull', () => {
  it('går fram och tillbaka mellan två punkter', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    cmd(world, { type: 'patrol', ids: [tank.id], x: 50, z: 40 });
    let maxX = 0;
    let backAtStart = false;
    for (let i = 0; i < 120; i++) {
      tickWorld(world);
      maxX = Math.max(maxX, tank.x);
      if (maxX > 49.5 && tank.x <= 40.5) backAtStart = true;
    }
    // Vid vändpunkten används resten av tickets förflyttning på väg tillbaka.
    expect(maxX).toBeGreaterThan(49.5);
    expect(maxX).toBeLessThanOrEqual(50);
    expect(backAtStart).toBe(true);
    expect(tank.orders[0].type).toBe('patrol');
  });

  it('en patrullerande ingenjör reparerar och återvinner på vägen och fortsätter sedan', () => {
    const { world } = setup();
    const eng = addUnit(world, 'engineer', { x: 40, z: 40, owner: PLAYER_ID });
    const wall = addStructure(world, 'wall', { x: 45.5, z: 42.5, owner: PLAYER_ID });
    wall.hp = 100;
    const wreck = addWreck(world, { type: 'mantis', x: 50, z: 38, radius: 0.6, mass: 20 });
    cmd(world, { type: 'patrol', ids: [eng.id], x: 56, z: 40 });
    ticks(world, 200);
    expect(wall.hp).toBe(wall.maxHp);
    expect(getEntity(world, wreck.id)).toBeNull();
    expect(eng.orders[0].type).toBe('patrol');
  });

  it('Shift lägger till fler patrullpunkter', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    cmd(world, { type: 'patrol', ids: [tank.id], x: 50, z: 40 });
    cmd(world, { type: 'patrol', ids: [tank.id], x: 50, z: 50, queue: true });
    tickWorld(world);
    expect(tank.orders).toHaveLength(1);
    expect(tank.orders[0].points).toHaveLength(3);
  });

  it('en köad patrull börjar där förra ordern slutar, inte där enheten står', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    cmd(world, { type: 'move', ids: [tank.id], x: 50, z: 40 });
    cmd(world, { type: 'patrol', ids: [tank.id], x: 50, z: 50, queue: true });
    cmd(world, { type: 'patrol', ids: [tank.id], x: 40, z: 50, queue: true });
    tickWorld(world);
    expect(tank.orders.map((o) => o.type)).toEqual(['move', 'patrol']);
    expect(tank.orders[1].points).toEqual([{ x: 50, z: 40 }, { x: 50, z: 50 }, { x: 40, z: 50 }]);
    ticks(world, 300);
    // Patrullen går aldrig tillbaka till startplatsen (40, 40).
    expect(tank.orders[0].type).toBe('patrol');
    expect(Math.hypot(tank.x - 40, tank.z - 40)).toBeGreaterThan(1);
  });

  it('beväpnade patrullerare stannar och skjuter', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const m = addUnit(world, 'mantis', { x: 45, z: 46, owner: ENEMY_ID });
    m.orders.length = 0;
    m.hp = 1e6;
    cmd(world, { type: 'patrol', ids: [tank.id], x: 60, z: 40 });
    ticks(world, 20);
    expect(tank.targetId).toBe(m.id);
    const x = tank.x;
    ticks(world, 10);
    expect(tank.x).toBe(x);
  });
});
