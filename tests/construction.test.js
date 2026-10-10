import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addUnit, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { buildRate } from '../src/sim/systems/construction.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ACU_POWER = units.acu.buildPower;
// Nära ACU:ns startposition (64, 69), på platån, utan fyndigheter.
const WALL_SPOT = { x: 60.5, z: 69.5 };
const PGEN_SPOT = { x: 61, z: 72 };

function setup() {
  const world = createWorld({ map: firstDefense });
  const acu = getEntity(world, world.acuId);
  const economy = world.players[PLAYER_ID].economy;
  return { world, acu, economy };
}

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };

function build(world, ids, structure, { x, z }, queue = false) {
  queueCommand(world, { type: 'build', owner: PLAYER_ID, ids, structure, x, z, queue });
}

const structuresOf = (world, type) => world.entities.filter((e) => e.type === type);

/** Antal tick för en byggnad vid full ekonomi. */
const buildTicks = (type, power) => Math.round(structures[type].buildTime / power * 10);

describe('buildRate', () => {
  it('kostnad 100 och byggtid 10 s med byggkraft 1 ger 0,1 per sekund', () => {
    // 0,1 per sekund = 0,01 per tick, alltså klart efter 100 tick.
    expect(buildRate(1, 10)).toBeCloseTo(0.1);
  });
});

describe('byggande', () => {
  it('skapar en ofärdig byggnad direkt när byggaren är inom räckhåll', () => {
    const { world, acu } = setup();
    build(world, [acu.id], 'wall', WALL_SPOT);
    ticks(world, 1);
    const [wall] = structuresOf(world, 'wall');
    expect(wall.built).toBe(false);
    expect(wall.progress).toBeGreaterThan(0);
    expect(wall.progress).toBeLessThan(1);
  });

  it('blir klar efter buildTime / buildPower sekunder', () => {
    const { world, acu } = setup();
    const n = buildTicks('pointDefense', ACU_POWER); // 150 / 10 = 15 s
    build(world, [acu.id], 'pointDefense', WALL_SPOT);
    ticks(world, n - 1);
    const [pd] = structuresOf(world, 'pointDefense');
    expect(pd.built).toBe(false);
    ticks(world, 1);
    expect(pd.built).toBe(true);
    expect(pd.hp).toBe(pd.maxHp);
  });

  it('drar exakt byggkostnaden löpande', () => {
    const { world, acu, economy } = setup();
    const n = buildTicks('pointDefense', ACU_POWER);
    const { mass, energy } = structures.pointDefense.cost;
    const income = structures.core.production;
    build(world, [acu.id], 'pointDefense', WALL_SPOT);
    ticks(world, n / 2);
    // Halvvägs: halva kostnaden förbrukad.
    expect(economy.mass.stored).toBeCloseTo(500 + income.mass * n / 20 - mass / 2);
    ticks(world, n / 2);
    expect(economy.mass.stored).toBeCloseTo(500 + income.mass * n / 10 - mass);
    expect(economy.energy.stored).toBeCloseTo(2000 + income.energy * n / 10 - energy);
  });

  it('byggaren tar nästa order när byggnaden är klar', () => {
    const { world, acu } = setup();
    build(world, [acu.id], 'wall', WALL_SPOT);
    ticks(world, buildTicks('wall', ACU_POWER) + 1);
    expect(acu.orders).toEqual([]);
    expect(acu.demand).toBeNull();
  });

  it('går till byggplatsen först om den är långt bort', () => {
    const { world, acu } = setup();
    const spot = { x: 64.5, z: 90.5 };
    build(world, [acu.id], 'wall', spot);
    ticks(world, 30);
    expect(structuresOf(world, 'wall')).toHaveLength(0);
    ticks(world, 200);
    const [wall] = structuresOf(world, 'wall');
    expect(wall.built).toBe(true);
    expect(Math.hypot(acu.x - spot.x, acu.z - spot.z)).toBeLessThanOrEqual(units.acu.buildRange + 0.5 + 1e-6);
  });

  it('färdiga ekonomibyggnader producerar', () => {
    const { world, acu, economy } = setup();
    build(world, [acu.id], 'powerGenerator', PGEN_SPOT);
    ticks(world, buildTicks('powerGenerator', ACU_POWER) + 1);
    expect(economy.energy.income).toBe(
      structures.core.production.energy + structures.powerGenerator.production.energy,
    );
  });

  it('ofärdiga byggnader producerar inte', () => {
    const { world, acu, economy } = setup();
    build(world, [acu.id], 'powerGenerator', PGEN_SPOT);
    ticks(world, 5);
    expect(economy.energy.income).toBe(structures.core.production.energy);
  });

  it('bygger på en fyndighet', () => {
    const { world, acu, economy } = setup();
    build(world, [acu.id], 'massExtractor', { x: 56, z: 72 });
    ticks(world, 200);
    expect(structuresOf(world, 'massExtractor')[0].built).toBe(true);
    expect(economy.mass.income).toBe(structures.core.production.mass + structures.massExtractor.production.mass);
  });

  it('går långsammare vid strömavbrott', () => {
    const { world, acu, economy } = setup();
    economy.mass.stored = 0;
    // Vägg: 3 mass/s vid byggkraft 10. Kärnan ger 1 mass/s, så effektiviteten blir 1/3.
    build(world, [acu.id], 'wall', WALL_SPOT);
    ticks(world, buildTicks('wall', ACU_POWER));
    const [wall] = structuresOf(world, 'wall');
    expect(wall.built).toBe(false);
    expect(wall.progress).toBeCloseTo(1 / 3, 1);
    ticks(world, buildTicks('wall', ACU_POWER) * 2);
    expect(wall.built).toBe(true);
  });

  it('släpper ordern om platsen blivit upptagen', () => {
    const { world, acu } = setup();
    build(world, [acu.id], 'wall', { x: 64.5, z: 64.5 }); // kärnan
    ticks(world, 2);
    expect(acu.orders).toEqual([]);
    expect(structuresOf(world, 'wall')).toHaveLength(0);
  });

  it('Shift köar flera byggen som görs i tur och ordning', () => {
    const { world, acu } = setup();
    build(world, [acu.id], 'wall', WALL_SPOT);
    build(world, [acu.id], 'wall', { x: 61.5, z: 69.5 }, true);
    build(world, [acu.id], 'wall', { x: 62.5, z: 69.5 }, true);
    ticks(world, 1);
    expect(acu.orders).toHaveLength(3);
    expect(structuresOf(world, 'wall')).toHaveLength(1);
    ticks(world, buildTicks('wall', ACU_POWER) * 3 + 5);
    const walls = structuresOf(world, 'wall');
    expect(walls).toHaveLength(3);
    expect(walls.every((w) => w.built)).toBe(true);
  });
});

describe('assist', () => {
  it('två byggare halverar tiden', () => {
    const { world, acu } = setup();
    const acu2 = addUnit(world, 'acu', { x: 62, z: 69, owner: PLAYER_ID });
    const n = buildTicks('pointDefense', ACU_POWER);
    build(world, [acu.id, acu2.id], 'pointDefense', WALL_SPOT);
    ticks(world, n / 2);
    expect(structuresOf(world, 'pointDefense')).toHaveLength(1);
    expect(structuresOf(world, 'pointDefense')[0].built).toBe(true);
  });

  it('assist-kommandot hjälper en påbörjad byggnad', () => {
    const { world, acu } = setup();
    const acu2 = addUnit(world, 'acu', { x: 62, z: 69, owner: PLAYER_ID });
    const n = buildTicks('pointDefense', ACU_POWER);
    build(world, [acu.id], 'pointDefense', WALL_SPOT);
    ticks(world, 1);
    const [pd] = structuresOf(world, 'pointDefense');
    queueCommand(world, { type: 'assist', owner: PLAYER_ID, ids: [acu2.id], targetId: pd.id });
    ticks(world, Math.ceil(n / 2) + 1);
    expect(pd.built).toBe(true);
  });
});

describe('sälja', () => {
  it('ger tillbaka halva massan och frigör platsen', () => {
    const { world, acu, economy } = setup();
    build(world, [acu.id], 'pointDefense', WALL_SPOT);
    ticks(world, buildTicks('pointDefense', ACU_POWER) + 1);
    const [pd] = structuresOf(world, 'pointDefense');
    const before = economy.mass.stored;
    queueCommand(world, { type: 'sell', owner: PLAYER_ID, ids: [pd.id] });
    ticks(world, 1);
    expect(getEntity(world, pd.id)).toBeNull();
    const income = structures.core.production.mass / 10;
    expect(economy.mass.stored).toBeCloseTo(before + income + structures.pointDefense.cost.mass * 0.5);
    expect(world.occupancy[69 * 128 + 60]).toBe(0);
  });

  it('en ofärdig byggnad ger tillbaka i proportion till hur långt den kommit', () => {
    const { world, acu, economy } = setup();
    build(world, [acu.id], 'pointDefense', WALL_SPOT);
    ticks(world, buildTicks('pointDefense', ACU_POWER) / 2);
    const [pd] = structuresOf(world, 'pointDefense');
    expect(pd.progress).toBeCloseTo(0.5);
    const before = economy.mass.stored;
    queueCommand(world, { type: 'sell', owner: PLAYER_ID, ids: [pd.id] });
    acu.orders.length = 0;
    ticks(world, 1);
    const income = structures.core.production.mass / 10;
    expect(economy.mass.stored).toBeCloseTo(before + income + structures.pointDefense.cost.mass * 0.25);
  });

  it('kärnan går inte att sälja', () => {
    const { world } = setup();
    queueCommand(world, { type: 'sell', owner: PLAYER_ID, ids: [world.coreId] });
    ticks(world, 1);
    expect(getEntity(world, world.coreId)).not.toBeNull();
  });
});

describe('produktion', () => {
  it('kärnan bygger en ingenjör', () => {
    const { world } = setup();
    const n = Math.round(units.engineer.buildTime / structures.core.buildPower * 10);
    queueCommand(world, { type: 'produce', owner: PLAYER_ID, id: world.coreId, unit: 'engineer', count: 2 });
    ticks(world, n - 1);
    expect(structuresOf(world, 'engineer')).toHaveLength(0);
    ticks(world, 1);
    expect(structuresOf(world, 'engineer')).toHaveLength(1);
    ticks(world, n);
    expect(structuresOf(world, 'engineer')).toHaveLength(2);
    ticks(world, 30);
    const [a, b] = structuresOf(world, 'engineer');
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });

  it('ingenjören kan bygga', () => {
    const { world } = setup();
    queueCommand(world, { type: 'produce', owner: PLAYER_ID, id: world.coreId, unit: 'engineer' });
    ticks(world, 60);
    const [eng] = structuresOf(world, 'engineer');
    build(world, [eng.id], 'wall', { x: 66.5, z: 72.5 });
    ticks(world, 100);
    expect(structuresOf(world, 'wall')[0]?.built).toBe(true);
  });
});
