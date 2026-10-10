import { describe, it, expect } from 'vitest';
import { createEconomy, stepEconomy } from '../src/sim/economy.js';

const DT = 0.1;

function economy(stored = { mass: 0, energy: 0 }, max = { mass: 1000, energy: 1000 }) {
  return createEconomy({ stored, max });
}

describe('createEconomy', () => {
  it('sätter startkapital och maxlager', () => {
    const e = economy({ mass: 500, energy: 2000 }, { mass: 1000, energy: 5000 });
    expect(e.mass.stored).toBe(500);
    expect(e.energy.stored).toBe(2000);
    expect(e.energy.max).toBe(5000);
    expect(e.efficiency).toBe(1);
  });

  it('klämmer startkapital mot maxlagret', () => {
    const e = economy({ mass: 5000, energy: 0 }, { mass: 1000, energy: 1000 });
    expect(e.mass.stored).toBe(1000);
  });
});

describe('stepEconomy', () => {
  it('inkomst 10 per sekund ger +1 per tick', () => {
    const e = economy();
    stepEconomy(e, [{ mass: 10, energy: 0 }], [], DT);
    expect(e.mass.stored).toBeCloseTo(1);
    expect(e.mass.income).toBe(10);
  });

  it('summerar flera producenter', () => {
    const e = economy();
    stepEconomy(e, [{ mass: 1, energy: 10 }, { mass: 2, energy: 0 }], [], DT);
    expect(e.mass.stored).toBeCloseTo(0.3);
    expect(e.energy.stored).toBeCloseTo(1);
  });

  it('fyller inte över maxlagret', () => {
    const e = economy({ mass: 999.5, energy: 0 });
    stepEconomy(e, [{ mass: 10, energy: 0 }], [], DT);
    expect(e.mass.stored).toBe(1000);
  });

  it('full effektivitet när lagret räcker', () => {
    const e = economy({ mass: 100, energy: 100 });
    const consumer = { demand: { mass: 10, energy: 0 } };
    stepEconomy(e, [], [consumer], DT);
    expect(consumer.efficiency).toBe(1);
    expect(e.mass.stored).toBeCloseTo(99);
    expect(e.mass.spent).toBe(10);
  });

  it('inkomst 5 och utgift 10 med tomt lager ger effektiviteten 0,5', () => {
    const e = economy();
    const consumer = { demand: { mass: 10, energy: 0 } };
    stepEconomy(e, [{ mass: 5, energy: 0 }], [consumer], DT);
    expect(consumer.efficiency).toBeCloseTo(0.5);
    expect(e.efficiency).toBeCloseTo(0.5);
    expect(e.mass.spent).toBeCloseTo(5);
    expect(e.mass.stored).toBeCloseTo(0);
  });

  it('den bristfälligaste resursen styr effektiviteten', () => {
    const e = economy({ mass: 100, energy: 0 });
    const consumer = { demand: { mass: 10, energy: 20 } };
    stepEconomy(e, [{ mass: 0, energy: 5 }], [consumer], DT);
    expect(consumer.efficiency).toBeCloseTo(0.25);
    // Massan dras också bara med 25 %.
    expect(e.mass.spent).toBeCloseTo(2.5);
    expect(e.mass.stored).toBeCloseTo(99.75);
  });

  it('alla förbrukare saktar ner lika mycket', () => {
    const e = economy();
    const a = { demand: { mass: 6, energy: 0 } };
    const b = { demand: { mass: 4, energy: 0 } };
    stepEconomy(e, [{ mass: 5, energy: 0 }], [a, b], DT);
    expect(a.efficiency).toBeCloseTo(0.5);
    expect(b.efficiency).toBeCloseTo(0.5);
  });

  it('lagret räknas in i det tillgängliga', () => {
    const e = economy({ mass: 0.5, energy: 0 });
    const consumer = { demand: { mass: 10, energy: 0 } };
    stepEconomy(e, [{ mass: 5, energy: 0 }], [consumer], DT);
    // Tillgängligt: 0,5 + 0,5 = 1,0 av önskat 1,0.
    expect(consumer.efficiency).toBeCloseTo(1);
  });
});
