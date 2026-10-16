import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addStructure, addUnit, getEntity } from '../src/sim/entities.js';
import { queueCommand } from '../src/sim/commands.js';
import { INTEL, intelAt } from '../src/sim/intel.js';
import { directorInfo } from '../src/sim/director.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (world, n) => { for (let i = 0; i < n; i++) tickWorld(world); };

/** En värld utan fiendevågor, med gott om resurser. ACU:n flyttas ur vägen. */
function setup() {
  const world = createWorld({ map: firstDefense, config: { director: { graceSeconds: 1e9 } } });
  const economy = world.players[PLAYER_ID].economy;
  for (const r of ['mass', 'energy']) {
    economy[r].max = 1e7;
    economy[r].stored = 1e7;
  }
  return { world, acu: getEntity(world, world.acuId) };
}

/** En fiende som står still (utan order). */
const enemy = (world, type, x, z) => addUnit(world, type, { x, z, owner: ENEMY_ID });

describe('krigsdimma', () => {
  it('en fiende utanför sikt och radar är dold; inom radar en blipp; inom sikt syns den helt', () => {
    const { world, acu } = setup();
    const far = enemy(world, 'mantis', 10, 10);
    const nearAcu = enemy(world, 'mantis', acu.x + units.acu.visionRadius - 2, acu.z);
    ticks(world, 1);
    expect(far.intel).toBe(INTEL.HIDDEN);
    expect(nearAcu.intel).toBe(INTEL.VISIBLE);

    // En radar täcker den avlägsna fienden, men den syns inte.
    addStructure(world, 'radar', { x: 30, z: 40, owner: PLAYER_ID });
    ticks(world, 1);
    expect(far.intel).toBe(INTEL.RADAR);
  });

  it('sikten följer FA:s VisionRadius (halverad)', () => {
    const { world, acu } = setup();
    ticks(world, 1);
    const r = units.acu.visionRadius;
    expect(intelAt(world, acu.x + r - 1, acu.z)).toBe(INTEL.VISIBLE);
    expect(intelAt(world, acu.x + r + 2, acu.z)).not.toBe(INTEL.VISIBLE);
  });

  it('radar utan energi fungerar inte', () => {
    const { world, acu } = setup();
    acu.production = { mass: 0, energy: 0 };
    world.players[PLAYER_ID].economy.energy.stored = 0;
    const far = enemy(world, 'mantis', 10, 10);
    addStructure(world, 'radar', { x: 30, z: 40, owner: PLAYER_ID });
    ticks(world, 3);
    expect(far.intel).toBe(INTEL.HIDDEN);
  });

  it('en ofärdig radar ger ingen radar', () => {
    const { world } = setup();
    const far = enemy(world, 'mantis', 10, 10);
    addStructure(world, 'radar', { x: 30, z: 40, owner: PLAYER_ID, built: false });
    ticks(world, 1);
    expect(far.intel).toBe(INTEL.HIDDEN);
  });

  it('egna vapen väljer inte dolda fiender som mål, men väl dem på radar', () => {
    const { world } = setup();
    // Lobo: räckvidd 15 men sikt 9, som i FA behöver den någon som ser målet.
    const lobo = addUnit(world, 'lobo', { x: 40, z: 40, owner: PLAYER_ID });
    const target = enemy(world, 'mantis', 40, 52);
    ticks(world, 2);
    expect(target.intel).toBe(INTEL.HIDDEN);
    expect(lobo.targetId ?? null).toBeNull();

    addStructure(world, 'radar', { x: 30, z: 30, owner: PLAYER_ID });
    ticks(world, 2);
    expect(target.intel).toBe(INTEL.RADAR);
    expect(lobo.targetId).toBe(target.id);
  });

  it('fienden ser bara det dess enheter ser, men kommer ihåg byggnader', () => {
    const { world } = setup();
    const pd = addStructure(world, 'pointDefense', { x: 40.5, z: 40.5, owner: PLAYER_ID });
    // Medusan når PD:n (räckvidd 15) men ser bara 9 rutor.
    const medusa = enemy(world, 'medusa', 40.5, 40.5 + 14);
    ticks(world, 2);
    expect(pd.enemyIntel).toBe(INTEL.HIDDEN);
    expect(medusa.targetId).toBe(null);

    // En Mantis går fram och ser PD:n; sedan kommer fienden ihåg den.
    const spotter = enemy(world, 'mantis', 40.5, 40.5 + 8);
    ticks(world, 2);
    expect(pd.enemySeen).toBe(true);
    expect(medusa.targetId).toBe(pd.id);
    spotter.hp = 0;
    ticks(world, 2);
    expect(pd.enemyIntel).toBe(INTEL.HIDDEN);
    expect(medusa.targetId).toBe(pd.id);
  });

  it('Molens radar visar spelarens enheter som blippar för fienden', () => {
    const { world, acu } = setup();
    enemy(world, 'mole', acu.x + 18, acu.z);
    ticks(world, 1);
    expect(acu.enemyIntel).toBe(INTEL.RADAR);
  });

  it('räknaren för fiender visar bara dem spelaren känner till', () => {
    const { world, acu } = setup();
    enemy(world, 'mantis', 10, 10);
    enemy(world, 'mantis', acu.x + 3, acu.z);
    ticks(world, 1);
    expect(directorInfo(world).enemies).toBe(1);
  });
});

describe('Radar System', () => {
  it('värden från FAF:s blueprints (UEB3101 och UEB3201), räckvidder halverade', () => {
    expect(structures.radar).toMatchObject({
      radarRadius: 58, visionRadius: 10, maxHp: 10, cost: { mass: 80, energy: 720 }, buildTime: 80,
      upkeep: { energy: 20 }, upgradesTo: 'radarT2',
    });
    expect(structures.radarT2).toMatchObject({
      radarRadius: 100, visionRadius: 12, maxHp: 50, cost: { mass: 180, energy: 3600 }, buildTime: 780,
      upkeep: { energy: 150 },
    });
    expect(units.acu.builds).toContain('radar');
    expect(units.engineer.builds).toContain('radar');
    expect(units.engineerT2.builds).toContain('radarT2');
  });

  it('T1-radarn uppgraderas till T2 och ser längre', () => {
    const { world } = setup();
    const r = addStructure(world, 'radar', { x: 64, z: 80, owner: PLAYER_ID });
    queueCommand(world, { type: 'upgrade', owner: PLAYER_ID, ids: [r.id] });
    ticks(world, Math.ceil((structures.radarT2.buildTime / structures.radar.buildPower) * 10) + 2);
    expect(r.type).toBe('radarT2');
    const target = enemy(world, 'mantis', 64, 80 - 80);
    ticks(world, 1);
    expect(intelAt(world, 64, 1)).toBe(INTEL.RADAR);
    expect(target.intel).not.toBe(INTEL.HIDDEN);
  });
});
