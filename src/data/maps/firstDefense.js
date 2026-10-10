/**
 * Första kartan. Alla positioner är i världskoordinater (rutor), origo i nordvästra hörnet.
 */
export default {
  id: 'firstDefense',
  name: 'First Defense',
  description: 'Three attack routes from west, north and east.',
  size: 128,
  seed: 1337,
  terrain: {
    hillHeight: 10,
    plateau: { radius: 18, blend: 10, height: 5 },
  },
  core: { x: 64, z: 64 },
  spawns: [
    { x: 4, z: 64 },
    { x: 64, z: 4 },
    { x: 124, z: 64 },
  ],
  massDeposits: [
    // På basplatån
    { x: 56, z: 56 },
    { x: 72, z: 56 },
    { x: 56, z: 72 },
    { x: 72, z: 72 },
    // Expansioner utanför
    { x: 30, z: 30 },
    { x: 98, z: 30 },
    { x: 30, z: 98 },
    { x: 98, z: 98 },
  ],
};
