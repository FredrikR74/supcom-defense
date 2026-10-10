/**
 * Rumsligt rutnät för snabba avståndsfrågor: entiteter sorteras in i celler
 * om `cellSize` världsenheter, och en fråga tittar bara i närliggande celler.
 */
export function createSpatialHash(cellSize) {
  const cells = new Map();
  // Unik nyckel per cell (för cellindex inom ±32768).
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

  return {
    insert(entity) {
      const k = key(Math.floor(entity.x / cellSize), Math.floor(entity.z / cellSize));
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(entity);
    },

    /** Alla insatta entiteter vars mittpunkt ligger inom `radius` från (x, z). */
    queryRadius(x, z, radius) {
      const result = [];
      const r2 = radius * radius;
      const x0 = Math.floor((x - radius) / cellSize);
      const x1 = Math.floor((x + radius) / cellSize);
      const z0 = Math.floor((z - radius) / cellSize);
      const z1 = Math.floor((z + radius) / cellSize);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const list = cells.get(key(cx, cz));
          if (!list) continue;
          for (const e of list) {
            const dx = e.x - x;
            const dz = e.z - z;
            if (dx * dx + dz * dz <= r2) result.push(e);
          }
        }
      }
      return result;
    },
  };
}
