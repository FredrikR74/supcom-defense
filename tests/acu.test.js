import { describe, it, expect } from 'vitest';
import { createWorld, tickWorld, PLAYER_ID } from '../src/sim/world.js';
import { getEntity } from '../src/sim/entities.js';
import { acuRespawnIn } from '../src/sim/acu.js';
import gameConfig from '../src/data/gameConfig.js';
import units from '../src/data/units.js';
import firstDefense from '../src/data/maps/firstDefense.js';

const ticks = (w, n) => { for (let i = 0; i < n; i++) tickWorld(w); };

describe('ACU-död och återuppståndelse', () => {
  it('återuppstår vid kärnan efter acuRespawnSeconds med full HP och utan veterancy', () => {
    const w = createWorld({ map: firstDefense });
    const first = getEntity(w, w.acuId);
    first.vetLevel = 2;
    first.hp = 0;
    ticks(w, 2);
    expect(getEntity(w, first.id)).toBeNull();
    expect(w.events.some((e) => e.type === 'acuDeath')).toBe(true);
    expect(acuRespawnIn(w)).toBeGreaterThan(gameConfig.acuRespawnSeconds - 1);

    ticks(w, gameConfig.acuRespawnSeconds * 10);
    const acu = getEntity(w, w.acuId);
    expect(acu).not.toBeNull();
    expect(acu.id).not.toBe(first.id);
    expect(acu.hp).toBe(units.acu.maxHp);
    expect(acu.vetLevel ?? 0).toBe(0);
    expect(acu.owner).toBe(PLAYER_ID);
    expect(acuRespawnIn(w)).toBeNull();
  });

  it('ingen inkomst från ACU:n medan den är död', () => {
    const w = createWorld({ map: firstDefense });
    getEntity(w, w.acuId).hp = 0;
    ticks(w, 3);
    expect(w.players[PLAYER_ID].economy.energy.income).toBe(0);
  });

  it('återuppstår inte efter förlust', () => {
    const w = createWorld({ map: firstDefense });
    getEntity(w, w.acuId).hp = 0;
    getEntity(w, w.coreId).hp = 0;
    ticks(w, (gameConfig.acuRespawnSeconds + 2) * 10);
    expect(getEntity(w, w.acuId)).toBeNull();
  });
});
