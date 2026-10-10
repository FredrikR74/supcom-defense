import { cellIndex, isBlockedCell } from './pathing.js';

/**
 * Vägsökning för egna enheter (ACU, ingenjörer): A* på rutnätet runt byggnader
 * och brant terräng. Är sikten fri går enheten rakt.
 */

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];
/** Avstånd mellan provpunkter vid siktkontroll. */
const SIGHT_STEP = 0.25;
/** Så här nära en vägpunkt räknas som framme. */
const WAYPOINT_EPS = 0.05;

/**
 * Fri sikt från (x0, z0) mot (x1, z1)? Rutan man står i ignoreras (man kan ha
 * blivit inbyggd) och kontrollen slutar `stopShort` före målet (t.ex. byggräckvidd).
 */
export function hasClearPath(world, x0, z0, x1, z1, stopShort = 0) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const len = dist - stopShort;
  if (len <= 0) return true;
  const start = cellIndex(world, x0, z0);
  for (let t = 0; t <= len; t += SIGHT_STEP) {
    const i = cellIndex(world, x0 + ((x1 - x0) * t) / dist, z0 + ((z1 - z0) * t) / dist);
    if (i !== start && isBlockedCell(world, i)) return false;
  }
  return true;
}

/** Minimal binär min-heap över (prioritet, värde). */
function createHeap() {
  const items = [];
  return {
    get size() { return items.length; },
    push(key, value) {
      items.push([key, value]);
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (items[p][0] <= items[i][0]) break;
        [items[p], items[i]] = [items[i], items[p]];
        i = p;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && items[l][0] < items[m][0]) m = l;
          if (r < items.length && items[r][0] < items[m][0]) m = r;
          if (m === i) break;
          [items[m], items[i]] = [items[i], items[m]];
          i = m;
        }
      }
      return top[1];
    },
  };
}

/**
 * A* från (x, z) till närheten av `dest` ({ x, z, reach }). Når man inte fram
 * går vägen till den nåbara ruta som ligger närmast målet. Returnerar en
 * avkortad lista med vägpunkter (rutmittpunkter), utan startpunkten.
 */
export function findPath(world, x, z, dest) {
  const n = world.terrain.size;
  const start = cellIndex(world, x, z);
  const goalCell = cellIndex(world, dest.x, dest.z);
  const center = (i) => ({ x: (i % n) + 0.5, z: Math.floor(i / n) + 0.5 });
  const h = (i) => {
    const c = center(i);
    const dx = Math.abs(c.x - dest.x);
    const dz = Math.abs(c.z - dest.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const isGoal = (i) => {
    if (i === goalCell) return true;
    const c = center(i);
    return dest.reach > 0 && Math.hypot(c.x - dest.x, c.z - dest.z) <= dest.reach;
  };
  const passable = (i) => i === start || !isBlockedCell(world, i);

  const g = new Map([[start, 0]]);
  const parent = new Map();
  const closed = new Set();
  const heap = createHeap();
  heap.push(h(start), start);
  let best = start;
  let bestH = h(start);
  let found = null;

  while (heap.size > 0) {
    const i = heap.pop();
    if (closed.has(i)) continue;
    closed.add(i);
    if (isGoal(i)) {
      found = i;
      break;
    }
    const hi = h(i);
    if (hi < bestH) {
      best = i;
      bestH = hi;
    }
    const cx = i % n;
    const cz = (i - cx) / n;
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (closed.has(j) || !passable(j)) continue;
      if (dx !== 0 && dz !== 0 && (!passable(cz * n + nx) || !passable(nz * n + cx))) continue;
      const ng = g.get(i) + cost;
      if (ng < (g.get(j) ?? Infinity)) {
        g.set(j, ng);
        parent.set(j, i);
        heap.push(ng + h(j), j);
      }
    }
  }

  const cells = [];
  for (let c = found ?? best; c !== start && c !== undefined; c = parent.get(c)) cells.push(c);
  cells.reverse();
  const points = cells.map(center);

  // Korta av: hoppa till den sista punkten som syns från där vi står.
  const smoothed = [];
  let from = { x, z };
  let k = 0;
  while (k < points.length) {
    let far = k;
    for (let m = points.length - 1; m > k; m--) {
      if (hasClearPath(world, from.x, from.z, points[m].x, points[m].z)) {
        far = m;
        break;
      }
    }
    smoothed.push(points[far]);
    from = points[far];
    k = far + 1;
  }
  return { points: smoothed, reachesGoal: found !== null };
}

/**
 * Var en egen enhet ska gå just nu för att ta sig till `dest`.
 * Returnerar `dest` om vägen är fri, nästa vägpunkt annars, eller
 * `{ stuck: true }` om enheten kommit så nära den kan.
 * Vägen sparas på ordern och räknas om när målet flyttas eller byggnader ändras.
 */
export function steer(world, e, order, dest) {
  if (!world.terrain) return dest;
  if (hasClearPath(world, e.x, e.z, dest.x, dest.z, dest.reach)) {
    order.path = null;
    return dest;
  }
  const stale = !order.path ||
    order.pathVersion !== world.pathVersion ||
    Math.hypot(order.pathGoal.x - dest.x, order.pathGoal.z - dest.z) > 1;
  if (stale) {
    const { points, reachesGoal } = findPath(world, e.x, e.z, dest);
    order.path = points;
    order.pathReachesGoal = reachesGoal;
    order.pathVersion = world.pathVersion;
    order.pathGoal = { x: dest.x, z: dest.z };
  }
  while (order.path.length && Math.hypot(order.path[0].x - e.x, order.path[0].z - e.z) < WAYPOINT_EPS) {
    order.path.shift();
  }
  if (order.path.length === 0) return order.pathReachesGoal ? dest : { stuck: true };
  return { x: order.path[0].x, z: order.path[0].z, reach: 0, waypoint: true };
}
