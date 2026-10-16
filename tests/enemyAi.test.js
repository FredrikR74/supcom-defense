import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { cellIndex, flowTarget } from '../src/sim/pathing.js';
import { spawnSquad } from '../src/sim/squads.js';
import gameConfig from '../src/data/gameConfig.js';
import structures from '../src/data/structures.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (world, n, each) => {
  for (let i = 0; i < n; i++) {
    tickWorld(world);
    each?.();
  }
};

/** En värld utan fiendevågor. `enemyAi` ändrar fiendens AI-inställningar. */
function setup(enemyAi = {}) {
  const world = createWorld({
    map: firstDefense,
    config: { difficulty: 0, director: { graceSeconds: 1e9 }, enemyAi: { ...gameConfig.enemyAi, ...enemyAi } },
  });
  // Bara kärnan kvar (ACU:n skulle skjuta på fienderna).
  world.entities = world.entities.filter((e) => e.id === world.coreId);
  world.byId = new Map(world.entities.map((e) => [e.id, e]));
  world.acuId = null;
  return world;
}

/** En fiende som står still (utan order). */
const enemy = (world, type, x, z) => addUnit(world, type, { x, z, owner: ENEMY_ID });
/** En byggnad som fienden redan har sett. */
const known = (world, type, x, z) => {
  const s = addStructure(world, type, { x, z, owner: PLAYER_ID });
  s.enemySeen = true;
  world.pathDirty = true;
  return s;
};

/** Rutan `steps` steg längs flödesfältet från spawnpunkt `k`. */
function alongPath(world, k, steps) {
  const n = world.terrain.size;
  const s = world.map.spawns[k];
  let i = cellIndex(world, s.x, s.z);
  for (let j = 0; j < steps && world.flow.next[i] >= 0; j++) i = world.flow.next[i];
  return { x: (i % n) + 0.5, z: Math.floor(i / n) + 0.5 };
}

/** Rutorna på vägen från spawnpunkt `k` till kärnan. */
function pathCells(world, k) {
  const s = world.map.spawns[k];
  const cells = [];
  for (let i = cellIndex(world, s.x, s.z); i >= 0; i = world.flow.next[i]) cells.push(i);
  return cells;
}

describe('fiendens målval', () => {
  it('skjuter på det som skjuter på den före ekonomi', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    addStructure(w, 'powerGenerator', { x: 40.5, z: 46.5, owner: PLAYER_ID });
    const m = enemy(w, 'mantis', 40.5, 44.5);
    ticks(w, 2);
    expect(m.targetId).toBe(pd.id);
  });

  it('tar ut en radar före annat som inte skjuter', () => {
    const w = setup();
    addStructure(w, 'powerGenerator', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    const radar = addStructure(w, 'radar', { x: 44, z: 46, owner: PLAYER_ID });
    const m = enemy(w, 'mantis', 41, 44);
    ticks(w, 2);
    expect(m.targetId).toBe(radar.id);
  });

  it('artilleri föredrar byggnader framför enheter', () => {
    const w = setup();
    const pd = known(w, 'pointDefense', 40.5, 30.5); // Medusan ser bara 9 rutor
    addUnit(w, 'striker', { x: 40.5, z: 42, owner: PLAYER_ID });
    const medusa = enemy(w, 'medusa', 40.5, 44);
    ticks(w, 2);
    expect(medusa.targetId).toBe(pd.id);
  });

  it('fördelar elden i stället för att alla skjuter på samma nästan döda mål', () => {
    const w = setup();
    const weak = addUnit(w, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const strong = addUnit(w, 'striker', { x: 42, z: 40, owner: PLAYER_ID });
    weak.hp = 10;
    const mantises = [0, 1, 2, 3, 4, 5].map((k) => enemy(w, 'mantis', 38 + k, 46));
    ticks(w, 1);
    const onWeak = mantises.filter((m) => m.targetId === weak.id).length;
    const onStrong = mantises.filter((m) => m.targetId === strong.id).length;
    expect(onWeak).toBeGreaterThan(0);
    expect(onWeak).toBeLessThanOrEqual(2); // två salvor à 8 räcker till 10 HP
    expect(onStrong).toBeGreaterThan(0);
  });

  it('skjuter aldrig på murar', () => {
    const w = setup();
    addStructure(w, 'wall', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    const m = enemy(w, 'mantis', 40.5, 43);
    ticks(w, 6);
    expect(m.targetId).toBe(null);
  });
});

describe('fiendens vägar runt känt försvar', () => {
  it('går runt en känd PD om omvägen är kort, men inte runt en okänd', () => {
    const w = setup();
    const spot = alongPath(w, 0, 30);
    const unknown = addStructure(w, 'pointDefense', { x: spot.x, z: spot.z + 2, owner: PLAYER_ID });
    w.pathDirty = true;
    ticks(w, 1);
    const inRange = () => pathCells(w, 0).filter((i) => {
      const n = w.terrain.size;
      return Math.hypot((i % n) + 0.5 - unknown.x, Math.floor(i / n) + 0.5 - unknown.z) <= 13;
    }).length;
    const before = inRange();
    expect(before).toBeGreaterThan(5);
    unknown.enemySeen = true;
    ticks(w, 2);
    expect(inRange()).toBeLessThan(before);
  });

  it('kommer ändå fram till kärnan när ett känt försvar står intill den', () => {
    const w = setup();
    const { core } = w.map;
    known(w, 'pointDefense', core.x + 3.5, core.z + 0.5);
    ticks(w, 2);
    const half = structures.core.size / 2;
    // Rutan precis väster om kärnan: framme, ingen nästa punkt.
    expect(flowTarget(w, core.x - half - 0.5, core.z + 0.5)).toBe(null);
    expect(flowTarget(w, core.x - half - 3.5, core.z + 0.5)).not.toBe(null);
  });
});

describe('truppens planering', () => {
  /** En känd PD bredvid vägen, utan hotkostnad så att vägen går förbi den. */
  function pdOnPath(enemyAi = {}) {
    const w = setup({ threatCostPerDps: 0, ...enemyAi });
    const spot = alongPath(w, 0, 32);
    const pd = known(w, 'pointDefense', spot.x, spot.z + 2);
    ticks(w, 1);
    return { w, pd };
  }

  it('belägrar en PD med artilleri som når längre medan resten väntar utanför räckhåll', () => {
    const { w, pd } = pdOnPath();
    const squad = spawnSquad(w, ['mantis', 'mantis', 'mantis', 'mantis', 'medusa', 'medusa', 'medusa', 'medusa'], 0);
    const mantises = squad.members.map((m) => getEntity(w, m.id)).filter((e) => e.type === 'mantis');
    let sieged = false;
    let closest = Infinity;
    ticks(w, 10 * 90, () => {
      if (!getEntity(w, pd.id)) return;
      if (squad.plan?.mode === 'siege') sieged = true;
      for (const m of mantises) closest = Math.min(closest, Math.hypot(m.x - pd.x, m.z - pd.z));
    });
    expect(sieged).toBe(true);
    expect(getEntity(w, pd.id)).toBe(null);
    expect(closest).toBeGreaterThan(structures.pointDefense.weapon.range + 0.6);
    expect(mantises.every((m) => m.hp === m.maxHp)).toBe(true);
  }, 30000);

  it('anfaller tillsammans när ingen når längre än PD:n', () => {
    const { w, pd } = pdOnPath();
    const squad = spawnSquad(w, Array(8).fill('mantis'), 0);
    let assaulted = 0;
    ticks(w, 10 * 60, () => {
      if (squad.plan?.mode !== 'assault') return;
      const all = squad.members.map((m) => getEntity(w, m.id)).filter(Boolean);
      assaulted = Math.max(assaulted, all.filter((e) => e.orders[0]?.squadPlan === 'assault').length);
    });
    expect(assaulted).toBe(8);
    expect(getEntity(w, pd.id)).toBe(null);
  }, 30000);

  it('skickar ett par enheter mot en oskyddad radar nära vägen', () => {
    const w = setup();
    const spot = alongPath(w, 0, 30);
    const radar = known(w, 'radar', spot.x + 1, spot.z + 12);
    const squad = spawnSquad(w, Array(6).fill('mantis'), 0);
    let raiders = 0;
    ticks(w, 10 * 40, () => {
      const all = squad.members.map((m) => getEntity(w, m.id)).filter(Boolean);
      raiders = Math.max(raiders, all.filter((e) => e.orders[0]?.squadPlan === 'raid').length);
    });
    expect(raiders).toBeGreaterThan(0);
    expect(raiders).toBeLessThanOrEqual(gameConfig.enemyAi.raidSize);
    expect(getEntity(w, radar.id)).toBe(null);
  }, 30000);

  it('lämnar en radar som skyddas av en känd PD åt målvalet', () => {
    const w = setup({ threatCostPerDps: 0 });
    const spot = alongPath(w, 0, 30);
    known(w, 'radar', spot.x + 1, spot.z + 14);
    known(w, 'pointDefense', spot.x + 1, spot.z + 17.5);
    const squad = spawnSquad(w, Array(6).fill('mantis'), 0);
    let raided = false;
    ticks(w, 10 * 30, () => { if (squad.raid) raided = true; });
    expect(raided).toBe(false);
  }, 30000);
});
