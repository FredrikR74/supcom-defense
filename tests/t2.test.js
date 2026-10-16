import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity, isIdleFactory } from '../src/sim/entities.js';
import { queueCommand, isAssistable } from '../src/sim/commands.js';
import { createDirector, directorSystem } from '../src/sim/director.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import gameConfig from '../src/data/gameConfig.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };
const cmd = (world, c) => queueCommand(world, { owner: PLAYER_ID, ...c });
/** Antal tick för `buildTime` med byggkraften `power` (10 tick per sekund). */
const ticksFor = (buildTime, power) => Math.ceil((buildTime / power) * 10);

/** En värld med gott om resurser och utan fiender. */
function setup() {
  const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
  const economy = world.players[PLAYER_ID].economy;
  for (const r of ['mass', 'energy']) {
    economy[r].max = 1e7;
    economy[r].stored = 1e7;
  }
  return { world, economy, acu: getEntity(world, world.acuId) };
}

describe('uppgradera Land Factory till T2', () => {
  it('en T1-fabrik uppgraderas till Land Factory HQ och kan sedan bygga T2-enheter', () => {
    const { world } = setup();
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    expect(structures.landFactory.produces).not.toContain('pillar');

    cmd(world, { type: 'upgrade', ids: [factory.id] });
    const n = ticksFor(structures.landFactoryT2.buildTime, structures.landFactory.buildPower);
    ticks(world, n - 2);
    expect(factory.type).toBe('landFactory');
    expect(factory.upgrade.progress).toBeGreaterThan(0.95);
    ticks(world, 3);
    expect(factory.type).toBe('landFactoryT2');
    expect(factory.upgrade).toBeNull();
    expect(factory.maxHp).toBe(structures.landFactoryT2.maxHp);

    cmd(world, { type: 'produce', id: factory.id, unit: 'pillar' });
    ticks(world, ticksFor(units.pillar.buildTime, structures.landFactoryT2.buildPower) + 1);
    expect(world.entities.filter((e) => e.type === 'pillar')).toHaveLength(1);
  });

  it('kostar T2-fabrikens pris, dras löpande', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    cmd(world, { type: 'upgrade', ids: [factory.id] });
    ticks(world, 1);
    const rate = structures.landFactory.buildPower / structures.landFactoryT2.buildTime;
    expect(factory.demand.mass).toBeCloseTo(structures.landFactoryT2.cost.mass * rate);
    const before = economy.mass.stored;
    ticks(world, ticksFor(structures.landFactoryT2.buildTime, structures.landFactory.buildPower) + 2);
    expect(factory.type).toBe('landFactoryT2');
    expect(before - economy.mass.stored).toBeCloseTo(structures.landFactoryT2.cost.mass * (1 - rate * 0.1), 0);
  });

  it('bygger inga enheter medan den uppgraderas, men kön ligger kvar', () => {
    const { world } = setup();
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    cmd(world, { type: 'upgrade', ids: [factory.id] });
    ticks(world, ticksFor(units.engineer.buildTime, structures.landFactory.buildPower) + 5);
    expect(world.entities.filter((e) => e.type === 'engineer')).toHaveLength(0);
    expect(factory.productionQueue).toEqual(['engineer']);
    expect(isIdleFactory(factory)).toBe(false);
  });

  it('avbryts med cancelUpgrade och ger tillbaka det som lagts ner', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    const before = economy.mass.stored;
    cmd(world, { type: 'upgrade', ids: [factory.id] });
    ticks(world, 100);
    expect(economy.mass.stored).toBeLessThan(before - 1);
    cmd(world, { type: 'cancelUpgrade', ids: [factory.id] });
    ticks(world, 1);
    expect(factory.upgrade).toBeNull();
    expect(factory.type).toBe('landFactory');
    expect(economy.mass.stored).toBeCloseTo(before, 6);
  });

  it('en assisterande ingenjör gör uppgraderingen snabbare', () => {
    const { world } = setup();
    const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
    const eng = addUnit(world, 'engineer', { x: 64, z: 80, owner: PLAYER_ID });
    cmd(world, { type: 'upgrade', ids: [factory.id] });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: factory.id });
    ticks(world, 100);
    const power = structures.landFactory.buildPower;
    const alone = (power / structures.landFactoryT2.buildTime) * 10;
    expect(factory.upgrade.progress).toBeGreaterThan(alone * 1.1);
    expect(eng.buildJob).toMatchObject({ kind: 'upgrade', targetId: factory.id });
  });

  it('bara färdiga byggnader med upgradesTo kan uppgraderas', () => {
    const { world } = setup();
    const pd = addStructure(world, 'pointDefense', { x: 60.5, z: 80.5, owner: PLAYER_ID });
    const unfinished = addStructure(world, 'landFactory', { x: 64, z: 86, owner: PLAYER_ID, built: false });
    cmd(world, { type: 'upgrade', ids: [pd.id, unfinished.id] });
    ticks(world, 1);
    expect(pd.upgrade).toBeUndefined();
    expect(unfinished.upgrade).toBeUndefined();
  });
});

describe('uppgradera Mass Extractor', () => {
  it('T1 → T2: ger T2:s mass och drar T2:s energi, och producerar under uppgraderingen', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const mex = addStructure(world, 'massExtractor', { x: 56, z: 56, owner: PLAYER_ID });
    cmd(world, { type: 'upgrade', ids: [mex.id] });
    ticks(world, 10);
    expect(mex.upgrade).toBeTruthy();
    expect(economy.mass.income).toBe(structures.massExtractor.production.mass);

    ticks(world, ticksFor(structures.massExtractorT2.buildTime, structures.massExtractor.buildPower));
    expect(mex.type).toBe('massExtractorT2');
    ticks(world, 2);
    expect(economy.mass.income).toBe(6);
    expect(economy.energy.requested).toBe(9);
  });

  it('assisterande ingenjörer gör uppgraderingen snabbare, och högerklick ger assist', () => {
    const { world } = setup();
    const mex = addStructure(world, 'massExtractor', { x: 56, z: 56, owner: PLAYER_ID });
    const engs = [0, 1].map((k) => addUnit(world, 'engineer', { x: 58 + k, z: 60, owner: PLAYER_ID }));
    // Högerklick: en färdig utvinnare (före och under uppgraderingen) går att assistera.
    expect(isAssistable(mex)).toBe(true);
    cmd(world, { type: 'upgrade', ids: [mex.id] });
    ticks(world, 1);
    expect(isAssistable(mex)).toBe(true);
    cmd(world, { type: 'assist', ids: engs.map((e) => e.id), targetId: mex.id });
    ticks(world, 100);
    const alone = (structures.massExtractor.buildPower / structures.massExtractorT2.buildTime) * 10;
    expect(mex.upgrade.progress).toBeGreaterThan(alone * 1.5); // 10 + 2 × 5 i byggkraft, minus gångtiden
    for (const e of engs) expect(e.buildJob).toMatchObject({ kind: 'upgrade', targetId: mex.id });
  });

  it('T2 → T3 ger 18 mass och drar 54 energi', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const mex = addStructure(world, 'massExtractorT2', { x: 56, z: 56, owner: PLAYER_ID });
    cmd(world, { type: 'upgrade', ids: [mex.id] });
    ticks(world, ticksFor(structures.massExtractorT3.buildTime, structures.massExtractorT2.buildPower) + 1);
    expect(mex.type).toBe('massExtractorT3');
    ticks(world, 2);
    expect(economy.mass.income).toBe(18);
    expect(economy.energy.requested).toBe(54);
    // T3 är högsta nivån.
    cmd(world, { type: 'upgrade', ids: [mex.id] });
    ticks(world, 1);
    expect(mex.upgrade).toBeNull();
  });
});

describe('T2 Engineer', () => {
  it('byggs i Land Factory HQ men inte i en T1-fabrik', () => {
    expect(structures.landFactory.produces).not.toContain('engineerT2');
    expect(structures.landFactoryT2.produces).toContain('engineerT2');
    expect(units.engineerT2.buildPower).toBe(13);
  });

  it('kan bygga alla T2-byggnader, och ACU:n och T1-ingenjören kan inte', () => {
    const t2 = ['massExtractorT2', 'powerGeneratorT2', 'massFabricator', 'pointDefenseT2', 'artilleryT2', 'shieldGenerator'];
    for (const type of t2) {
      expect(units.engineerT2.builds).toContain(type);
      expect(units.engineer.builds).not.toContain(type);
      expect(units.acu.builds).not.toContain(type);
    }
    expect(units.engineerT2.builds).toContain('landFactory');
  });

  it('bygger en T2 Power Generator som ger 500 energi/s', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const eng = addUnit(world, 'engineerT2', { x: 64, z: 80, owner: PLAYER_ID });
    cmd(world, { type: 'build', ids: [eng.id], structure: 'powerGeneratorT2', x: 64.5, z: 84.5 });
    ticks(world, ticksFor(structures.powerGeneratorT2.buildTime, units.engineerT2.buildPower) + 40);
    const pgen = world.entities.find((e) => e.type === 'powerGeneratorT2');
    expect(pgen?.built).toBe(true);
    ticks(world, 1);
    expect(economy.energy.income).toBe(500);
  });
});

describe('sköldar', () => {
  /** En fiende med `type` som skjuter från (x, z). */
  const enemy = (world, type, x, z) => addUnit(world, type, { x, z, owner: ENEMY_ID });

  it('Shield Generator tar skadan från skott som slår ner innanför skölden', () => {
    const { world } = setup();
    const gen = addStructure(world, 'shieldGenerator', { x: 64.5, z: 84.5, owner: PLAYER_ID });
    const pd = addStructure(world, 'pointDefense', { x: 66.5, z: 84.5, owner: PLAYER_ID });
    // Rhino utom PD:ns räckvidd men med PD:n inom sin egen.
    const rhino = enemy(world, 'rhino', 66.5, 84.5 + 12);
    pd.enemySeen = true; // fienden har redan sett PD:n (se intel.js)
    rhino.orders.push({ type: 'attack', targetId: pd.id });
    ticks(world, 2);
    expect(gen.shieldHp).toBe(structures.shieldGenerator.shield.maxHp);
    ticks(world, 30);
    expect(gen.shieldHp).toBeLessThan(structures.shieldGenerator.shield.maxHp);
    expect(pd.hp).toBe(pd.maxHp);
  });

  it('faller vid 0, laddas om efter rechargeTime och regenererar efter regenStartTime', () => {
    const { world } = setup();
    const gen = addStructure(world, 'shieldGenerator', { x: 64.5, z: 84.5, owner: PLAYER_ID });
    ticks(world, 1);
    const { shield } = structures.shieldGenerator;
    world.projectiles.push({
      owner: ENEMY_ID, sourceId: null, source: 'rhino', x: 64.5, z: 100, prevX: 64.5, prevZ: 100,
      tx: 64.5, tz: 84.5, sx: 64.5, sz: 100, y: 1, speed: 1000, damage: shield.maxHp + 1, damageRadius: 0,
    });
    ticks(world, 1);
    expect(gen.shieldHp).toBe(0);
    expect(gen.shieldRecharge).toBeGreaterThan(0);
    expect(gen.hp).toBe(gen.maxHp);
    ticks(world, shield.rechargeTime * 10 + 1);
    expect(gen.shieldHp).toBe(shield.maxHp);
  });

  it('skott inifrån skölden går igenom', () => {
    const { world } = setup();
    addStructure(world, 'shieldGenerator', { x: 64.5, z: 84.5, owner: PLAYER_ID });
    const target = enemy(world, 'mantis', 64.5, 88);
    target.orders.length = 0;
    ticks(world, 1);
    world.projectiles.push({
      owner: PLAYER_ID, sourceId: null, source: 'striker', x: 64.5, z: 86, prevX: 64.5, prevZ: 86,
      tx: 64.5, tz: 88, sx: 64.5, sz: 86, y: 1, speed: 1000, damage: 24, damageRadius: 0,
    });
    ticks(world, 1);
    expect(target.hp).toBe(units.mantis.maxHp - 24);
  });

  it('Parashield drar energi och har en sköld', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    const p = addUnit(world, 'parashield', { x: 64, z: 84, owner: PLAYER_ID });
    ticks(world, 2);
    expect(economy.energy.requested).toBe(80);
    expect(p.shieldHp).toBe(units.parashield.shield.maxHp);
  });

  it('skölden faller vid energibrist', () => {
    const { world, economy, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    economy.energy.stored = 0;
    const gen = addStructure(world, 'shieldGenerator', { x: 64.5, z: 84.5, owner: PLAYER_ID });
    ticks(world, 3);
    expect(gen.shieldHp).toBe(0);
  });
});

describe('T2-fiender', () => {
  it('fiendens pool har Cybran T2 som kommer senare än T1', () => {
    const t2 = gameConfig.director.unitPool.filter((u) => units[u.type].techCategory === 'TECH2');
    expect(t2.map((u) => u.type).sort()).toEqual(['hoplite', 'rhino', 'viper', 'wagner']);
    for (const u of t2) {
      expect(units[u.type].faction).toBe('Cybran');
      expect(u.fromMinute).toBeGreaterThanOrEqual(10);
    }
  });

  it('directorn skapar T2-fiender', () => {
    const world = createWorld({ map: firstDefense });
    world.director = createDirector({
      ...gameConfig.director,
      graceSeconds: 0,
      startBudget: 10000,
      firstWaveSeconds: 0.1,
      unitPool: [{ type: 'rhino', weight: 1 }],
    }, 50);
    for (let i = 0; i < 5; i++) directorSystem(world);
    expect(world.director.spawned.rhino).toBeGreaterThan(0);
  });
});

describe('tech-nivå syns som i FA', () => {
  it('varje enhet och byggnad har en strategisk ikon med rätt antal tech-streck', async () => {
    const { iconTechLevel } = await import('../src/render/icons.js');
    const level = { TECH1: 1, TECH2: 2, TECH3: 3 };
    for (const [type, def] of [...Object.entries(units), ...Object.entries(structures)]) {
      const expected = type === 'acu' || type === 'wall' ? 0 : level[def.techCategory];
      expect(iconTechLevel(type), type).toBe(expected);
    }
  });

  it('namnet har tech-nivån först, som FA:s "T2 Heavy Tank"', async () => {
    const { techName } = await import('../src/ui/tech.js');
    expect(techName(units.pillar)).toBe('T2 Heavy Tank');
    expect(techName(units.rhino)).toBe('T2 Heavy Tank');
    expect(techName(units.striker)).toBe('T1 Medium Tank');
    expect(techName(units.engineerT2)).toBe('T2 Engineer');
    expect(techName(structures.massExtractorT3)).toBe('T3 Mass Extractor');
    expect(techName(units.acu)).toBe('Armored Command Unit');
  });
});
