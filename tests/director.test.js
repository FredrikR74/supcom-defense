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

  it('spenderad mass följer budgeten (inom en enhets kostnad)', () => {
    const w = setup();
    seconds(w, 70);
    // Integral av (base + growth × min) från lugnets slut i 60 s: 2 × 60 + 1 × 60 / 2 = 150.
    expect(w.director.spentMass).toBeGreaterThan(150 - units.mantis.cost.mass);
    expect(w.director.spentMass).toBeLessThanOrEqual(150 + 1e-6);
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
      seconds(w, 90);
      return w.director.spentMass;
    };
    expect(count(0)).toBeLessThan(count(50));
    expect(count(50)).toBeLessThan(count(100));
  });

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

  it('överlever man tiden vinner man och inga fler fiender kommer', () => {
    const w = setup(50, { ...TEST_DIRECTOR, survivalSeconds: 30 });
    seconds(w, 31);
    expect(directorInfo(w).state).toBe('victory');
    const spent = w.director.spentMass;
    seconds(w, 20);
    expect(w.director.spentMass).toBe(spent);
  });
});
