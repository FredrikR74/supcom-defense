import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { addUnit, getEntity, weaponOf } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { applyEnhancement, hasEnhancement } from '../src/sim/enhancements.js';
import { addVetLevel, regenRate } from '../src/sim/veterancy.js';
import enhancements from '../src/data/enhancements.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };

/** En värld med gott om resurser, så att uppgraderingar går i full fart. */
function setup() {
  const world = createWorld({ map: firstDefense });
  const economy = world.players[PLAYER_ID].economy;
  for (const r of ['mass', 'energy']) {
    economy[r].max = 1e7;
    economy[r].stored = 1e7;
  }
  return { world, acu: getEntity(world, world.acuId), economy };
}

const enhance = (world, ids, enhancement, queue = false) =>
  queueCommand(world, { type: 'enhance', owner: PLAYER_ID, ids, enhancement, queue });

/** Antal tick för en uppgradering med byggkraften `power` vid full ekonomi. */
const enhanceTicks = (key, power) => Math.round(enhancements[key].buildTime / power * 10);

describe('ACU-uppgraderingar', () => {
  it('Zephyr Amplifier tar buildTime / byggkraft och ger +100 skada och räckvidd 15', () => {
    const { world, acu } = setup();
    enhance(world, [acu.id], 'zephyrAmplifier');
    const n = enhanceTicks('zephyrAmplifier', units.acu.buildPower);
    ticks(world, n - 2);
    expect(hasEnhancement(acu, 'zephyrAmplifier')).toBe(false);
    ticks(world, 3);
    expect(hasEnhancement(acu, 'zephyrAmplifier')).toBe(true);
    expect(weaponOf(acu).damage).toBe(units.acu.weapon.damage + 100);
    expect(weaponOf(acu).range).toBe(15);
    expect(units.acu.weapon.range).toBe(11); // grunddatan är orörd
    expect(world.events.some((e) => e.type === 'enhanced' && e.enhancement === 'zephyrAmplifier')).toBe(true);
  });

  it('kostar uppgraderingens mass och energi under byggtiden', () => {
    const { world, acu, economy } = setup();
    ticks(world, 1);
    enhance(world, [acu.id], 'zephyrAmplifier');
    ticks(world, 1);
    const { cost, buildTime } = enhancements.zephyrAmplifier;
    const rate = units.acu.buildPower / buildTime;
    expect(economy.mass.spent).toBeCloseTo(cost.mass * rate);
    expect(economy.energy.spent).toBeCloseTo(cost.energy * rate);
  });

  it('Nano-Repair System ger +1500 max-HP (och lika mycket HP) och +40 regen', () => {
    const { acu } = setup();
    acu.hp = 5000;
    applyEnhancement(acu, 'nanoRepair');
    expect(acu.maxHp).toBe(units.acu.maxHp + 1500);
    expect(acu.hp).toBe(6500);
    expect(regenRate(acu)).toBe(units.acu.regenRate + 40);
    // Veterancy räknar på max-HP med uppgraderingen.
    acu.vetLevel = 0;
    addVetLevel(acu);
    expect(acu.maxHp).toBeCloseTo((units.acu.maxHp + 1500) * 1.1);
  });

  it('Resource Allocation System lägger +14 mass/s och +2500 energi/s på ACU:ns produktion', () => {
    const { world, acu, economy } = setup();
    applyEnhancement(acu, 'resourceAllocation');
    ticks(world, 1);
    expect(acu.production).toEqual({ mass: units.acu.production.mass + 14, energy: units.acu.production.energy + 2500 });
    expect(economy.energy.income).toBeGreaterThanOrEqual(units.acu.production.energy + 2500);
  });

  it('en uppgradering på samma plats ersätter den gamla och tar bort dess effekt', () => {
    const { acu } = setup();
    applyEnhancement(acu, 'zephyrAmplifier');
    applyEnhancement(acu, 'resourceAllocation');
    expect(hasEnhancement(acu, 'zephyrAmplifier')).toBe(false);
    expect(weaponOf(acu)).toEqual(units.acu.weapon);
    // Olika platser går att kombinera.
    applyEnhancement(acu, 'nanoRepair');
    expect(hasEnhancement(acu, 'resourceAllocation')).toBe(true);
    expect(hasEnhancement(acu, 'nanoRepair')).toBe(true);
  });

  it('en ingenjör som assisterar ACU:n gör uppgraderingen snabbare', () => {
    const { world, acu } = setup();
    const eng = addUnit(world, 'engineer', { x: acu.x + 1, z: acu.z, owner: PLAYER_ID });
    enhance(world, [acu.id], 'zephyrAmplifier');
    queueCommand(world, { type: 'assist', owner: PLAYER_ID, ids: [eng.id], targetId: acu.id });
    const n = enhanceTicks('zephyrAmplifier', units.acu.buildPower + units.engineer.buildPower);
    ticks(world, n + 3);
    expect(hasEnhancement(acu, 'zephyrAmplifier')).toBe(true);
  });

  it('en flyttorder avbryter inte uppgraderingen utan väntar tills den är klar', () => {
    const { world, acu } = setup();
    const start = { x: acu.x, z: acu.z };
    enhance(world, [acu.id], 'nanoRepair');
    ticks(world, 100);
    queueCommand(world, { type: 'move', owner: PLAYER_ID, ids: [acu.id], x: acu.x + 2, z: acu.z });
    ticks(world, 10);
    expect(acu.orders.map((o) => o.type)).toEqual(['enhance', 'move']);
    expect(acu.orders[0].progress).toBeGreaterThan(0.1);
    expect({ x: acu.x, z: acu.z }).toEqual(start);
    ticks(world, enhanceTicks('nanoRepair', units.acu.buildPower));
    expect(hasEnhancement(acu, 'nanoRepair')).toBe(true);
    expect(acu.x).toBeCloseTo(start.x + 2);
  });

  it('cancelEnhance avbryter och ger tillbaka det som lagts ner', () => {
    const { world, acu, economy } = setup();
    economy.mass.stored = 5000;
    enhance(world, [acu.id], 'nanoRepair');
    ticks(world, 200);
    const progress = acu.orders[0].progress;
    const before = economy.mass.stored;
    queueCommand(world, { type: 'cancelEnhance', owner: PLAYER_ID, ids: [acu.id], enhancement: 'nanoRepair' });
    ticks(world, 1);
    expect(acu.orders).toHaveLength(0);
    expect(hasEnhancement(acu, 'nanoRepair')).toBe(false);
    // Tillbaka: kostnaden × framsteget (plus ett ticks inkomst).
    expect(economy.mass.stored - before).toBeCloseTo(enhancements.nanoRepair.cost.mass * progress + units.acu.production.mass / 10, 0);
  });

  it('kan inte beställas av enheter utan uppgraderingen eller om den redan finns', () => {
    const { world, acu } = setup();
    const eng = addUnit(world, 'engineer', { x: acu.x + 1, z: acu.z, owner: PLAYER_ID });
    applyEnhancement(acu, 'zephyrAmplifier');
    enhance(world, [acu.id, eng.id], 'zephyrAmplifier');
    ticks(world, 1);
    expect(acu.orders).toHaveLength(0);
    expect(eng.orders).toHaveLength(0);
  });

  it('försvinner när ACU:n dör och återuppstår', () => {
    const { world, acu } = setup();
    applyEnhancement(acu, 'zephyrAmplifier');
    acu.hp = 0;
    ticks(world, (world.config.acuRespawnSeconds + 1) * 10);
    const next = getEntity(world, world.acuId);
    expect(next.id).not.toBe(acu.id);
    expect(hasEnhancement(next, 'zephyrAmplifier')).toBe(false);
    expect(weaponOf(next).damage).toBe(units.acu.weapon.damage);
  });
});
