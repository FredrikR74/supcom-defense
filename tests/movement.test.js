import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addUnit, addStructure } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';
import { BODY_TURN_RATE } from '../src/sim/systems/movement.js';

const SPEED = units.acu.speed;

function setup() {
  const world = createWorld();
  const unit = addUnit(world, 'acu', { x: 10, z: 10, owner: PLAYER_ID });
  return { world, unit };
}

function move(world, ids, x, z, queue = false) {
  queueCommand(world, { type: 'move', owner: PLAYER_ID, ids, x, z, queue });
}

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };

describe('flyttorder', () => {
  it('enheten är på förväntad position efter N tick', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 30, 10);
    ticks(world, 10); // 1 sekund
    expect(unit.x).toBeCloseTo(10 + SPEED);
    expect(unit.z).toBeCloseTo(10);
  });

  it('stannar exakt på målet och tömmer orderkön', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 13, 14); // avstånd 5
    ticks(world, 100);
    expect(unit.x).toBe(13);
    expect(unit.z).toBe(14);
    expect(unit.orders).toEqual([]);
  });

  it('vänder sig mot målet, högst BODY_TURN_RATE per sekund', () => {
    const { world, unit } = setup();
    const start = unit.heading;
    move(world, [unit.id], 20, 10); // österut = +x
    ticks(world, 1);
    expect(Math.abs(unit.heading - start)).toBeCloseTo(BODY_TURN_RATE / 10);
    ticks(world, 9);
    expect(unit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('sparar förra positionen för interpolering', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 30, 10);
    ticks(world, 1);
    const x = unit.x;
    ticks(world, 1);
    expect(unit.prevX).toBe(x);
  });

  it('ny order utan kö ersätter den gamla', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 30, 10);
    move(world, [unit.id], 10, 30);
    ticks(world, 1);
    expect(unit.orders).toHaveLength(1);
    expect(unit.orders[0]).toMatchObject({ x: 10, z: 30 });
  });

  it('Shift köar waypoints som följs i tur och ordning', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 12, 10);
    move(world, [unit.id], 12, 12, true);
    move(world, [unit.id], 10, 12, true);
    ticks(world, 1);
    expect(unit.orders).toHaveLength(3);

    // Vägen går 10,10 → 12,10 → 12,12 → 10,12: z får inte öka innan x nått 12,
    // och x får inte minska innan z nått 12.
    for (let i = 0; i < 100 && unit.orders.length; i++) {
      tickWorld(world);
      if (unit.z > 10) expect(unit.x).toBeCloseTo(unit.z < 12 ? 12 : unit.x);
      if (unit.x < 12 && unit.z > 10) expect(unit.z).toBeCloseTo(12);
    }
    expect(unit.x).toBe(10);
    expect(unit.z).toBe(12);
  });

  it('rör sig inte längre än farten per tick även över flera waypoints', () => {
    const { world, unit } = setup();
    move(world, [unit.id], 10.1, 10);
    move(world, [unit.id], 20, 10, true);
    ticks(world, 1);
    expect(unit.x).toBeCloseTo(10 + SPEED / 10);
  });

  it('ignorerar byggnader och andra spelares enheter', () => {
    const { world } = setup();
    const building = addStructure(world, 'core', { x: 50, z: 50, owner: PLAYER_ID });
    const enemy = addUnit(world, 'acu', { x: 5, z: 5, owner: 2 });
    move(world, [building.id, enemy.id], 0, 0);
    ticks(world, 10);
    expect(building.x).toBe(50);
    expect(enemy.x).toBe(5);
    expect(enemy.orders).toEqual([]);
  });

  it('klämmer målet till kartan', () => {
    const world = createWorld({ map: firstDefense });
    move(world, [world.acuId], -50, 500);
    ticks(world, 1);
    const acu = world.entities.find((e) => e.id === world.acuId);
    expect(acu.orders[0]).toMatchObject({ x: 0, z: firstDefense.size });
  });
});

describe('startläge', () => {
  it('ACU:n står nära kärnan', () => {
    const world = createWorld({ map: firstDefense });
    const acu = world.entities.find((e) => e.id === world.acuId);
    expect(acu.type).toBe('acu');
    expect(acu.kind).toBe('unit');
    expect(Math.hypot(acu.x - firstDefense.core.x, acu.z - firstDefense.core.z)).toBeLessThan(8);
  });
});
