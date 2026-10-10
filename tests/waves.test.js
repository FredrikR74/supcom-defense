import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { scheduleWave, waveInfo } from '../src/sim/waves.js';
import defaultWaves from '../src/data/waves.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const TEST_WAVES = [
  { bonus: 50, groups: [{ type: 'mantis', count: 3, interval: 1, spawn: 0 }] },
  { bonus: 70, groups: [
    { type: 'mole', count: 2, interval: 0.5, spawn: 'all' },
    { type: 'mantis', count: 1, interval: 0, spawn: 2, delay: 2 },
  ] },
];

function setup(waves = TEST_WAVES) {
  const world = createWorld({ map: firstDefense, waves });
  return world;
}

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };
const enemies = (w) => w.entities.filter((e) => e.owner === ENEMY_ID && e.kind === 'unit');
const start = (w) => queueCommand(w, { type: 'startWave', owner: PLAYER_ID });
const killAll = (w) => { for (const e of enemies(w)) e.hp = 0; };

describe('vågdata', () => {
  it('alla fiendetyper finns och alla spawnindex är giltiga', () => {
    for (const wave of defaultWaves) {
      expect(wave.groups.length).toBeGreaterThan(0);
      for (const g of wave.groups) {
        expect(units[g.type], g.type).toBeDefined();
        expect(units[g.type].faction).toBe('Cybran');
        expect(g.count).toBeGreaterThan(0);
        if (g.spawn !== 'all') expect(g.spawn).toBeLessThan(firstDefense.spawns.length);
      }
    }
  });

  it('schemat sprider ut fienderna med rätt intervall och fördröjning', () => {
    const s = scheduleWave(TEST_WAVES[1], 100, 3);
    expect(s).toEqual([
      { tick: 100, type: 'mole', spawn: 0 },
      { tick: 105, type: 'mole', spawn: 1 },
      { tick: 120, type: 'mantis', spawn: 2 },
    ]);
  });
});

describe('vågor', () => {
  it('inget händer förrän spelaren startar vågen', () => {
    const w = setup();
    ticks(w, 100);
    expect(enemies(w)).toHaveLength(0);
    expect(waveInfo(w)).toMatchObject({ state: 'build', completed: 0, total: 2, next: { number: 1 } });
  });

  it('våg 1 ger rätt antal fiender över tid', () => {
    const w = setup();
    start(w);
    tickWorld(w);
    expect(enemies(w)).toHaveLength(1);
    ticks(w, 10);
    expect(enemies(w)).toHaveLength(2);
    ticks(w, 10);
    expect(enemies(w)).toHaveLength(3);
    ticks(w, 50);
    expect(enemies(w)).toHaveLength(3);
    expect(enemies(w).every((e) => e.wave === 1)).toBe(true);
  });

  it('går inte att starta en ny våg medan en pågår', () => {
    const w = setup();
    start(w);
    tickWorld(w);
    start(w);
    ticks(w, 30);
    expect(w.wave.current).toBe(1);
    expect(enemies(w)).toHaveLength(3);
  });

  it('vågen är klar när alla fiender är döda: byggfas och bonus', () => {
    const w = setup();
    const economy = w.players[PLAYER_ID].economy;
    start(w);
    ticks(w, 25);
    expect(waveInfo(w)).toMatchObject({ state: 'active', current: 1, remaining: 3 });
    killAll(w);
    const before = economy.mass.stored;
    ticks(w, 2);
    expect(waveInfo(w)).toMatchObject({ state: 'build', completed: 1, next: { number: 2 } });
    // Bonus + kärnans inkomst under två tick.
    expect(economy.mass.stored).toBeCloseTo(before + TEST_WAVES[0].bonus + 0.2);
  });

  it('vågen är inte klar förrän alla har kommit', () => {
    const w = setup();
    start(w);
    tickWorld(w);
    killAll(w);
    ticks(w, 2);
    expect(w.wave.state).toBe('active');
  });

  it('efter sista vågen är alla vågor klarade', () => {
    const w = setup();
    for (let n = 0; n < TEST_WAVES.length; n++) {
      start(w);
      ticks(w, 40);
      killAll(w);
      ticks(w, 2);
    }
    expect(waveInfo(w)).toMatchObject({ state: 'complete', completed: 2 });
    start(w);
    ticks(w, 5);
    expect(enemies(w)).toHaveLength(0);
  });

  it('dödade fiender lämnar vrak med mass', () => {
    const w = setup();
    start(w);
    ticks(w, 25);
    killAll(w);
    tickWorld(w);
    const wrecks = w.entities.filter((e) => e.kind === 'wreck' && e.type === 'mantis');
    expect(wrecks).toHaveLength(3);
    expect(wrecks[0].mass).toBeGreaterThan(0);
  });
});

describe('fiendetyper', () => {
  it('Mole är snabb, svag och obeväpnad', () => {
    expect(units.mole.speed).toBeGreaterThan(units.mantis.speed);
    expect(units.mole.maxHp).toBeLessThan(units.mantis.maxHp);
    expect(units.mole.weapon).toBeUndefined();
  });

  it('Medusa når längre än Point Defense och beskjuter tornet', () => {
    const w = setup([{ bonus: 0, groups: [{ type: 'medusa', count: 1, interval: 0, spawn: 0 }] }]);
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 64.5, owner: PLAYER_ID });
    const acu = getEntity(w, w.acuId);
    acu.x = acu.prevX = 120;
    acu.z = acu.prevZ = 120;
    start(w);
    ticks(w, 300);
    const medusa = enemies(w).find((e) => e.type === 'medusa');
    expect(medusa).toBeDefined();
    expect(medusa.targetId).toBe(pd.id);
    expect(pd.hp).toBeLessThan(pd.maxHp);
    expect(pd.targetId).toBeNull(); // Medusa står utom räckhåll
  });
});
