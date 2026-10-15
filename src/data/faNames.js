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
  { name: 'Mass Storage', faction: 'UEF', tech: 1, verified: true },
  { name: 'Energy Storage', faction: 'UEF', tech: 1, verified: true },
  { name: 'Wall Section', faction: 'UEF', tech: 1, verified: true },
  { name: 'Point Defense', unitName: 'DM1 Plasma Cannon', faction: 'UEF', tech: 1, verified: true },
  { name: 'Quantum Gateway', faction: 'UEF', tech: 3, verified: true },
  // UEF T2 och T3 (namnen från FAF:s blueprints)
  { name: 'Land Factory HQ', faction: 'UEF', tech: 2, verified: true },
  { name: 'Engineer', faction: 'UEF', tech: 2, verified: true },
  { name: 'Heavy Tank', unitName: 'Pillar', faction: 'UEF', tech: 2, verified: true },
  { name: 'Gatling Bot', unitName: 'Mongoose', faction: 'UEF', tech: 2, verified: true },
  { name: 'Amphibious Tank', unitName: 'Riptide', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mobile Missile Launcher', unitName: 'Flapjack', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mobile AA Flak Artillery', unitName: 'Sky Boxer', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mobile Shield Generator', unitName: 'Parashield', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mass Extractor', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mass Extractor', faction: 'UEF', tech: 3, verified: true },
  { name: 'Power Generator', unitName: 'EG - 200 Fusion Reactor', faction: 'UEF', tech: 2, verified: true },
  { name: 'Mass Fabricator', faction: 'UEF', tech: 2, verified: true },
  { name: 'Point Defense', unitName: 'Triad', faction: 'UEF', tech: 2, verified: true },
  { name: 'Artillery Installation', unitName: 'Klink Hammer', faction: 'UEF', tech: 2, verified: true },
  { name: 'Shield Generator', unitName: 'SD - Pulse', faction: 'UEF', tech: 2, verified: true },
  { name: 'Radar System', unitName: 'SA1 - 1000', faction: 'UEF', tech: 1, verified: true },
  { name: 'Radar System', unitName: 'SA2 - 2000', faction: 'UEF', tech: 2, verified: true },
  // UEF ACU:ns uppgraderingar (Enhancements i UEL0001_unit.bp)
  { name: 'Zephyr Amplifier', faction: 'UEF', verified: true },
  { name: 'Nano-Repair System', faction: 'UEF', verified: true },
  { name: 'Resource Allocation System', faction: 'UEF', verified: true },

  // Cybran (fienderna)
  { name: 'Assault Bot', unitName: 'Mantis', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Land Scout', unitName: 'Mole', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Mobile Light Artillery', unitName: 'Medusa', faction: 'Cybran', tech: 1, verified: true },
  { name: 'Light Assault Bot', unitName: 'Hunter', faction: 'Cybran', tech: 1, verified: false },
  { name: 'Heavy Tank', unitName: 'Rhino', faction: 'Cybran', tech: 2, verified: true },
  { name: 'Rocket Bot', unitName: 'Hoplite', faction: 'Cybran', tech: 2, verified: true },
  { name: 'Amphibious Tank', unitName: 'Wagner', faction: 'Cybran', tech: 2, verified: true },
  { name: 'Mobile Missile Launcher', unitName: 'Viper', faction: 'Cybran', tech: 2, verified: true },
];
