/**
 * Tredje kartan, större: basen ligger i en dal omgiven av berg, med en enda
 * passage i söder. Fienderna kommer från norr och måste gå runt bergen och in
 * genom passagen. Alla positioner är i världskoordinater (rutor), origo i
 * nordvästra hörnet.
 */
export default {
  id: 'mountainPass',
  name: 'Mountain Pass',
  description: 'A valley ringed by mountains. The only way in is the pass to the south.',
  size: 192,
  seed: 9001,
  terrain: {
    hillHeight: 5,
    plateau: { radius: 16, blend: 10, height: 4 },
    mountainHeight: 15,
    /** Bergsringen runt basen (mitt i kärnan) med en passage rakt söderut. */
    ring: { radius: 46, width: 26, gaps: [{ angle: 0, width: 14 }] },
    /** Fristående berg ute på kartan. */
    peaks: [
      { x: 18, z: 112, radius: 12 },
      { x: 174, z: 112, radius: 13 },
      { x: 56, z: 176, radius: 11 },
      { x: 142, z: 178, radius: 11 },
      { x: 96, z: 22, radius: 10 },
    ],
  },
  core: { x: 96, z: 96 },
  spawns: [
    { x: 14, z: 14 },
    { x: 178, z: 14 },
    { x: 60, z: 6 },
    { x: 132, z: 6 },
  ],
  massDeposits: [
    // I dalen runt basen
    { x: 88, z: 88 },
    { x: 104, z: 88 },
    { x: 88, z: 104 },
    { x: 104, z: 104 },
    { x: 70, z: 96 },
    { x: 122, z: 96 },
    { x: 96, z: 120 },
    // Utanför bergen
    { x: 96, z: 162 },
    { x: 34, z: 150 },
    { x: 158, z: 150 },
    { x: 30, z: 60 },
    { x: 162, z: 60 },
  ],
};
