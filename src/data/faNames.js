/**
 * Godkända namn från Supreme Commander: Forged Alliance. Allt i data/ ska ha
 * ett `name` (FA:s beskrivning, t.ex. "Point Defense") och kan ha ett `unitName`
 * (FA:s egennamn, t.ex. "DM1 Plasma Cannon") som finns här.
 *
 * `verified`: kontrollerat mot en FA-källa (supcom.fandom.com eller FAF:s
 * enhetsdatabas). Overifierade namn ska kontrolleras innan de används.
 */
export default [
  // UEF (spelaren)
  { name: 'Armored Command Unit', faction: 'UEF', tech: 1, verified: true },
  { name: 'Engineer', faction: 'UEF', tech: 1, verified: true },
  { name: 'Land Factory', faction: 'UEF', tech: 1, verified: true },
  { name: 'Medium Tank', unitName: 'MA12 Striker', faction: 'UEF', tech: 1, verified: true },
  { name: 'Land Scout', unitName: 'Snoop', faction: 'UEF', tech: 1, verified: true },
  { name: 'Light Assault Bot', unitName: 'Mech Marine', faction: 'UEF', tech: 1, verified: true },
  { name: 'Mobile Light Artillery', unitName: 'Lobo', faction: 'UEF', tech: 1, verified: true },
  { name: 'Mobile Anti-Air Gun', unitName: 'Archer', faction: 'UEF', tech: 1, verified: true },
  { name: 'Mass Extractor', faction: 'UEF', tech: 1, verified: true },
  { name: 'Power Generator', faction: 'UEF', tech: 1, verified: true },
  { name: 'Wall Section', faction: 'UEF', tech: 1, verified: true },
  { name: 'Point Defense', unitName: 'DM1 Plasma Cannon', faction: 'UEF', tech: 1, verified: true },
  { name: 'Quantum Gateway', faction: 'UEF', tech: 3, verified: true },

  // Cybran (fienderna)
  { name: 'Assault Bot', unitName: 'Mantis', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Land Scout', unitName: 'Mole', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Mobile Light Artillery', unitName: 'Medusa', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Light Assault Bot', unitName: 'Hunter', faction: 'Cybran', tech: 1, verified: false },
];
