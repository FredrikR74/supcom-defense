import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addStructure, getEntity, removeEntity } from '../src/sim/entities.js';
import firstDefense from '../src/data/maps/firstDefense.js';
import structures from '../src/data/structures.js';

const config = {
  startingResources: { mass: 500, energy: 2000 },
  baseStorage: { mass: 1000, energy: 5000 },
};

describe('world', () => {
  it('räknar tick', () => {
    const world = createWorld();
    for (let i = 0; i < 5; i++) tickWorld(world);
    expect(world.tick).toBe(5);
  });

  it('ger spelaren startkapital från konfigurationen', () => {
    const { economy } = createWorld({ config }).players[PLAYER_ID];
    expect(economy.mass.stored).toBe(500);
    expect(economy.energy.stored).toBe(2000);
    expect(economy.mass.max).toBe(1000);
    expect(economy.energy.max).toBe(5000);
  });

  it('placerar kärnan från kartan med full HP', () => {
    const world = createWorld({ map: firstDefense, config });
    const core = getEntity(world, world.coreId);
    expect(core.type).toBe('core');
    expect(core.owner).toBe(PLAYER_ID);
    expect(core.x).toBe(firstDefense.core.x);
    expect(core.z).toBe(firstDefense.core.z);
    expect(core.hp).toBe(structures.core.maxHp);
    expect(core.maxHp).toBe(structures.core.maxHp);
  });

  it('kärnan ger basinkomst', () => {
    const world = createWorld({ map: firstDefense, config });
    const { economy } = world.players[PLAYER_ID];
    for (let i = 0; i < 10; i++) tickWorld(world);
    const { mass, energy } = structures.core.production;
    expect(economy.mass.stored).toBeCloseTo(500 + mass);
    expect(economy.energy.stored).toBeCloseTo(2000 + energy);
    expect(economy.mass.income).toBe(mass);
  });
});

describe('entities', () => {
  it('lägger till och tar bort', () => {
    const world = createWorld();
    const a = addStructure(world, 'core', { x: 1, z: 2, owner: PLAYER_ID });
    const b = addStructure(world, 'core', { x: 3, z: 4, owner: PLAYER_ID });
    expect(a.id).not.toBe(b.id);
    expect(getEntity(world, b.id)).toBe(b);
    removeEntity(world, a.id);
    expect(getEntity(world, a.id)).toBeNull();
    expect(world.entities).toEqual([b]);
  });

  it('kastar fel för okänd typ', () => {
    expect(() => addStructure(createWorld(), 'nope', { x: 0, z: 0, owner: 1 })).toThrow();
  });
});
