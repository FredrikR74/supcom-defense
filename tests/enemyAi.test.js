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

describe('avståndshållning', () => {
  it('en Hoplite backar undan en Pillar som skjuter kortare och tar ingen skada', () => {
    const w = setup();
    const spot = alongPath(w, 0, 25); // långt från kärnan, som annars är ett bättre mål
    const hoplite = enemy(w, 'hoplite', spot.x, spot.z);
    const pillar = addUnit(w, 'pillar', { x: spot.x + 18, z: spot.z, owner: PLAYER_ID });
    pillar.orders.push({ type: 'attack', targetId: hoplite.id });
    let kited = false;
    ticks(w, 10 * 12, () => { if (hoplite.kite) kited = true; });
    expect(kited).toBe(true);
    expect(hoplite.hp).toBe(hoplite.maxHp);
    expect(pillar.hp).toBeLessThan(pillar.maxHp);
  });

  it('backar inte från en enhet som når lika långt', () => {
    const w = setup();
    const spot = alongPath(w, 0, 40);
    const mantis = enemy(w, 'mantis', spot.x, spot.z);
    addUnit(w, 'striker', { x: spot.x + 8, z: spot.z, owner: PLAYER_ID });
    let kited = false;
    ticks(w, 10 * 3, () => { if (mantis.kite) kited = true; });
    expect(kited).toBe(false);
  });
});

describe('reträtt och sammanslagning', () => {
  /** Tre kända PD runt vägen (för starka för en liten trupp), utan hotkostnad. */
  function fortress(enemyAi = {}) {
    const w = setup({ threatCostPerDps: 0, ...enemyAi });
    const spot = alongPath(w, 0, 40);
    const pds = [[0, 2], [2, -2], [-2, -2]].map(([dx, dz]) => known(w, 'pointDefense', spot.x + dx, spot.z + dz));
    ticks(w, 1);
    return { w, pds };
  }
  const inRange = (w, pds, e) => pds.some((pd) => Math.hypot(e.x - pd.x, e.z - pd.z) <= structures.pointDefense.weapon.range + e.radius);

  it('en för svag trupp stannar utom räckhåll och väntar i stället för att anfalla', () => {
    const { w, pds } = fortress();
    const squad = spawnSquad(w, Array(3).fill('mantis'), 0);
    const all = squad.members.map((m) => getEntity(w, m.id));
    let entered = false;
    ticks(w, 10 * 40, () => { if (all.some((e) => inRange(w, pds, e))) entered = true; });
    expect(squad.state).toBe('wait');
    expect(entered).toBe(false);
    expect(all.every((e) => e.hp === e.maxHp)).toBe(true);
  }, 30000);

  it('backar ut ur räckhåll när den upptäcker att den är för svag', () => {
    const { w, pds } = fortress();
    const squad = spawnSquad(w, Array(3).fill('mantis'), 0);
    // Glöm försvaret tills truppen står mitt framför det.
    for (const pd of pds) pd.enemySeen = false;
    const all = squad.members.map((m) => getEntity(w, m.id));
    let retreated = false;
    ticks(w, 10 * 60, () => { if (squad.state === 'retreat') retreated = true; });
    expect(retreated).toBe(true);
    expect(squad.state).toBe('wait');
    expect(all.filter((e) => e.hp > 0).every((e) => !inRange(w, pds, e))).toBe(true);
  }, 30000);

  it('slås ihop med nästa trupp och går fram när de tillsammans är starka nog', () => {
    const { w } = fortress();
    const weak = spawnSquad(w, Array(3).fill('mantis'), 0);
    ticks(w, 10 * 15);
    expect(weak.state).toBe('wait');
    spawnSquad(w, Array(20).fill('mantis'), 0);
    let merged = false;
    ticks(w, 10 * 40, () => { if (w.squads.length === 1 && weak.members.length === 23) merged = true; });
    expect(merged).toBe(true);
    expect(['march', 'engaged']).toContain(weak.state);
  }, 30000);

  it('växlar inte fram och tillbaka mellan reträtt och marsch framför en ACU (som då missar)', () => {
    const w = setup();
    const acu = addUnit(w, 'acu', { ...alongPath(w, 0, 30), owner: PLAYER_ID });
    const squad = spawnSquad(w, Array(8).fill('mantis'), 0);
    let changes = 0;
    let last = squad.state;
    ticks(w, 10 * 40, () => {
      if (squad.state !== last && (squad.state === 'retreat' || last === 'retreat')) changes++;
      last = squad.state;
    });
    expect(acu.hp).toBeGreaterThan(0);
    expect(changes).toBeLessThanOrEqual(2); // in i reträtten och ut till väntan, en gång
    expect(squad.state).toBe('wait');
  }, 30000);

  it('går fram ändå när den har väntat för länge', () => {
    const { w } = fortress({ maxWaitSeconds: 5 });
    const squad = spawnSquad(w, Array(3).fill('mantis'), 0);
    let waited = false;
    let advanced = false;
    ticks(w, 10 * 20, () => {
      if (squad.state === 'wait') waited = true;
      if (waited && (squad.state === 'march' || squad.state === 'engaged')) advanced = true;
    });
    expect(waited).toBe(true);
    expect(advanced).toBe(true);
  }, 30000);
});

describe('skottlinje', () => {
  /** Höjer terrängen i en ås tvärs över x = x0..x0+1 (rutornas hörn) runt z. */
  function ridge(w, x0, z, height = 6) {
    const m = w.terrain.size + 1;
    for (let gz = Math.floor(z) - 4; gz <= Math.floor(z) + 5; gz++) {
      for (let gx = x0; gx <= x0 + 1; gx++) w.terrain.heights[gz * m + gx] += height;
    }
  }

  it('fienden skjuter inte rakt in i en kulle, men gör det när vägen är fri', () => {
    const w = setup();
    const spot = alongPath(w, 0, 25);
    const m = enemy(w, 'mantis', spot.x, spot.z);
    const striker = addUnit(w, 'striker', { x: spot.x + 7, z: spot.z, owner: PLAYER_ID });
    ticks(w, 2);
    expect(m.targetId).toBe(striker.id);
    ridge(w, Math.floor(spot.x) + 3, spot.z);
    ticks(w, 6);
    expect(m.targetId).toBe(null);
  });

  it('med en attackorder går den närmare tills skottet når fram', () => {
    const w = setup();
    const spot = alongPath(w, 0, 25);
    const pd = known(w, 'pointDefense', spot.x + 8, spot.z);
    pd.hp = pd.maxHp = 1e6; // ska inte dö under testet
    const m = enemy(w, 'mantis', spot.x, spot.z);
    m.hp = m.maxHp = 1e6;
    m.orders.push({ type: 'attack', targetId: pd.id });
    ridge(w, Math.floor(spot.x) + 3, spot.z);
    let fired = false;
    ticks(w, 10 * 10, () => { if (m.targetId === pd.id) fired = true; });
    expect(fired).toBe(true);
    expect(Math.hypot(m.x - pd.x, m.z - pd.z)).toBeLessThan(8);
  });
});
