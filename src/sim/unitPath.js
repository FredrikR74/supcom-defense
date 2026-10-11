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

/** Halva bredden på korridoren som sikten kontrolleras i, så att enheter inte skär hörn. */
export const PATH_HALF_WIDTH = 0.4;

/**
 * Fri sikt från (x0, z0) mot (x1, z1)? Kontrolleras i en korridor med halva
 * bredden `halfWidth` (mittlinjen och båda kanterna), så att vägen inte snuddar
 * vid hörn av byggnader eller branter. Rutan man står i ignoreras (man kan ha
 * blivit inbyggd) och kontrollen slutar `stopShort` före målet (t.ex. byggräckvidd).
 */
export function hasClearPath(world, x0, z0, x1, z1, stopShort = 0, halfWidth = PATH_HALF_WIDTH) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const len = dist - stopShort;
  if (len <= 0) return true;
  const ux = (x1 - x0) / dist;
  const uz = (z1 - z0) / dist;
  const start = cellIndex(world, x0, z0);
  for (let t = 0; t <= len; t += SIGHT_STEP) {
    const cx = x0 + ux * t;
    const cz = z0 + uz * t;
    for (const side of halfWidth > 0 ? [0, -halfWidth, halfWidth] : [0]) {
      const i = cellIndex(world, cx - uz * side, cz + ux * side);
      if (i !== start && isBlockedCell(world, i)) return false;
    }
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
 * Sammanhängande områden av framkomliga rutor (regioner), räknade om när
 * byggnader eller terräng ändras (`pathVersion`). Ligger målet i en annan
 * region än enheten går det inte att nå, och då behöver A* inte söka igenom
 * hela kartan för att upptäcka det.
 */
function regions(world) {
  const cache = world.unitPathCache ??= {};
  if (cache.regionVersion === world.pathVersion && cache.labels) return cache.labels;
  const n = world.terrain.size;
  const labels = cache.labels?.length === n * n ? cache.labels : new Int32Array(n * n);
  labels.fill(-1);
  const queue = new Int32Array(n * n);
  let next = 0;
  for (let s = 0; s < n * n; s++) {
    if (labels[s] !== -1 || isBlockedCell(world, s)) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    labels[s] = next;
    while (head < tail) {
      const i = queue[head++];
      const cx = i % n;
      const cz = (i - cx) / n;
      for (const [dx, dz] of NEIGHBORS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        if (labels[j] !== -1 || isBlockedCell(world, j)) continue;
        if (dx !== 0 && dz !== 0 && (isBlockedCell(world, cz * n + nx) || isBlockedCell(world, nz * n + cx))) continue;
        labels[j] = next;
        queue[tail++] = j;
      }
    }
    next++;
  }
  cache.labels = labels;
  cache.regionVersion = world.pathVersion;
  return labels;
}

/** Enhetens region: rutan den står i, eller en granne om den står i en blockerad ruta. */
function regionAt(world, labels, i) {
  if (labels[i] !== -1) return labels[i];
  const n = world.terrain.size;
  const cx = i % n;
  const cz = (i - cx) / n;
  for (const [dx, dz] of NEIGHBORS) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx >= 0 && nz >= 0 && nx < n && nz < n && labels[nz * n + nx] !== -1) return labels[nz * n + nx];
  }
  return -1;
}

/** Den ruta i `region` som ligger närmast `goal` (söker i växande kvadrater runt målet). */
function nearestInRegion(world, labels, region, goal) {
  const n = world.terrain.size;
  const gx = goal % n;
  const gz = (goal - gx) / n;
  for (let r = 1; r < n; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = gx + dx;
        const z = gz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n || labels[z * n + x] !== region) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          best = z * n + x;
          bestD = d;
        }
      }
    }
    if (best !== -1) return best;
  }
  return -1;
}

/** Arbetsminne för A*, återanvänt mellan sökningar (generationsstämplar i stället för att nollställa). */
function scratch(world) {
  const cache = world.unitPathCache ??= {};
  const size = world.terrain.size * world.terrain.size;
  if (!cache.g || cache.g.length !== size) {
    cache.g = new Float64Array(size);
    cache.parent = new Int32Array(size);
    cache.seen = new Uint32Array(size);
    cache.closed = new Uint32Array(size);
    cache.stamp = 0;
  }
  cache.stamp++;
  return cache;
}

/** Fri sikt mot målet kontrolleras om efter så här många ticks. */
const CLEAR_RECHECK_TICKS = 5;
/** Vägen räknas om när målet flyttat sig så stor andel av avståndet dit. */
const REPATH_FRACTION = 0.15;

/** Så många rutor får A* expandera per tick för alla enheter tillsammans. */
export const PATH_BUDGET_PER_TICK = 60000;

/**
 * A* från (x, z) till närheten av `dest` ({ x, z, reach }). Når man inte fram
 * går vägen till den nåbara ruta som ligger närmast målet. Returnerar en
 * avkortad lista med vägpunkter (rutmittpunkter), utan startpunkten, eller
 * null om tickets sökbudget (world.pathBudget) redan är slut; då får enheten
 * vänta till nästa tick.
 */
export function findPath(world, x, z, dest) {
  // Budgeten kontrolleras före sökningen, så att en påbörjad sökning alltid blir klar.
  if (world.pathBudget !== undefined && world.pathBudget <= 0) return null;
  const n = world.terrain.size;
  const start = cellIndex(world, x, z);
  const labels = regions(world);
  const startRegion = regionAt(world, labels, start);
  const realGoal = cellIndex(world, dest.x, dest.z);
  let goalCell = realGoal;
  const center = (i) => ({ x: (i % n) + 0.5, z: Math.floor(i / n) + 0.5 });
  const near = (i) => {
    const c = center(i);
    return dest.reach > 0 && Math.hypot(c.x - dest.x, c.z - dest.z) <= dest.reach;
  };
  // Målet i en annan region (t.ex. uppe på ett berg): sikta på närmaste nåbara
  // ruta, om inte den rutan redan är inom räckhåll.
  let target = { x: dest.x, z: dest.z };
  if (startRegion !== -1 && labels[goalCell] !== startRegion) {
    const alt = nearestInRegion(world, labels, startRegion, goalCell);
    if (alt !== -1 && !near(alt)) {
      goalCell = alt;
      target = center(alt);
    }
  }
  const h = (i) => {
    const c = center(i);
    const dx = Math.abs(c.x - target.x);
    const dz = Math.abs(c.z - target.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const isGoal = (i) => i === goalCell || near(i);
  const passable = (i) => i === start || !isBlockedCell(world, i);

  const { g, parent, seen, closed, stamp } = scratch(world);
  const heap = createHeap();
  g[start] = 0;
  seen[start] = stamp;
  parent[start] = -1;
  heap.push(h(start), start);
  let best = start;
  let bestH = h(start);
  let found = null;
  let expanded = 0;

  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i] === stamp) continue;
    closed[i] = stamp;
    expanded++;
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
      if (closed[j] === stamp || !passable(j)) continue;
      if (dx !== 0 && dz !== 0 && (!passable(cz * n + nx) || !passable(nz * n + cx))) continue;
      const ng = g[i] + cost;
      if (seen[j] !== stamp || ng < g[j]) {
        seen[j] = stamp;
        g[j] = ng;
        parent[j] = i;
        heap.push(ng + h(j), j);
      }
    }
  }
  if (world.pathBudget !== undefined) world.pathBudget -= expanded;

  const cells = [];
  for (let c = found ?? best; c !== start && c !== -1; c = parent[c]) cells.push(c);
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
  // Ett ersättningsmål i rätt region räknas inte som att vi når det riktiga målet.
  return { points: smoothed, reachesGoal: found !== null && (found === realGoal || near(found)) };
}

/**
 * Var en egen enhet ska gå just nu för att ta sig till `dest`.
 * Returnerar `dest` om vägen är fri, nästa vägpunkt annars, `{ stuck: true }`
 * om enheten kommit så nära den kan, eller `{ wait: true }` om tickets
 * sökbudget är slut (enheten väntar ett tick).
 * Vägen sparas på ordern och räknas om när målet flyttas eller byggnader ändras.
 */
export function steer(world, e, order, dest) {
  if (!world.terrain) return dest;
  // Fri sikt kontrolleras om några ticks i taget (eller direkt när målet flyttas
  // eller byggnader ändras), inte varje tick för varje enhet.
  const check = order.clearCheck;
  if (!check || world.tick - check.tick >= CLEAR_RECHECK_TICKS || check.version !== world.pathVersion ||
      Math.hypot(check.x - dest.x, check.z - dest.z) > 1) {
    order.clearCheck = {
      tick: world.tick, version: world.pathVersion, x: dest.x, z: dest.z,
      clear: hasClearPath(world, e.x, e.z, dest.x, dest.z, dest.reach),
    };
  }
  if (order.clearCheck.clear) {
    order.path = null;
    return dest;
  }
  // Ett mål som rör sig (t.ex. en fiende) ger en ny väg först när det flyttat
  // sig en bit i förhållande till hur långt bort det är.
  const far = Math.hypot(dest.x - e.x, dest.z - e.z);
  const stale = !order.path ||
    order.pathVersion !== world.pathVersion ||
    Math.hypot(order.pathGoal.x - dest.x, order.pathGoal.z - dest.z) > Math.max(1, far * REPATH_FRACTION);
  if (stale) {
    const result = findPath(world, e.x, e.z, dest);
    if (!result) return { wait: true }; // sökbudgeten för detta tick är slut
    const { points, reachesGoal } = result;
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
