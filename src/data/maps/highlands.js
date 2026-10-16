/**
 * Fjärde kartan, störst: basen ligger i en huvuddal i söder med passagen mot
 * norr. I nordväst och nordost finns sidodalar med rik massa, men var och en
 * har en egen öppning mot norr och blir en ny front att försvara. En bergsrygg
 * delar det norra fältet i två vägar, och framför passagerna ligger vrak från
 * gamla strider att återvinna. Alla positioner är i världskoordinater (rutor),
 * origo i nordvästra hörnet.
 */
export default {
  id: 'highlands',
  name: 'Highlands',
  description: 'A main valley and two rich side valleys, each open to the north. Old battlefields to reclaim.',
  size: 256,
  seed: 4242,
  terrain: {
    hillHeight: 4,
    plateau: { radius: 16, blend: 10, height: 4 },
    mountainHeight: 15,
    /** Huvuddalen runt basen (mitt i kärnan) med passagen rakt norrut. */
    ring: { radius: 44, width: 22, gaps: [{ angle: 180, width: 14 }] },
    /** Sidodalarna, var och en med en öppning mot norr. */
    rings: [
      { x: 50, z: 92, radius: 30, width: 16, gaps: [{ angle: 180, width: 12 }] },
      { x: 206, z: 92, radius: 30, width: 16, gaps: [{ angle: 180, width: 12 }] },
    ],
    /** Bergsryggen som delar det norra fältet i två vägar. */
    ridges: [{ x1: 128, z1: 26, x2: 128, z2: 96, width: 12 }],
    /** Fristående berg i söder. */
    peaks: [
      { x: 28, z: 212, radius: 13 },
      { x: 228, z: 214, radius: 12 },
    ],
  },
  core: { x: 128, z: 185 },
  spawns: [
    { x: 14, z: 10 },
    { x: 128, z: 8 },
    { x: 242, z: 10 },
  ],
  massDeposits: [
    // I huvuddalen runt basen
    { x: 116, z: 176 },
    { x: 140, z: 176 },
    { x: 116, z: 196 },
    { x: 140, z: 196 },
    { x: 104, z: 186 },
    { x: 152, z: 186 },
    // Västra sidodalen
    { x: 42, z: 86 },
    { x: 58, z: 86 },
    { x: 42, z: 100 },
    { x: 58, z: 100 },
    { x: 50, z: 108 },
    // Östra sidodalen
    { x: 198, z: 86 },
    { x: 214, z: 86 },
    { x: 198, z: 100 },
    { x: 214, z: 100 },
    { x: 206, z: 108 },
    // Ute på det öppna fältet
    { x: 100, z: 128 },
    { x: 156, z: 128 },
    { x: 92, z: 60 },
    { x: 164, z: 60 },
    { x: 66, z: 160 },
    { x: 190, z: 160 },
    { x: 128, z: 242 },
  ],
  /** Vrak från gamla strider: framför huvudpassagen och mellan dalarna. */
  wrecks: [
    { type: 'rhino', x: 122, z: 124 },
    { type: 'mantis', x: 131, z: 120 },
    { type: 'striker', x: 137, z: 127 },
    { type: 'pillar', x: 126, z: 132 },
    { type: 'mantis', x: 118, z: 117 },
    { type: 'striker', x: 140, z: 116 },
    { type: 'mantis', x: 84, z: 142 },
    { type: 'striker', x: 90, z: 136 },
    { type: 'rhino', x: 78, z: 137 },
    { type: 'mantis', x: 172, z: 142 },
    { type: 'striker', x: 166, z: 136 },
    { type: 'pillar', x: 178, z: 137 },
  ],
};
