import { describe, it, expect } from 'vitest';
import { createWorld, PLAYER_ID } from '../src/sim/world.js';
import { addUnit, removeEntity } from '../src/sim/entities.js';
import { createControlGroups } from '../src/input/controlGroups.js';
import firstDefense from '../src/data/maps/firstDefense.js';

function setup() {
  const world = createWorld({ map: firstDefense });
  const a = addUnit(world, 'striker', { x: 40, z: 40, owner: PLAYER_ID });
  const b = addUnit(world, 'striker', { x: 44, z: 40, owner: PLAYER_ID });
  const selection = new Set();
  return { world, a, b, selection, groups: createControlGroups(world, selection) };
}

describe('kontrollgrupper', () => {
  it('Ctrl+siffra sparar och siffran väljer gruppen igen', () => {
    const { a, b, selection, groups } = setup();
    selection.add(a.id).add(b.id);
    expect(groups.save('1')).toBe(2);
    selection.clear();
    groups.recall('1', { now: 0 });
    expect([...selection]).toEqual([a.id, b.id]);
  });

  it('Shift lägger till gruppen i markeringen', () => {
    const { a, b, selection, groups } = setup();
    selection.add(a.id);
    groups.save('2');
    selection.clear();
    selection.add(b.id);
    groups.recall('2', { add: true, now: 0 });
    expect(new Set(selection)).toEqual(new Set([a.id, b.id]));
  });

  it('döda enheter faller bort, och dubbeltryck rapporteras', () => {
    const { world, a, b, selection, groups } = setup();
    selection.add(a.id).add(b.id);
    groups.save('3');
    removeEntity(world, a.id);
    expect(groups.recall('3', { now: 0 }).double).toBe(false);
    expect([...selection]).toEqual([b.id]);
    expect(groups.recall('3', { now: 200 }).double).toBe(true);
    expect(groups.recall('4', { now: 300 })).toBeNull();
  });
});
