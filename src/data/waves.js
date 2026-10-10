/**
 * Vågor för kartan. Varje våg är en lista grupper:
 * - `type`: fiendetyp i data/units.js
 * - `count`: antal
 * - `interval`: sekunder mellan varje fiende i gruppen
 * - `delay`: sekunder efter vågens start innan gruppen börjar (standard 0)
 * - `spawn`: spawnpunktens index, eller 'all' för att turas om mellan alla
 * `bonus` är mass man får när vågen är besegrad.
 */
export default [
  { bonus: 50, groups: [{ type: 'mantis', count: 4, interval: 2, spawn: 0 }] },
  { bonus: 60, groups: [{ type: 'mantis', count: 6, interval: 1.5, spawn: 'all' }] },
  { bonus: 70, groups: [
    { type: 'mole', count: 6, interval: 0.5, spawn: 1 },
    { type: 'mantis', count: 6, interval: 1.5, spawn: 'all', delay: 4 },
  ] },
  { bonus: 80, groups: [
    { type: 'mantis', count: 8, interval: 1, spawn: 0 },
    { type: 'medusa', count: 1, interval: 0, spawn: 0, delay: 6 },
  ] },
  { bonus: 90, groups: [
    { type: 'mantis', count: 10, interval: 1, spawn: 'all' },
    { type: 'mole', count: 8, interval: 0.4, spawn: 2, delay: 3 },
  ] },
  { bonus: 100, groups: [
    { type: 'mantis', count: 12, interval: 0.8, spawn: 'all' },
    { type: 'medusa', count: 2, interval: 3, spawn: 'all', delay: 8 },
  ] },
  { bonus: 120, groups: [
    { type: 'mole', count: 12, interval: 0.3, spawn: 'all' },
    { type: 'mantis', count: 14, interval: 0.8, spawn: 'all', delay: 5 },
  ] },
  { bonus: 140, groups: [
    { type: 'mantis', count: 16, interval: 0.6, spawn: 1 },
    { type: 'medusa', count: 3, interval: 2, spawn: 1, delay: 10 },
  ] },
  { bonus: 160, groups: [
    { type: 'mantis', count: 20, interval: 0.5, spawn: 'all' },
    { type: 'medusa', count: 4, interval: 2, spawn: 'all', delay: 8 },
    { type: 'mole', count: 10, interval: 0.3, spawn: 'all', delay: 2 },
  ] },
  { bonus: 200, groups: [
    { type: 'mantis', count: 30, interval: 0.4, spawn: 'all' },
    { type: 'medusa', count: 6, interval: 1.5, spawn: 'all', delay: 6 },
    { type: 'mole', count: 15, interval: 0.2, spawn: 'all', delay: 10 },
  ] },
];
