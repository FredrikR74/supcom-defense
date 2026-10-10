import { describe, it, expect } from 'vitest';
import faNames from '../src/data/faNames.js';
import structures from '../src/data/structures.js';
import units from '../src/data/units.js';

const approved = (name, unitName) =>
  faNames.some((n) => n.name === name && (unitName === undefined || n.unitName === unitName));

describe('bara riktiga FA-namn', () => {
  const all = [
    ...Object.entries(structures).map(([key, def]) => ['structures', key, def]),
    ...Object.entries(units).map(([key, def]) => ['units', key, def]),
  ];

  it.each(all)('%s.%s har ett godkänt FA-namn', (_file, _key, def) => {
    expect(approved(def.name, def.unitName), `${def.name} / ${def.unitName ?? '-'}`).toBe(true);
  });

  it('allt som används i data/ är verifierat', () => {
    for (const [, , def] of all) {
      const entry = faNames.find((n) => n.name === def.name && (def.unitName === undefined || n.unitName === def.unitName));
      expect(entry.verified, def.name).toBe(true);
    }
  });
});
