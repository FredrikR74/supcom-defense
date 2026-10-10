import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addStructure, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { cellIndex, isBlockedCell } from '../src/sim/pathing.js';
import { hasClearPath, findPath } from '../src/sim/unitPath.js';
import firstDefense from '../src/data/maps/firstDefense.js';

function setup() {
  const world = createWorld({ map: firstDefense });
  const acu = getEntity(world, world.acuId); // står på (64, 69)
  return { world, acu };
}

/** Lodrät mur vid x = 60 från z0 till z1. */
function wall(world, x, z0, z1) {
  for (let z = z0; z <= z1; z++) addStructure(world, 'wall', { x: x + 0.5, z: z + 0.5, owner: PLAYER_ID });
}

const cmd = (world, c) => queueCommand(world, { owner: PLAYER_ID, ...c });

function runChecked(world, unit, n) {
  for (let i = 0; i < n; i++) {
    tickWorld(world);
    expect(isBlockedCell(world, cellIndex(world, unit.x, unit.z))).toBe(false);
  }
}

describe('hasClearPath', () => {
  it('fri sikt på öppen mark, blockerad genom en mur', () => {
    const { world } = setup();
    expect(hasClearPath(world, 50, 70, 70, 70)).toBe(true);
    wall(world, 60, 65, 75);
    expect(hasClearPath(world, 50, 70, 70, 70)).toBe(false);
  });

  it('stopShort gör att ett mål inne i en byggnad räknas som synligt', () => {
    const { world } = setup();
    addStructure(world, 'wall', { x: 70.5, z: 70.5, owner: PLAYER_ID });
    expect(hasClearPath(world, 60.5, 70.5, 70.5, 70.5)).toBe(false);
    expect(hasClearPath(world, 60.5, 70.5, 70.5, 70.5, 2)).toBe(true);
  });
});

describe('findPath', () => {
  it('går runt en mur och kortar av vägen', () => {
    const { world } = setup();
    wall(world, 60, 65, 75);
    const { points, reachesGoal } = findPath(world, 55, 70, { x: 66, z: 70, reach: 0 });
    expect(reachesGoal).toBe(true);
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThan(6);
    for (const p of points) expect(isBlockedCell(world, cellIndex(world, p.x, p.z))).toBe(false);
  });
});

describe('egna enheter går runt hinder', () => {
  it('ACU:n tar sig förbi en mur utan att gå in i den', () => {
    const { world, acu } = setup();
    wall(world, 60, 62, 76);
    cmd(world, { type: 'move', ids: [acu.id], x: 55.5, z: 69.5 });
    runChecked(world, acu, 200);
    expect(acu.x).toBe(55.5);
    expect(acu.z).toBe(69.5);
    expect(acu.orders).toEqual([]);
  });

  it('går rakt när vägen är fri', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'move', ids: [acu.id], x: 64, z: 80 });
    tickWorld(world);
    tickWorld(world);
    expect(acu.x).toBeCloseTo(64);
    expect(acu.orders[0].path).toBeNull();
  });

  it('en byggare når en byggplats bakom en mur', () => {
    const { world, acu } = setup();
    wall(world, 60, 60, 78);
    cmd(world, { type: 'build', ids: [acu.id], structure: 'powerGenerator', x: 51, z: 69 });
    runChecked(world, acu, 300);
    const pgen = world.entities.find((e) => e.type === 'powerGenerator');
    expect(pgen?.built).toBe(true);
    expect(acu.x).toBeLessThan(60);
  });

  it('en flyttorder till en blockerad ruta slutar intill den', () => {
    const { world, acu } = setup();
    addStructure(world, 'powerGenerator', { x: 64, z: 80, owner: PLAYER_ID });
    cmd(world, { type: 'move', ids: [acu.id], x: 64.2, z: 80.3 });
    runChecked(world, acu, 200);
    expect(acu.orders).toEqual([]);
    expect(Math.hypot(acu.x - 64, acu.z - 80)).toBeLessThan(2.5);
  });

  it('räknar om vägen när en byggnad dyker upp i den', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'move', ids: [acu.id], x: 64.5, z: 90.5 });
    tickWorld(world);
    wall(world, 64, 75, 75);
    for (let x = 58; x <= 70; x++) if (x !== 64) addStructure(world, 'wall', { x: x + 0.5, z: 75.5, owner: PLAYER_ID });
    runChecked(world, acu, 300);
    expect(acu.x).toBe(64.5);
    expect(acu.z).toBe(90.5);
  });

});
