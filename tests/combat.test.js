import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { cellIndex, updatePathing } from '../src/sim/pathing.js';
import { targetingSystem, guardScanRadius } from '../src/sim/systems/combat.js';
import { spawnEnemy } from '../src/sim/enemies.js';
import { queueCommand } from '../src/sim/commands.js';
import units from '../src/data/units.js';
import structures from '../src/data/structures.js';
import firstDefense from '../src/data/maps/firstDefense.js';

function setup() {
  const world = createWorld({ map: firstDefense });
  // Flytta bort ACU:n så att den inte blandar sig i striderna.
  const acu = getEntity(world, world.acuId);
  acu.x = acu.prevX = 120;
  acu.z = acu.prevZ = 120;
  return world;
}

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };
const enemyAt = (w, x, z) => addUnit(w, 'mantis', { x, z, owner: ENEMY_ID });

describe('HP och död', () => {
  it('skada som överstiger HP ger en död enhet och ett vrak med mass', () => {
    const w = setup();
    const m = enemyAt(w, 30, 30);
    m.hp = -1;
    tickWorld(w);
    expect(getEntity(w, m.id)).toBeNull();
    const wreck = w.entities.find((e) => e.kind === 'wreck');
    expect(wreck).toMatchObject({ type: 'mantis', x: 30, z: 30 });
    // FA: kostnad × 0,9 (MassMult) × 0,9 (T1) = 81 %.
    expect(wreck.mass).toBeCloseTo(units.mantis.cost.mass * 0.81);
    expect(w.events.some((e) => e.type === 'death')).toBe(true);
  });

  it('vrak är inte mål och blockerar inte', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    pd.hp = -1;
    tickWorld(w);
    expect(w.occupancy[cellIndex(w, 30.5, 30.5)]).toBe(0);
    const tower = addStructure(w, 'pointDefense', { x: 34.5, z: 30.5, owner: ENEMY_ID });
    targetingSystem(w);
    expect(tower.targetId).toBeNull();
  });
});

describe('målsökning', () => {
  it('väljer närmaste fiende inom räckvidd', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    const far = enemyAt(w, 40, 30.5);
    const near = enemyAt(w, 36, 30.5);
    enemyAt(w, 60, 30.5); // utanför räckvidd
    targetingSystem(w);
    expect(pd.targetId).toBe(near.id);
    near.hp = -1;
    tickWorld(w);
    expect(pd.targetId).toBe(far.id);
  });

  it('ignorerar egna enheter och mål utanför räckvidd', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    addUnit(w, 'engineer', { x: 32, z: 30.5, owner: PLAYER_ID });
    enemyAt(w, 30.5 + structures.pointDefense.weapon.range + 2, 30.5);
    targetingSystem(w);
    expect(pd.targetId).toBeNull();
  });

  it('ofärdiga torn skjuter inte', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID, built: false });
    enemyAt(w, 34, 30.5);
    targetingSystem(w);
    expect(pd.targetId ?? null).toBeNull();
  });
});

describe('Point Defense', () => {
  it('vrider tornet mot målet innan det skjuter', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    pd.turretHeading = 0; // pekar mot +z
    enemyAt(w, 30.5, 20); // rakt bakom (-z)
    tickWorld(w);
    expect(w.projectiles).toHaveLength(0);
    ticks(w, 15);
    expect(Math.abs(Math.abs(pd.turretHeading) - Math.PI)).toBeLessThan(0.3);
    expect(w.events.some((e) => e.type === 'fire' && e.owner === PLAYER_ID)).toBe(true);
  });

  it('dödar en Mantis', () => {
    const w = setup();
    addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    const m = enemyAt(w, 38, 30.5);
    ticks(w, 50);
    expect(getEntity(w, m.id)).toBeNull();
  });

  it('ett skott som träffar gör exakt vapnets skada', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    pd.turretHeading = Math.PI / 2; // pekar redan mot +x
    const m = enemyAt(w, 36, 30.5);
    m.orders.length = 0; // står still
    m.hp = 10000;
    // Första skottet avfyras direkt och är framme efter avståndet / projektilfarten;
    // nästa avfyras först efter 0,3 s.
    const flight = Math.ceil((5.5 / structures.pointDefense.weapon.projectileSpeed) * 10);
    ticks(w, flight + 1); // nästa skott avfyras efter 3 tick och landar senare än så här
    expect(10000 - m.hp).toBe(structures.pointDefense.weapon.damage);
  });

  it('missar en enhet som flyttat sig från nedslagspunkten', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    pd.turretHeading = Math.PI / 2;
    const m = enemyAt(w, 42, 30.5);
    m.hp = 10000;
    tickWorld(w); // skottet avfyras
    m.x = m.prevX = 42;
    m.z = m.prevZ = 36; // flyttad i sidled
    m.orders.length = 0;
    // Första skottet hinner landa på den gamla platsen; nästa (mot den nya) har inte landat än.
    ticks(w, Math.ceil((11.5 / structures.pointDefense.weapon.projectileSpeed) * 10));
    expect(m.hp).toBe(10000);
    expect(w.events.some((e) => e.type === 'miss')).toBe(true);
  });
});

describe('fiender anfaller', () => {
  it('fiender som når kärnan skadar den', () => {
    const w = setup();
    const core = getEntity(w, w.coreId);
    for (let i = 0; i < 3; i++) spawnEnemy(w, 'mantis', 0);
    ticks(w, 400);
    expect(core.hp).toBeLessThan(core.maxHp);
  });

  it('fiender stannar och skjuter på byggnader på vägen', () => {
    const w = setup();
    const pgen = addStructure(w, 'powerGenerator', { x: 21, z: 66, owner: PLAYER_ID });
    const m = spawnEnemy(w, 'mantis', 0);
    ticks(w, 100);
    expect(m.targetId).toBe(pgen.id);
    expect(pgen.hp).toBeLessThan(pgen.maxHp);
    const x = m.x;
    ticks(w, 10);
    expect(m.x).toBe(x); // står still medan den skjuter
  });

  it('murar skjuts inte på automatiskt (BENIGN i FA): fienden går förbi', () => {
    const w = setup();
    const wall = addStructure(w, 'wall', { x: 20.5, z: 66.5, owner: PLAYER_ID });
    const m = spawnEnemy(w, 'mantis', 0);
    ticks(w, 150);
    expect(wall.hp).toBe(wall.maxHp);
    expect(m.x).toBeGreaterThan(30);
  });

  it('mobila enheter prioriteras före byggnader, som i FA', () => {
    const w = setup();
    const m = enemyAt(w, 40, 40);
    m.orders.length = 0;
    addStructure(w, 'powerGenerator', { x: 43, z: 40, owner: PLAYER_ID }); // närmast
    const eng = addUnit(w, 'engineer', { x: 40, z: 46, owner: PLAYER_ID });
    targetingSystem(w);
    expect(m.targetId).toBe(eng.id);
  });

  it('en förstörd mur öppnar vägen igen', () => {
    const w = setup();
    const wall = addStructure(w, 'wall', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    updatePathing(w);
    const i = cellIndex(w, 40.5, 40.5);
    expect(w.flow.dist[i]).toBe(Infinity);
    wall.hp = 0;
    ticks(w, 2);
    expect(Number.isFinite(w.flow.dist[i])).toBe(true);
  });

  it('ACU:n skjuter på fiender', () => {
    const w = createWorld({ map: firstDefense });
    const acu = getEntity(w, w.acuId);
    const m = enemyAt(w, acu.x + 6, acu.z);
    m.orders.length = 0;
    ticks(w, 20);
    expect(m.hp).toBeLessThan(m.maxHp);
    expect(units.acu.weapon.range).toBeGreaterThan(6);
  });
});

describe('kills, attackorder och motanfall', () => {
  it('den som skjuter det dödande skottet får en kill', () => {
    const w = setup();
    const pd = addStructure(w, 'pointDefense', { x: 30.5, z: 30.5, owner: PLAYER_ID });
    for (let i = 0; i < 2; i++) {
      const m = enemyAt(w, 36 + i, 30.5);
      m.orders.length = 0;
    }
    ticks(w, 120);
    expect(pd.kills).toBe(2);
  });

  it('som i FA: en stillastående enhet som beskjuts utom räckhåll står kvar, och klungan reagerar inte', () => {
    const w = setup();
    const tank = addUnit(w, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const friend = addUnit(w, 'striker', { x: 42, z: 40, owner: PLAYER_ID });
    // Point Defense når längre än stridsvagnarna.
    addStructure(w, 'pointDefense', { x: 40.5, z: 52.5, owner: ENEMY_ID });
    ticks(w, 60);
    expect(tank.hp).toBeLessThan(tank.maxHp);
    expect(tank.orders).toEqual([]);
    expect(friend.orders).toEqual([]);
    expect(Math.hypot(tank.x - 40, tank.z - 40)).toBeLessThan(1);
  });

  it('som i FA: en patrullerande enhet anfaller fiender inom sin GuardScanRadius och patrullerar sedan vidare', () => {
    const w = setup();
    const tank = addUnit(w, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    queueCommand(w, { type: 'patrol', owner: PLAYER_ID, ids: [tank.id], x: 30, z: 40 });
    tickWorld(w);
    // Utom räckvidd (9) men inom GuardScanRadius (1,1 × 9 = 9,9).
    const m = enemyAt(w, 40, 50.2);
    m.orders.length = 0;
    m.hp = 30;
    tickWorld(w);
    expect(tank.orders[0]).toMatchObject({ type: 'attack', targetId: m.id });
    ticks(w, 60);
    expect(getEntity(w, m.id)).toBeNull();
    expect(tank.orders.map((o) => o.type)).toEqual(['patrol']);
  });

  it('GuardScanRadius som i FAF: 1,1 × räckvidden, 0,8 × för luftvärn, ACU:n 31,5 (halverat)', () => {
    expect(guardScanRadius('striker')).toBeCloseTo(1.1 * units.striker.weapon.range);
    expect(guardScanRadius('archer')).toBeCloseTo(0.8 * units.archer.weapon.range);
    expect(guardScanRadius('acu')).toBe(15.75);
    expect(guardScanRadius('engineer')).toBe(0);
  });

  it('en enhet med flyttorder fortsätter dit spelaren skickat den', () => {
    const w = setup();
    const tank = addUnit(w, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    addStructure(w, 'pointDefense', { x: 40.5, z: 52.5, owner: ENEMY_ID });
    queueCommand(w, { type: 'move', owner: PLAYER_ID, ids: [tank.id], x: 20, z: 40 });
    ticks(w, 20);
    expect(tank.orders[0]?.type).toBe('move');
  });

  it('fiender på väg mot kärnan vänder och anfaller den som skjuter, sedan fortsätter de', () => {
    const w = setup();
    // Fienden är på väg bort från tornet (mot kärnan) och utom sin egen räckvidd.
    const m = enemyAt(w, 50, 50);
    m.orders = [{ type: 'attackCore' }];
    const pd = addStructure(w, 'pointDefense', { x: 41.5, z: 41.5, owner: PLAYER_ID });
    pd.hp = pd.maxHp = 1e9; // står kvar
    m.hp = 1e6;
    m.speed = 0.3; // långsam, så att tornets skott hinner träffa
    for (let i = 0; i < 80 && m.orders.length === 1; i++) tickWorld(w);
    expect(m.orders.map((o) => o.type)).toEqual(['attack', 'attackCore']);
  });

  it('högerklick på fiende ger attackorder', () => {
    const w = setup();
    const tank = addUnit(w, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const m = enemyAt(w, 60, 40);
    m.orders.length = 0;
    m.hp = 60; // tre skott
    queueCommand(w, { type: 'attack', owner: PLAYER_ID, ids: [tank.id], targetId: m.id });
    ticks(w, 100);
    expect(getEntity(w, m.id)).toBeNull();
    expect(tank.kills).toBe(1);
    expect(tank.orders).toEqual([]);
  });
});

describe('sikte på rörliga mål (FA:s LeadTarget)', () => {
  it('en Striker träffar en Mole som springer förbi på tvären', () => {
    const world = createWorld({ map: firstDefense });
    const tank = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
    const mole = addUnit(world, 'mole', { x: 34, z: 47, owner: ENEMY_ID });
    mole.orders = [{ type: 'move', x: 50, z: 47 }];
    for (let i = 0; i < 30 && getEntity(world, mole.id); i++) tickWorld(world);
    expect(getEntity(world, mole.id)).toBeNull();
    expect(tank.hp).toBe(tank.maxHp);
  });

  it('leadPoint siktar framför ett mål i rörelse', async () => {
    const { leadPoint } = await import('../src/sim/systems/combat.js');
    const target = { x: 10, z: 0, prevX: 9.5, prevZ: 0 };
    const p = leadPoint({ x: 0, z: 0 }, target, 12.5);
    expect(p.x).toBeGreaterThan(10); // direktskjutande siktar framför målet
    expect(p.z).toBe(0);
  });
});

describe('UEF T1-vapen', () => {
  const quiet = (u) => { u.orders.length = 0; u.hp = 1e6; return u; };

  it('Lobos granat skadar alla fiender inom splashradien', () => {
    const world = createWorld({ map: firstDefense });
    addUnit(world, 'lobo', { x: 40, z: 40, owner: PLAYER_ID });
    const a = quiet(addUnit(world, 'mantis', { x: 40, z: 50, owner: ENEMY_ID }));
    const b = quiet(addUnit(world, 'mantis', { x: 41.2, z: 50, owner: ENEMY_ID }));
    for (let i = 0; i < 40; i++) tickWorld(world);
    expect(a.hp).toBeLessThan(1e6);
    expect(b.hp).toBeLessThan(1e6);
  });

  it('Lobo skjuter inte på mål innanför sin minsta räckvidd', () => {
    const world = createWorld({ map: firstDefense });
    addUnit(world, 'lobo', { x: 40, z: 40, owner: PLAYER_ID }).orders.length = 0;
    const m = quiet(addUnit(world, 'mantis', { x: 40, z: 41.5, owner: ENEMY_ID }));
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      tickWorld(world);
      fired += world.projectiles.filter((p) => p.owner === PLAYER_ID).length;
    }
    expect(fired).toBe(0);
    expect(m.hp).toBe(1e6);
  });

  it('Archer är luftvärn och skjuter inte på markenheter', () => {
    const world = createWorld({ map: firstDefense });
    const archer = addUnit(world, 'archer', { x: 40, z: 40, owner: PLAYER_ID });
    quiet(addUnit(world, 'mantis', { x: 40, z: 45, owner: ENEMY_ID }));
    for (let i = 0; i < 30; i++) tickWorld(world);
    expect(archer.targetId).toBeNull();
  });
});
