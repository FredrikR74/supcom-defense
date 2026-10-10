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
