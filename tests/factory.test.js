import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const FACTORY_POWER = structures.landFactory.buildPower;
const ENGINEER_TICKS = Math.round(units.engineer.buildTime / FACTORY_POWER * 10);

function setup() {
  const world = createWorld({ map: firstDefense });
  // Färdig fabrik söder om kärnan; utgången är mot +z.
  const factory = addStructure(world, 'landFactory', { x: 64, z: 76, owner: PLAYER_ID });
  world.players[PLAYER_ID].economy.mass.stored = 1000;
  world.players[PLAYER_ID].economy.energy.stored = 5000;
  return { world, factory, acu: getEntity(world, world.acuId) };
}

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };
const engineers = (world) => world.entities.filter((e) => e.type === 'engineer');
const cmd = (world, c) => queueCommand(world, { owner: PLAYER_ID, ...c });

describe('Land Factory', () => {
  it('kärnan producerar inte längre något', () => {
    expect(structures.core.produces).toBeUndefined();
    const world = createWorld({ map: firstDefense });
    cmd(world, { type: 'produce', id: world.coreId, unit: 'engineer' });
    ticks(world, 300);
    expect(engineers(world)).toHaveLength(0);
  });

  it('ACU:n kan bygga en fabrik', () => {
    expect(units.acu.builds).toContain('landFactory');
  });

  it('producerar en ingenjör efter buildTime / buildPower', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer', count: 2 });
    ticks(world, ENGINEER_TICKS - 1);
    expect(engineers(world)).toHaveLength(0);
    ticks(world, 1);
    expect(engineers(world)).toHaveLength(1);
    ticks(world, ENGINEER_TICKS);
    expect(engineers(world)).toHaveLength(2);
    ticks(world, 30);
    const [a, b] = engineers(world);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });

  it('kön kan läggas medan fabriken byggs och startar när den är klar', () => {
    const world = createWorld({ map: firstDefense });
    world.players[PLAYER_ID].economy.energy.stored = 5000;
    const acu = getEntity(world, world.acuId);
    cmd(world, { type: 'build', ids: [acu.id], structure: 'landFactory', x: 64, z: 76 });
    ticks(world, 2);
    const f = world.entities.find((e) => e.type === 'landFactory');
    expect(f.built).toBe(false);
    cmd(world, { type: 'produce', id: f.id, unit: 'engineer', count: 2 });
    cmd(world, { type: 'setRally', ids: [f.id], x: 70, z: 90 });
    cmd(world, { type: 'setRepeat', ids: [f.id], value: true });
    ticks(world, 1);
    expect(f.productionQueue).toEqual(['engineer', 'engineer']);
    expect(f.rallyPoints).toEqual([{ x: 70, z: 90 }]);
    expect(f.repeat).toBe(true);
    // Ingen produktion medan den byggs.
    expect(f.productionProgress).toBe(0);
    expect(engineers(world)).toHaveLength(0);

    for (let i = 0; i < 2000 && !f.built; i++) tickWorld(world);
    expect(f.built).toBe(true);
    ticks(world, ENGINEER_TICKS + 1);
    const [eng] = engineers(world);
    expect(eng).toBeDefined();
    expect(eng.orders[0]).toMatchObject({ type: 'move', x: 70, z: 90 });
  });

  it('ingenjören från fabriken kan bygga', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    ticks(world, ENGINEER_TICKS + 20);
    const [eng] = engineers(world);
    cmd(world, { type: 'build', ids: [eng.id], structure: 'wall', x: 60.5, z: 82.5 });
    ticks(world, 100);
    expect(world.entities.find((e) => e.type === 'wall')?.built).toBe(true);
  });
});

describe('waypoints från fabrik', () => {
  it('nya enheter får fabrikens waypoints som order', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'setRally', ids: [factory.id], x: 70, z: 90 });
    cmd(world, { type: 'setRally', ids: [factory.id], x: 50, z: 90, queue: true });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    ticks(world, ENGINEER_TICKS);
    const [eng] = engineers(world);
    expect(eng.orders).toEqual([
      { type: 'move', x: 70, z: 90 },
      { type: 'move', x: 50, z: 90 },
    ]);
    ticks(world, 200);
    expect(eng.x).toBe(50);
    expect(eng.z).toBe(90);
  });

  it('ny waypoint utan Shift ersätter de gamla', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'setRally', ids: [factory.id], x: 70, z: 90 });
    cmd(world, { type: 'setRally', ids: [factory.id], x: 50, z: 90 });
    ticks(world, 1);
    expect(factory.rallyPoints).toEqual([{ x: 50, z: 90 }]);
  });

  it('påverkar inte enheter eller andra byggnader', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'setRally', ids: [acu.id, world.coreId], x: 70, z: 90 });
    ticks(world, 1);
    expect(getEntity(world, world.coreId).rallyPoints).toBeNull();
    expect(acu.orders).toEqual([]);
  });
});

describe('repetera produktion', () => {
  it('lägger färdiga enheter sist i kön igen', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'setRepeat', ids: [factory.id], value: true });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    ticks(world, ENGINEER_TICKS * 3);
    expect(engineers(world)).toHaveLength(3);
    expect(factory.productionQueue).toEqual(['engineer']);
  });

  it('utan repetering tar kön slut', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    ticks(world, ENGINEER_TICKS * 3);
    expect(engineers(world)).toHaveLength(1);
    expect(factory.productionQueue).toEqual([]);
  });
});

describe('assistera en annan enhet', () => {
  it('en ingenjör som assisterar fabriken gör produktionen snabbare', () => {
    const { world, factory } = setup();
    const eng = addUnit(world, 'engineer', { x: 64, z: 81, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: factory.id });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer' });
    const faster = Math.ceil(units.engineer.buildTime / (FACTORY_POWER + units.engineer.buildPower) * 10);
    ticks(world, faster);
    expect(engineers(world)).toHaveLength(2);
    expect(faster).toBeLessThan(ENGINEER_TICKS);
  });

  it('en ingenjör som assisterar ACU:n gör ACU:ns bygge snabbare', () => {
    const { world, acu } = setup();
    const eng = addUnit(world, 'engineer', { x: 62, z: 70, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: acu.id });
    cmd(world, { type: 'build', ids: [acu.id], structure: 'pointDefense', x: 60.5, z: 69.5 });
    const together = Math.ceil(structures.pointDefense.buildTime / (units.acu.buildPower + units.engineer.buildPower) * 10);
    ticks(world, together + 2);
    expect(world.entities.find((e) => e.type === 'pointDefense').built).toBe(true);
    // Assisten väntar kvar på nästa jobb.
    expect(eng.orders[0]).toMatchObject({ type: 'guard', targetId: acu.id });
  });

  it('assisten följer efter när ACU:n går', () => {
    const { world, acu } = setup();
    const eng = addUnit(world, 'engineer', { x: 62, z: 70, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: acu.id });
    cmd(world, { type: 'move', ids: [acu.id], x: 30, z: 69 });
    ticks(world, 200);
    expect(acu.x).toBe(30);
    expect(Math.hypot(eng.x - acu.x, eng.z - acu.z)).toBeLessThan(units.engineer.buildRange + acu.radius + 1.01);
  });

  it('assisten släpper ordern om den assisterade försvinner', () => {
    const { world, factory } = setup();
    const eng = addUnit(world, 'engineer', { x: 64, z: 81, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: factory.id });
    ticks(world, 2);
    cmd(world, { type: 'sell', ids: [factory.id] });
    ticks(world, 2);
    expect(eng.orders).toEqual([]);
  });

  it('en enhet kan inte assistera sig själv', () => {
    const { world, acu } = setup();
    cmd(world, { type: 'assist', ids: [acu.id], targetId: acu.id });
    ticks(world, 1);
    expect(acu.orders).toEqual([]);
  });
});

describe('kö i fabriken', () => {
  it('köar 5 åt gången (Ctrl+klick)', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'striker', count: 5 });
    ticks(world, 1);
    expect(factory.productionQueue).toEqual(Array(5).fill('striker'));
  });

  it('en köad enhet kan tas bort utan återbetalning', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer', count: 3 });
    ticks(world, 1);
    const mass = world.players[PLAYER_ID].economy.mass.stored;
    cmd(world, { type: 'cancelProduce', id: factory.id, index: 2 });
    ticks(world, 1);
    expect(factory.productionQueue).toHaveLength(2);
    expect(world.players[PLAYER_ID].economy.mass.stored).toBeLessThanOrEqual(mass);
  });

  it('att avbryta enheten som byggs ger tillbaka det den kostat hittills', () => {
    const { world, factory } = setup();
    const economy = world.players[PLAYER_ID].economy;
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer', count: 2 });
    ticks(world, Math.round(ENGINEER_TICKS / 2));
    expect(factory.productionProgress).toBeCloseTo(0.5, 1);
    economy.mass.stored = 100;
    const progress = factory.productionProgress;
    cmd(world, { type: 'cancelProduce', id: factory.id, index: 0 });
    ticks(world, 1);
    expect(factory.productionQueue).toEqual(['engineer']);
    expect(economy.mass.stored).toBeGreaterThanOrEqual(100 + units.engineer.cost.mass * progress - 1);
  });
});
