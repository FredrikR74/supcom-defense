import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { queueCommand } from '../src/sim/commands.js';
import { difficultyMultiplier, threatRate, directorInfo, difficultyLabel } from '../src/sim/director.js';
import gameConfig from '../src/data/gameConfig.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const TEST_DIRECTOR = {
  graceSeconds: 10,
  baseRate: 2,
  growthPerMinute: 1,
  spawnSwitchSeconds: 30,
  survivalSeconds: 600,
  unitPool: [{ type: 'mantis', weight: 1 }],
};

function setup(difficulty = 50, director = TEST_DIRECTOR) {
  return createWorld({ map: firstDefense, config: { director, difficulty } });
}

const seconds = (w, s) => { for (let i = 0; i < s * 10; i++) tickWorld(w); };
const enemies = (w) => w.entities.filter((e) => e.owner === ENEMY_ID && e.kind === 'unit');
/** Döda allt så att fienderna inte stör (de skulle annars stå kvar och slåss). */
const clearEnemies = (w) => { for (const e of enemies(w)) e.hp = 0; };

describe('svårighetsgrad', () => {
  it('0 är mycket lätt (×0,1), 50 normal (×1), 100 omöjligt (×10)', () => {
    expect(difficultyMultiplier(0)).toBeCloseTo(0.1);
    expect(difficultyMultiplier(50)).toBeCloseTo(1);
    expect(difficultyMultiplier(100)).toBeCloseTo(10);
    expect(difficultyLabel(0)).toBe('Very easy');
    expect(difficultyLabel(50)).toBe('Normal');
    expect(difficultyLabel(100)).toBe('Impossible');
  });

  it('kan ändras under spelet och kläms till 0–100', () => {
    const w = setup();
    queueCommand(w, { type: 'setDifficulty', owner: PLAYER_ID, value: 140 });
    tickWorld(w);
    expect(w.director.difficulty).toBe(100);
    queueCommand(w, { type: 'setDifficulty', owner: PLAYER_ID, value: -5 });
    tickWorld(w);
    expect(w.director.difficulty).toBe(0);
  });

  it('standardinställningen finns i konfigurationen', () => {
    expect(gameConfig.difficulty).toBe(50);
    expect(gameConfig.director.graceSeconds).toBeGreaterThan(0);
  });
});

describe('fiendens strömmande tryck', () => {
  it('inga fiender under lugnet i början', () => {
    const w = setup();
    seconds(w, TEST_DIRECTOR.graceSeconds - 0.5);
    expect(enemies(w)).toHaveLength(0);
    expect(directorInfo(w).state).toBe('grace');
  });

  it('fienden kommer utan att spelaren gör något', () => {
    const w = setup();
    seconds(w, 60);
    expect(enemies(w).length + w.entities.filter((e) => e.kind === 'wreck').length).toBeGreaterThan(0);
    expect(directorInfo(w).state).toBe('active');
  });

  it('spenderad mass plus sparad budget följer inkomsten', () => {
    const w = setup();
    seconds(w, 70);
    // Inkomst base × (1 + growth × min)^1,5 (exponenten från standardkonfigurationen)
    // i 60 s efter lugnet: 2 × 60 × (2^2,5 − 1) / 2,5 ≈ 223,5.
    expect(w.director.spentMass + w.director.budget).toBeCloseTo(2 * 60 * (2 ** 2.5 - 1) / 2.5, 0);
    expect(w.director.spentMass).toBeGreaterThan(0);
  });

  it('fienderna kommer i vågor: budgeten sparas ihop mellan vågorna', () => {
    const w = setup(50, { ...TEST_DIRECTOR, waveSeconds: { min: 30, max: 30 } });
    // Lugnet slutar efter 10 s, första vågen 30 s senare.
    seconds(w, 39);
    expect(w.director.spentMass).toBe(0);
    expect(w.director.budget).toBeGreaterThan(units.mantis.cost.mass);
    seconds(w, 1.5);
    expect(w.director.waves).toBe(1);
    expect(w.director.budget).toBeLessThan(units.mantis.cost.mass);
    expect(w.squads).toHaveLength(1);
    expect(w.squads[0].members.length).toBe(enemies(w).length);
  });

  it('trycket växer med tiden', () => {
    const w = setup();
    seconds(w, 15);
    const early = threatRate(w.director);
    clearEnemies(w);
    seconds(w, 120);
    expect(threatRate(w.director)).toBeGreaterThan(early);
  });

  it('högre svårighetsgrad ger fler fiender', () => {
    const count = (difficulty) => {
      const w = setup(difficulty);
      seconds(w, 180);
      return w.director.spentMass;
    };
    expect(count(0)).toBeLessThan(count(50));
    expect(count(50)).toBeLessThan(count(100));
  }, 30000);

  it('är deterministiskt', () => {
    const run = () => {
      const w = setup();
      seconds(w, 60);
      return enemies(w).map((e) => [e.type, e.x.toFixed(3), e.z.toFixed(3)]);
    };
    expect(run()).toEqual(run());
  });

  it('typer låses upp med tiden', () => {
    const w = setup(50, {
      ...TEST_DIRECTOR,
      unitPool: [{ type: 'mole', weight: 1 }, { type: 'medusa', weight: 1000, fromMinute: 2 }],
    });
    seconds(w, 60);
    expect(w.director.spawned.medusa ?? 0).toBe(0);
    expect(w.director.spawned.mole).toBeGreaterThan(0);
    seconds(w, 75);
    expect(w.director.spawned.medusa).toBeGreaterThan(0);
  });

  it('spelet tar aldrig slut av sig självt: trycket fortsätter växa', () => {
    const w = setup(0);
    seconds(w, 30);
    const early = threatRate(w.director);
    w.director.elapsed = 60 * 60; // en timme in
    expect(threatRate(w.director)).toBeGreaterThan(early * 10);
    expect(directorInfo(w).state).toBe('active');
  });

  it('med standardvärdena accelererar trycket (exponent > 1)', () => {
    const d = { ...gameConfig.director };
    const rate = (min) => threatRate({ config: d, difficulty: 50, elapsed: d.graceSeconds + min * 60 });
    expect(rate(10) - rate(9)).toBeGreaterThan(rate(1) - rate(0));
    expect(rate(10)).toBeGreaterThan(10);
  });

  it('när kärnan förstörs är det förlust och inga fler fiender kommer', () => {
    const w = setup();
    seconds(w, 20);
    w.entities.find((e) => e.id === w.coreId).hp = 0;
    seconds(w, 1);
    expect(directorInfo(w).state).toBe('defeat');
    expect(w.events.some((e) => e.type === 'defeat')).toBe(true);
    const spent = w.director.spentMass;
    seconds(w, 20);
    expect(w.director.spentMass).toBe(spent);
  });
});
