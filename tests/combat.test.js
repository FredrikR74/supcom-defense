import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { cellIndex, updatePathing } from '../src/sim/pathing.js';
import { targetingSystem } from '../src/sim/systems/combat.js';
import { spawnEnemy } from '../src/sim/enemies.js';
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
    expect(wreck.mass).toBeCloseTo(units.mantis.cost.mass * w.config.wreckMassFraction);
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
    // Första skottet avfyras direkt och är framme efter 5,5 / 30 s, nästa avfyras efter 0,3 s.
    ticks(w, 3);
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
    ticks(w, 5);
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
    const wall = addStructure(w, 'wall', { x: 20.5, z: 64.5, owner: PLAYER_ID });
    const m = spawnEnemy(w, 'mantis', 0);
    ticks(w, 100);
    expect(m.targetId).toBe(wall.id);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    const x = m.x;
    ticks(w, 10);
    expect(m.x).toBe(x); // står still medan den skjuter
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
