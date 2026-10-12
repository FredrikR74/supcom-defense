import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { addUnit, getEntity } from '../src/sim/entities.js';
import { cellIndex, isBlockedCell } from '../src/sim/pathing.js';
import { spawnSquad, formationSlots } from '../src/sim/squads.js';
import { projectileSystem } from '../src/sim/systems/combat.js';
import firstDefense from '../src/data/maps/firstDefense.js';
import maps from '../src/data/maps/index.js';

/** Ingen director-våg som stör testerna. */
const world = (map = firstDefense) => createWorld({ map, config: { difficulty: 0 } });
const seconds = (w, s, each) => {
  for (let i = 0; i < s * 10; i++) {
    tickWorld(w);
    each?.();
  }
};
const members = (w, squad) => squad.members.map((m) => getEntity(w, m.id)).filter(Boolean);
const flowDist = (w, x, z) => w.flow.dist[cellIndex(w, x, z)];

/** Utbredning tvärs över respektive längs med truppens färdriktning. */
function spread(w, squad) {
  const fx = Math.sin(squad.heading);
  const fz = Math.cos(squad.heading);
  const lat = [];
  const fwd = [];
  for (const e of members(w, squad)) {
    lat.push((e.x - squad.x) * fz - (e.z - squad.z) * fx);
    fwd.push((e.x - squad.x) * fx + (e.z - squad.z) * fz);
  }
  return {
    width: Math.max(...lat) - Math.min(...lat),
    depth: Math.max(...fwd) - Math.min(...fwd),
  };
}

describe('formation', () => {
  it('är bredare än djup och centrerad kring ankaret', () => {
    const slots = formationSlots(10);
    expect(slots).toHaveLength(10);
    const lat = slots.map((s) => s.lateral);
    const fwd = slots.map((s) => s.forward);
    expect(Math.max(...lat) - Math.min(...lat)).toBeGreaterThan(Math.max(...fwd) - Math.min(...fwd));
    expect(lat.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    expect(fwd.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    expect(formationSlots(1)).toEqual([{ lateral: 0, forward: 0 }]);
  });

  it('kortast räckvidd står längst fram', () => {
    const w = world();
    const squad = spawnSquad(w, ['medusa', 'mantis', 'medusa', 'mantis', 'medusa', 'mantis', 'medusa', 'mantis', 'medusa', 'mantis'], 0);
    const front = squad.members.filter((m) => m.slot.forward > 0).map((m) => getEntity(w, m.id).type);
    expect(front).toEqual(Array(5).fill('mantis'));
  });
});

describe('trupper', () => {
  it('spawnar samlade, väntar och marscherar sedan i formation, inte på rad', () => {
    const w = world();
    const squad = spawnSquad(w, Array(12).fill('mantis'), 0);
    const start = flowDist(w, squad.x, squad.z);
    expect(members(w, squad)).toHaveLength(12);
    seconds(w, 2);
    expect(squad.state).toBe('muster');
    seconds(w, 12);
    expect(squad.state).toBe('march');
    expect(flowDist(w, squad.x, squad.z)).toBeLessThan(start - 20);
    const { width, depth } = spread(w, squad);
    expect(width).toBeGreaterThan(5);
    expect(width).toBeGreaterThan(depth);
  });

  it('går i den långsammaste medlemmens takt och håller ihop', () => {
    const w = world();
    const squad = spawnSquad(w, ['mole', 'mole', 'mantis', 'medusa'], 0);
    seconds(w, 15);
    for (const e of members(w, squad)) {
      expect(Math.hypot(e.x - squad.x, e.z - squad.z)).toBeLessThan(6);
    }
  });

  it('kommer fram till kärnan och skjuter på den', () => {
    const w = world();
    const squad = spawnSquad(w, Array(8).fill('mantis'), 0);
    seconds(w, 60, () => {
      for (const e of members(w, squad)) expect(isBlockedCell(w, cellIndex(w, e.x, e.z))).toBe(false);
    });
    expect(members(w, squad).some((e) => e.targetId === w.coreId)).toBe(true);
  });

  it('pressar ihop sig genom trånga pass och går aldrig in i branter', () => {
    const map = maps.find((m) => m.id === 'mountainPass');
    const w = world(map);
    w.entities = w.entities.filter((e) => e.id === w.coreId);
    w.byId = new Map(w.entities.map((e) => [e.id, e]));
    const squads = map.spawns.map((_, i) => spawnSquad(w, Array(16).fill('mantis'), i));
    const start = squads.map((s) => flowDist(w, s.x, s.z));
    seconds(w, 90, () => {
      for (const s of squads) {
        for (const e of members(w, s)) expect(isBlockedCell(w, cellIndex(w, e.x, e.z))).toBe(false);
      }
    });
    squads.forEach((s, i) => expect(flowDist(w, s.x, s.z)).toBeLessThan(start[i] / 2));
  }, 30000);

  it('strider tillsammans och formerar sig igen efteråt', () => {
    const w = world();
    const squad = spawnSquad(w, Array(6).fill('mantis'), 0);
    seconds(w, 6);
    // En spelarenhet en bit fram längs vägen.
    const ahead = { x: squad.x + Math.sin(squad.heading) * 14, z: squad.z + Math.cos(squad.heading) * 14 };
    const victim = addUnit(w, 'striker', { ...ahead, owner: PLAYER_ID });
    let engaged = false;
    let killedAt = null;
    let marchedAfter = false;
    seconds(w, 20, () => {
      if (squad.state === 'engaged') engaged = true;
      if (killedAt == null && !getEntity(w, victim.id)) killedAt = w.tick;
      if (killedAt != null && squad.state === 'march' && w.tick - killedAt < 50) marchedAfter = true;
    });
    expect(engaged).toBe(true);
    expect(killedAt).not.toBeNull();
    expect(marchedAfter).toBe(true);
  });

  it('försvinner när alla medlemmar är döda', () => {
    const w = world();
    const squad = spawnSquad(w, ['mantis', 'mantis'], 0);
    for (const e of members(w, squad)) e.hp = 0;
    seconds(w, 0.2);
    expect(w.squads).not.toContain(squad);
  });

  it('är deterministiska', () => {
    const run = () => {
      const w = world();
      spawnSquad(w, Array(10).fill('mantis'), 1);
      seconds(w, 20);
      return w.entities.filter((e) => e.owner === ENEMY_ID).map((e) => [e.x, e.z]);
    };
    expect(run()).toEqual(run());
  });
});

describe('spawnsköld', () => {
  it('nya fiender tar ingen skada medan skölden är uppe, men väl efteråt', () => {
    const w = world();
    const squad = spawnSquad(w, ['mantis'], 0);
    const m = members(w, squad)[0];
    expect(m.shieldUntil).toBe(w.tick + 40); // 4 s
    const shoot = () => {
      w.projectiles.push({ x: m.x, z: m.z, tx: m.x, tz: m.z, owner: PLAYER_ID, sourceId: null, speed: 10, damage: 50, damageRadius: 0, y: 1 });
      projectileSystem(w);
    };
    shoot();
    expect(m.hp).toBe(m.maxHp);
    w.tick = m.shieldUntil;
    shoot();
    expect(m.hp).toBe(m.maxHp - 50);
  });
});
