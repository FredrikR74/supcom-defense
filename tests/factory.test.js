import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
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

  it('stridsenheter kan assistera och följer den assisterade', () => {
    const { world, acu } = setup();
    const tank = addUnit(world, 'striker', { x: 66, z: 72, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [tank.id], targetId: acu.id });
    cmd(world, { type: 'move', ids: [acu.id], x: 30, z: 69 });
    ticks(world, 200);
    expect(tank.orders[0]).toMatchObject({ type: 'guard', targetId: acu.id });
    expect(Math.hypot(tank.x - acu.x, tank.z - acu.z)).toBeLessThan(acu.radius + 2.5);
  });

  it('en assisterande stridsenhet anfaller fiender som kommer nära den assisterade', () => {
    const { world, acu } = setup();
    acu.orders.length = 0;
    const tank = addUnit(world, 'striker', { x: 64, z: 60, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [tank.id], targetId: acu.id });
    // Utom stridsvagnens räckvidd men nära ACU:n.
    const m = addUnit(world, 'mantis', { x: acu.x + 8, z: acu.z + 6, owner: ENEMY_ID });
    m.orders.length = 0;
    m.hp = 1e6;
    let shotAt = false;
    for (let i = 0; i < 60; i++) {
      tickWorld(world);
      if (tank.targetId === m.id) shotAt = true;
    }
    expect(shotAt).toBe(true);
    expect(tank.orders[0].type).toBe('guard');
  });

  it('en assisterande ingenjör reparerar den assisterade när den är skadad', () => {
    const { world } = setup();
    const tank = addUnit(world, 'striker', { x: 50, z: 70, owner: PLAYER_ID });
    tank.hp = 100;
    const eng = addUnit(world, 'engineer', { x: 52, z: 70, owner: PLAYER_ID });
    cmd(world, { type: 'assist', ids: [eng.id], targetId: tank.id });
    // Reparation går i byggtakt: 2/3 av HP:n tar 2/3 av byggtiden för ingenjören.
    ticks(world, Math.ceil(units.striker.buildTime / units.engineer.buildPower * (2 / 3) * 10) + 20);
    expect(tank.hp).toBe(tank.maxHp);
    expect(eng.orders[0]).toMatchObject({ type: 'guard', targetId: tank.id });
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

describe('kö i fabriken: ta bort flera', () => {
  it('tar bort upp till count av samma typ från index', () => {
    const { world, factory } = setup();
    cmd(world, { type: 'produce', id: factory.id, unit: 'striker', count: 3 });
    cmd(world, { type: 'produce', id: factory.id, unit: 'engineer', count: 2 });
    ticks(world, 1);
    cmd(world, { type: 'cancelProduce', id: factory.id, index: 1, count: 5 });
    ticks(world, 1);
    expect(factory.productionQueue).toEqual(['striker', 'engineer', 'engineer']);
  });
});

describe('alla UEF T1-landenheter', () => {
  it.each(['engineer', 'snoop', 'mechMarine', 'striker', 'lobo', 'archer'])('Land Factory kan producera %s', (type) => {
    const { world, factory } = setup();
    world.players[PLAYER_ID].economy.mass.stored = 5000;
    world.players[PLAYER_ID].economy.energy.stored = 50000;
    cmd(world, { type: 'produce', id: factory.id, unit: type });
    ticks(world, Math.ceil(units[type].buildTime / FACTORY_POWER * 10) + 2);
    expect(world.entities.some((e) => e.type === type && e.owner === PLAYER_ID)).toBe(true);
  });
});
