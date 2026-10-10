/**
 * Andra kartan: fyra spawnpunkter i hörnen och fler fyndigheter ute på kartan.
 * Alla positioner är i världskoordinater (rutor), origo i nordvästra hörnet.
 */
export default {
  id: 'crossroads',
  name: 'Crossroads',
  description: 'Four attack routes from the corners. More mass out in the open.',
  size: 128,
  seed: 4242,
  terrain: {
    hillHeight: 8,
    plateau: { radius: 16, blend: 10, height: 4 },
  },
  core: { x: 64, z: 64 },
  spawns: [
    { x: 8, z: 8 },
    { x: 120, z: 8 },
    { x: 8, z: 120 },
    { x: 120, z: 120 },
  ],
  massDeposits: [
    // På basplatån
    { x: 58, z: 56 },
    { x: 70, z: 56 },
    { x: 58, z: 72 },
    { x: 70, z: 72 },
    // Längs vägarna mot hörnen
    { x: 40, z: 64 },
    { x: 88, z: 64 },
    { x: 64, z: 40 },
    { x: 64, z: 88 },
    { x: 34, z: 34 },
    { x: 94, z: 94 },
  ],
};
