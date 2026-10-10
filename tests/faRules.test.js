import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity, isIdleBuilder } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { cellIndex, isBlockedCell } from '../src/sim/pathing.js';
import { vetThresholds, addVetExperience, regenRate } from '../src/sim/veterancy.js';
import units from '../src/data/units.js';
import structures from '../src/data/structures.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };
const cmd = (w, c) => queueCommand(w, { owner: PLAYER_ID, ...c });

function setup() {
  const world = createWorld({ map: firstDefense });
  return { world, acu: getEntity(world, world.acuId), economy: world.players[PLAYER_ID].economy };
}

describe('FA-värden', () => {
  it('ACU bygger med 10 och T1 Engineer med 5 (FA:s BuildRate)', () => {
    expect(units.acu.buildPower).toBe(10);
    expect(units.engineer.buildPower).toBe(5);
    // T1 Mass Extractor: BuildTime 60 → 6 s för ACU:n, 12 s för en ingenjör.
    expect(structures.massExtractor.buildTime / units.acu.buildPower).toBe(6);
    expect(structures.massExtractor.buildTime / units.engineer.buildPower).toBe(12);
  });

  it('Mass Extractor ger 2 mass/s och drar 2 energi/s', () => {
    expect(structures.massExtractor.production.mass).toBe(2);
    expect(structures.massExtractor.upkeep.energy).toBe(2);
  });
});

describe('upkeep', () => {
  it('en klar Mass Extractor drar 2 energi/s', () => {
    const { world, economy } = setup();
    addStructure(world, 'massExtractor', { x: 56, z: 56, owner: PLAYER_ID });
    ticks(world, 2);
    expect(economy.energy.requested).toBe(structures.massExtractor.upkeep.energy);
    expect(economy.mass.income).toBe(units.acu.production.mass + structures.massExtractor.production.mass);
  });

  it('vid energibrist producerar Mass Extractor mindre', () => {
    const { world, economy, acu } = setup();
    // Ta bort ACU:ns energiinkomst och töm lagret: bara upkeep finns kvar.
    acu.production = { mass: 0, energy: 0 };
    economy.energy.stored = 0;
    addStructure(world, 'massExtractor', { x: 56, z: 56, owner: PLAYER_ID });
    ticks(world, 3);
    expect(economy.mass.income).toBe(0);
  });

  it('massbrist påverkar inte Mass Extractors (de drar bara energi)', () => {
    const { world, economy } = setup();
    economy.mass.stored = 0;
    addStructure(world, 'massExtractor', { x: 56, z: 56, owner: PLAYER_ID });
    cmd(world, { type: 'build', ids: [world.acuId], structure: 'pointDefense', x: 60.5, z: 69.5 });
    ticks(world, 10);
    expect(economy.mass.income).toBe(units.acu.production.mass + structures.massExtractor.production.mass);
  });
});

describe('sysslolösa byggare', () => {
  it('ACU:n är sysslolös vid start och upptagen när den bygger', () => {
    const { world, acu } = setup();
    expect(isIdleBuilder(acu)).toBe(true);
    cmd(world, { type: 'build', ids: [acu.id], structure: 'wall', x: 60.5, z: 69.5 });
    ticks(world, 2);
    expect(isIdleBuilder(acu)).toBe(false);
    ticks(world, 30);
    expect(isIdleBuilder(acu)).toBe(true);
  });

  it('fiender och byggnader räknas inte', () => {
    const { world } = setup();
    expect(isIdleBuilder(addUnit(world, 'mantis', { x: 10, z: 10, owner: ENEMY_ID }))).toBe(false);
    expect(isIdleBuilder(getEntity(world, world.coreId))).toBe(false);
  });
});

describe('egna enheter i vägen', () => {
  it('en ingenjör som står på en ny byggplats flyttar sig', () => {
    const { world, acu } = setup();
    const eng = addUnit(world, 'engineer', { x: 61, z: 72, owner: PLAYER_ID });
    cmd(world, { type: 'build', ids: [acu.id], structure: 'powerGenerator', x: 61, z: 72 });
    ticks(world, 40);
    expect(isBlockedCell(world, cellIndex(world, eng.x, eng.z))).toBe(false);
    const pgen = world.entities.find((e) => e.type === 'powerGenerator');
    expect(pgen).toBeDefined();
  });

  it('en enhet i rörelse knuffas inte av stillastående egna enheter', () => {
    const { world, acu } = setup();
    // En klunga ingenjörer rakt i ACU:ns väg.
    for (let i = 0; i < 4; i++) addUnit(world, 'engineer', { x: 64 + (i % 2) * 0.3, z: 75 + i * 0.3, owner: PLAYER_ID });
    cmd(world, { type: 'move', ids: [acu.id], x: 64, z: 85 });
    let maxSideways = 0;
    for (let i = 0; i < 60; i++) {
      tickWorld(world);
      maxSideways = Math.max(maxSideways, Math.abs(acu.x - 64));
    }
    expect(maxSideways).toBeLessThan(0.01);
    expect(acu.z).toBe(85);
  });
});

describe('HP-regenerering', () => {
  it('ACU:n regenererar 10 HP/s som i FA', () => {
    const { world, acu } = setup();
    expect(units.acu.regenRate).toBe(10);
    acu.hp = 5000;
    ticks(world, 10);
    expect(acu.hp).toBeCloseTo(5010);
  });

  it('regenererar inte över max', () => {
    const { world, acu } = setup();
    acu.hp = acu.maxHp - 0.5;
    ticks(world, 5);
    expect(acu.hp).toBe(acu.maxHp);
  });

  it('enheter utan RegenRate regenererar inte', () => {
    const { world } = setup();
    const m = addUnit(world, 'mantis', { x: 10, z: 10, owner: ENEMY_ID });
    m.hp = 100;
    ticks(world, 10);
    expect(m.hp).toBe(100);
  });
});

describe('veterancy', () => {
  it('trösklar för T1: nivå × 2 × egen massakostnad', () => {
    expect(vetThresholds(units.mantis)).toEqual([112, 224, 336, 448, 560]);
  });

  it('ACU:ns trösklar är kumulativa från VeteranMass', () => {
    expect(vetThresholds(units.acu)).toEqual([1000, 2250, 4000, 6500, 10000]);
  });

  it('en nivå ger +10 % max-HP, läkning och extra regen', () => {
    const { world } = setup();
    const m = addUnit(world, 'mantis', { x: 10, z: 10, owner: ENEMY_ID });
    m.hp = 100;
    addVetExperience(m, 112);
    expect(m.vetLevel).toBe(1);
    expect(m.maxHp).toBeCloseTo(297);
    expect(m.hp).toBeCloseTo(127); // läkning 0,1 × 270
    expect(regenRate(m)).toBe(1);
  });

  it('max en nivå per dödad fiende', () => {
    const { world } = setup();
    const m = addUnit(world, 'mantis', { x: 10, z: 10, owner: ENEMY_ID });
    addVetExperience(m, 10000);
    expect(m.vetLevel).toBe(1);
    expect(m.vetExperience).toBe(112);
  });

  it('enheter utan vapen får ingen veterancy', () => {
    const { world } = setup();
    const eng = addUnit(world, 'engineer', { x: 10, z: 10, owner: PLAYER_ID });
    addVetExperience(eng, 10000);
    expect(eng.vetLevel ?? 0).toBe(0);
  });

  it('erfarenhet = dödad massa, fördelad efter skada', () => {
    const { world, acu } = setup();
    acu.x = acu.prevX = 120;
    acu.z = acu.prevZ = 120;
    const pd = addStructure(world, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    const m = addUnit(world, 'mantis', { x: 36, z: 30.5, owner: ENEMY_ID });
    m.orders.length = 0;
    ticks(world, 60);
    expect(getEntity(world, m.id)).toBeNull();
    // Point Defense: tröskel 2 × 250 = 500, så en Mantis (56) räcker inte till nivå 1.
    expect(pd.vetExperience).toBeCloseTo(units.mantis.cost.mass);
    expect(pd.vetLevel).toBe(0);
  });
});

describe('MA12 Striker (UEF T1 Medium Tank)', () => {
  it('byggs i Land Factory med FA:s byggtid', () => {
    const { world, economy } = setup();
    economy.mass.max = economy.mass.stored = 5000;
    economy.energy.max = economy.energy.stored = 50000;
    const f = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    expect(structures.landFactory.produces).toContain('striker');
    cmd(world, { type: 'produce', id: f.id, unit: 'striker' });
    const n = Math.round(units.striker.buildTime / structures.landFactory.buildPower * 10);
    ticks(world, n);
    const tank = world.entities.find((e) => e.type === 'striker');
    expect(tank).toBeDefined();
    expect(tank.owner).toBe(PLAYER_ID);
  });

  it('skjuter på fiender, även medan den kör', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const m = addUnit(world, 'mantis', { x: 46, z: 40, owner: ENEMY_ID });
    m.orders.length = 0;
    cmd(world, { type: 'move', ids: [tank.id], x: 40, z: 50 });
    ticks(world, 30);
    expect(m.hp).toBeLessThan(m.maxHp);
  });
});

describe('fixar', () => {
  it('en ACU som strider räknas inte som sysslolös', () => {
    const { world, acu } = setup();
    const m = addUnit(world, 'mantis', { x: acu.x + 5, z: acu.z, owner: ENEMY_ID });
    m.orders.length = 0;
    ticks(world, 2);
    expect(acu.targetId).toBe(m.id);
    expect(isIdleBuilder(acu)).toBe(false);
  });

  it('en dödad ingenjörs byggkö försvinner', () => {
    const { world } = setup();
    const eng = addUnit(world, 'engineer', { x: 50, z: 80, owner: PLAYER_ID });
    for (const [i, x] of [40.5, 42.5, 44.5].entries()) {
      cmd(world, { type: 'build', ids: [eng.id], structure: 'wall', x, z: 90.5, queue: i > 0 });
    }
    ticks(world, 2);
    expect(eng.orders).toHaveLength(3);
    eng.hp = 0;
    ticks(world, 1);
    expect(getEntity(world, eng.id)).toBeNull();
    expect(eng.orders).toHaveLength(0);
  });
});

describe('markering och patrull som i FA', () => {
  it('lådmarkering tar bara bästa SelectionPriority: stridsenheter före ACU/ingenjörer före byggnader', async () => {
    const { selectInRect } = await import('../src/input/selection.js');
    const toScreen = (e) => ({ x: e.x, y: e.z });
    const all = [
      { id: 1, kind: 'unit', type: 'striker', owner: 1, x: 1, z: 1 },
      { id: 2, kind: 'unit', type: 'engineer', owner: 1, x: 2, z: 2 },
      { id: 3, kind: 'unit', type: 'acu', owner: 1, x: 3, z: 3 },
      { id: 4, kind: 'structure', type: 'pointDefense', owner: 1, x: 4, z: 4 },
    ];
    const rect = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(selectInRect(all, toScreen, rect, 1)).toEqual([1]);
    expect(selectInRect(all.slice(1), toScreen, rect, 1)).toEqual([2, 3]);
    expect(selectInRect(all.slice(3), toScreen, rect, 1)).toEqual([4]);
  });

  it('en patrullerande byggare reparerar inte enheter', () => {
    const { world } = setup();
    const eng = addUnit(world, 'engineer', { x: 40, z: 40, owner: PLAYER_ID });
    const tank = addUnit(world, 'striker', { x: 43, z: 40, owner: PLAYER_ID });
    tank.hp = 100;
    cmd(world, { type: 'patrol', ids: [eng.id], x: 50, z: 40 });
    ticks(world, 60);
    expect(tank.hp).toBe(100);
  });
});
