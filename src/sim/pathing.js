import structures from '../data/structures.js';
import { threatCosts } from './threat.js';

/**
 * Vägar för fiender: ett passerbarhetsrutnät och ett flödesfält mot kärnan.
 * Rutnätet har en cell per ruta, index = z * size + x.
 */

/** Största höjdskillnad inom en ruta som enheter kan köra över. */
export const MAX_UNIT_SLOPE = 1.0;

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Rutor som är för branta för enheter (1) eller körbara (0). */
export function computeSteepCells(terrain) {
  const n = terrain.size;
  const m = n + 1;
  const h = terrain.heights;
  const steep = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = h[z * m + x];
      const b = h[z * m + x + 1];
      const c = h[(z + 1) * m + x];
      const d = h[(z + 1) * m + x + 1];
      steep[z * n + x] = Math.max(a, b, c, d) - Math.min(a, b, c, d) > MAX_UNIT_SLOPE ? 1 : 0;
    }
  }
  return steep;
}

export function cellIndex(world, x, z) {
  const n = world.terrain.size;
  const cx = Math.min(Math.max(Math.floor(x), 0), n - 1);
  const cz = Math.min(Math.max(Math.floor(z), 0), n - 1);
  return cz * n + cx;
}

/** Rutorna under kärnan: målet för flödesfältet. */
function goalCells(world) {
  const { core } = world.map;
  const size = structures.core.size;
  const n = world.terrain.size;
  const cells = new Set();
  for (let z = core.z - size / 2; z < core.z + size / 2; z++) {
    for (let x = core.x - size / 2; x < core.x + size / 2; x++) cells.add(z * n + x);
  }
  return cells;
}

/** Kan en enhet stå i ruta `i`? `extraBlocked` är rutor som ska räknas som blockerade. */
function makePassable(world, goals, extraBlocked) {
  return (i) =>
    !world.steep[i] &&
    !(extraBlocked && extraBlocked.has(i)) &&
    (world.occupancy[i] === 0 || goals.has(i));
}

/** Grannar till ruta `i` som går att nå: diagonaler kräver att båda raka grannarna är fria. */
function forEachNeighbor(n, i, passable, fn) {
  const x = i % n;
  const z = (i - x) / n;
  for (const [dx, dz, cost] of NEIGHBORS) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
    const j = nz * n + nx;
    if (!passable(j)) continue;
    if (dx !== 0 && dz !== 0 && (!passable(z * n + nx) || !passable(nz * n + x))) continue;
    fn(j, cost);
  }
}

/** Minimal binär min-heap över (prioritet, värde). */
function createHeap() {
  const keys = [];
  const values = [];
  const swap = (a, b) => {
    [keys[a], keys[b]] = [keys[b], keys[a]];
    [values[a], values[b]] = [values[b], values[a]];
  };
  return {
    get size() { return keys.length; },
    push(key, value) {
      keys.push(key);
      values.push(value);
      let i = keys.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= keys[i]) break;
        swap(i, p);
        i = p;
      }
    },
    pop() {
      const top = values[0];
      const lastKey = keys.pop();
      const lastValue = values.pop();
      if (keys.length > 0) {
        keys[0] = lastKey;
        values[0] = lastValue;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < keys.length && keys[l] < keys[m]) m = l;
          if (r < keys.length && keys[r] < keys[m]) m = r;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

/**
 * Flödesfält mot kärnan (Dijkstra). `dist[i]` är vägkostnaden från ruta i till
 * kärnan (Infinity om oåtkomlig) och `next[i]` rutan man ska gå till härnäst (-1 om ingen).
 * `goal[i]` är 1 för kärnans rutor.
 *
 * Rutor som en försvarsbyggnad som fienden känner till når kostar mer att gå
 * igenom (se threat.js), så vägen går runt dödszoner när omvägen är kort nog.
 */
export function computeFlowField(world) {
  const n = world.terrain.size;
  const goals = goalCells(world);
  const passable = makePassable(world, goals, null);
  const threat = threatCosts(world);
  const dist = new Float32Array(n * n).fill(Infinity);
  const next = new Int32Array(n * n).fill(-1);
  const goal = new Uint8Array(n * n);
  const heap = createHeap();
  for (const g of goals) {
    dist[g] = 0;
    goal[g] = 1;
    heap.push(0, g);
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const d = dist[i];
    forEachNeighbor(n, i, passable, (j, cost) => {
      // Fienden går från j till i: kostnaden för att gå genom ruta j.
      // Avrundad som i dist (Float32Array): annars kan samma väg se kortare ut
      // om och om igen och rutor läggas tillbaka i kön i det oändliga.
      const nd = Math.fround(d + (threat ? cost * (1 + threat[j]) : cost));
      if (nd < dist[j]) {
        dist[j] = nd;
        next[j] = i;
        heap.push(nd, j);
      }
    });
  }
  return { dist, next, goal };
}

/** Räknar om flödesfältet om något har ändrats sedan sist. */
export function updatePathing(world) {
  if (!world.pathDirty) return;
  world.flow = computeFlowField(world);
  world.pathDirty = false;
  world.pathVersion++;
}

/** Är ruta `i` blockerad för enheter (brant eller byggnad, kärnan räknas som blockerad)? */
export function isBlockedCell(world, i) {
  return world.steep[i] === 1 || world.occupancy[i] !== 0;
}

/**
 * Skulle rutorna `cells` (t.ex. en ny byggnads fotavtryck) stänga någon
 * spawnpunkts väg till kärnan? Bredden-först från kärnan.
 */
export function wouldBlockPaths(world, cells) {
  const n = world.terrain.size;
  const blocked = new Set(cells);

  // Snabbkoll: rör rutorna inget annat hinder eller kartkanten kan de inte stänga en väg.
  let touches = false;
  for (const i of blocked) {
    const x = i % n;
    const z = (i - x) / n;
    for (let dz = -1; dz <= 1 && !touches; dz++) {
      for (let dx = -1; dx <= 1 && !touches; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) touches = true;
        else if (!blocked.has(nz * n + nx) && isBlockedCell(world, nz * n + nx)) touches = true;
      }
    }
  }
  if (!touches) return false;

  const goals = goalCells(world);
  const passable = makePassable(world, goals, blocked);
  const seen = new Uint8Array(n * n);
  const queue = [...goals];
  for (const g of goals) seen[g] = 1;
  for (let q = 0; q < queue.length; q++) {
    forEachNeighbor(n, queue[q], passable, (j) => {
      if (!seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    });
  }
  return world.map.spawns.some((s) => !seen[cellIndex(world, s.x, s.z)]);
}

/**
 * Nästa punkt för en fiende som följer flödesfältet, eller null om den är framme
 * (står intill kärnan) eller helt instängd. Står den i en blockerad ruta väljs bästa grannen.
 */
export function flowTarget(world, x, z) {
  const n = world.terrain.size;
  const { dist, next, goal } = world.flow;
  const i = cellIndex(world, x, z);
  if (goal[i] || (next[i] >= 0 && goal[next[i]])) return null;

  let j = next[i];
  if (j < 0) {
    let best = Infinity;
    const cx = i % n;
    const cz = (i - cx) / n;
    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const k = nz * n + nx;
      if (dist[k] < best) {
        best = dist[k];
        j = k;
      }
    }
    if (j < 0 || best === Infinity) return null;
  }
  return { x: (j % n) + 0.5, z: Math.floor(j / n) + 0.5 };
}
