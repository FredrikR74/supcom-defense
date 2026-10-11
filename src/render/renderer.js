import * as THREE from 'three';
import { createCameraRig } from './cameraRig.js';
import { createTerrainMesh } from './terrainMesh.js';
import { createTerrainProps } from './terrainProps.js';
import { createMapMarkers } from './mapMarkers.js';
import { createEntityView } from './entityView.js';
import { createPathDebug } from './pathDebug.js';
import { createCombatView } from './combatView.js';
import { createHealthBars } from './healthBars.js';
import { createGhost, setGhostState, applySurfaceDetail } from './models.js';
import { PLAYER_ID } from '../sim/constants.js';
import { raycastTerrain, isInsideMap, getHeight } from '../sim/terrain.js';

/** Över detta kameraavstånd visas strategiska ikoner i stället för meshes. */
export const STRATEGIC_DISTANCE = 110;

export function createRenderer(canvas, world) {
  const { map, terrain } = world;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  applySurfaceDetail(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1000);
  const rig = createCameraRig(camera, {
    mapSize: map.size,
    groundHeight: map.terrain.plateau.height,
  });
  rig.target.x = map.core.x;
  rig.target.z = map.core.z;
  rig.apply();

  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3428, 0.9));
  // Låg sol från nordväst ger tydlig skuggning av kullarna.
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(-100, 60, -40);
  scene.add(sun);

  scene.add(createTerrainMesh(terrain, renderer, { seed: map.seed }));
  scene.add(createTerrainProps(map, terrain));
  const markers = createMapMarkers(map, terrain);
  scene.add(markers.meshes, markers.icons);
  const entities = createEntityView(terrain);
  scene.add(entities.meshes, entities.icons, entities.overlay);
  const pathDebug = createPathDebug(terrain);
  scene.add(pathDebug.group);
  const combat = createCombatView(terrain);
  scene.add(combat.group);
  const healthBars = createHealthBars();
  scene.add(healthBars.group);

  // Förhandsvisningar av byggnader man håller på att placera: en pool per typ.
  const placementGhosts = {};

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const pickGround = (ray) => {
    const p = raycastTerrain(terrain, ray.origin, ray.direction);
    return p && isInsideMap(terrain, p.x, p.z) ? p : null;
  };

  const raycaster = new THREE.Raycaster();
  const ndcVec = new THREE.Vector2();

  function toScreen(worldPoint) {
    const p = worldPoint.project(camera);
    return {
      x: (p.x + 1) / 2 * canvas.clientWidth,
      y: (1 - p.y) / 2 * canvas.clientHeight,
    };
  }

  return {
    rig,
    pickGround,
    /** Markpunkt under en skärmpunkt i NDC, eller null. */
    pickAtNdc(ndcX, ndcY) {
      return pickGround(rig.rayAt(ndcX, ndcY));
    },
    /**
     * Entitets-id under en skärmpunkt i NDC, eller null. Missar strålen alla
     * meshes (t.ex. en nästan platt ofärdig byggnad) räcker det att markpunkten
     * ligger inom en byggnads fotavtryck.
     */
    pickEntityAtNdc(ndcX, ndcY) {
      raycaster.setFromCamera(ndcVec.set(ndcX, ndcY), camera);
      const hit = entities.pick(raycaster);
      if (hit !== null) return hit;
      const ground = pickGround(raycaster.ray);
      if (!ground) return null;
      const structure = world.entities.find((e) => e.kind === 'structure' &&
        Math.abs(ground.x - e.x) <= e.radius && Math.abs(ground.z - e.z) <= e.radius);
      if (structure) return structure.id;
      // Små enheter i rörelse är svåra att träffa: ta närmaste enhet eller vrak nära markpunkten.
      const tolerance = 0.8 + rig.distance * 0.01;
      let best = null;
      let bestDist = Infinity;
      for (const e of world.entities) {
        if (e.kind !== 'unit' && e.kind !== 'wreck') continue;
        const d = Math.hypot(e.x - ground.x, e.z - ground.z) - e.radius;
        if (d <= tolerance && d < bestDist) {
          best = e;
          bestDist = d;
        }
      }
      return best?.id ?? null;
    },
    /** Skärmposition i pixlar för entitetens mitt. */
    entityScreenPos(entity) {
      return toScreen(entities.center(entity));
    },
    /** Skärmposition i pixlar för punkten ovanför en entitet. */
    entityLabelScreenPos(entity) {
      return toScreen(entities.labelAnchor(entity));
    },
    /**
     * Visar förhandsvisningar för `type` på platserna i `placements` ([{ pos, ok }]),
     * gröna om ok, annars röda. Tom lista döljer alla.
     */
    setPlacementGhosts(type, placements = []) {
      for (const [t, pool] of Object.entries(placementGhosts)) {
        pool.forEach((g, i) => { g.visible = t === type && i < placements.length; });
      }
      if (!type) return;
      const pool = (placementGhosts[type] ??= []);
      placements.forEach(({ pos, ok }, i) => {
        if (!pool[i]) {
          pool[i] = createGhost(type);
          scene.add(pool[i]);
        }
        pool[i].visible = true;
        pool[i].position.set(pos.x, getHeight(terrain, pos.x, pos.z), pos.z);
        setGhostState(pool[i], ok ? 'ok' : 'bad');
      });
    },
    /** Markpunkterna (på platåns höjd) i skärmens fyra hörn, för minikartan. */
    viewFootprint() {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -map.terrain.plateau.height);
      const out = [];
      for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const p = rig.rayAt(x, y).intersectPlane(plane, new THREE.Vector3());
        if (!p) return null;
        out.push({ x: p.x, z: p.z });
      }
      return out;
    },
    /** Flyttar kameran så att den tittar på (x, z). */
    centerOn(x, z) {
      rig.target.x = x;
      rig.target.z = z;
      rig.apply();
    },
    /** Felsökning: visa/dölj blockerade rutor respektive flödesfältet. */
    toggleBlockedCells() { pathDebug.toggleBlocked(); },
    toggleFlowField() { pathDebug.toggleFlow(); },
    isStrategic() {
      return rig.distance > STRATEGIC_DISTANCE;
    },
    render(world, alpha, selection, frameSeconds = 0) {
      const strategic = rig.distance > STRATEGIC_DISTANCE;
      entities.sync(world, alpha, selection, PLAYER_ID, frameSeconds);
      pathDebug.update(world);
      markers.setStrategic(strategic);
      entities.setStrategic(strategic);
      // Händelser (skott, träffar, explosioner) blir effekter och töms sedan.
      combat.handleEvents(world.events);
      world.events.length = 0;
      combat.update(world, alpha, frameSeconds);
      healthBars.group.visible = !strategic;
      if (!strategic) healthBars.update(world, camera, (e) => entities.labelAnchor(e));
      renderer.render(scene, camera);
    },
  };
}
