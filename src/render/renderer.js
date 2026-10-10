import * as THREE from 'three';
import { createCameraRig } from './cameraRig.js';
import { createTerrainMesh } from './terrainMesh.js';
import { createMapMarkers } from './mapMarkers.js';
import { createEntityView } from './entityView.js';
import { raycastTerrain, isInsideMap } from '../sim/terrain.js';

/** Över detta kameraavstånd visas strategiska ikoner i stället för meshes. */
export const STRATEGIC_DISTANCE = 110;

export function createRenderer(canvas, world) {
  const { map, terrain } = world;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x2a2418, 0.6));
  // Låg sol från nordväst ger tydlig skuggning av kullarna.
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(-100, 60, -40);
  scene.add(sun);

  scene.add(createTerrainMesh(terrain, renderer));
  const markers = createMapMarkers(map, terrain);
  scene.add(markers.meshes, markers.icons);
  const entities = createEntityView(terrain);
  scene.add(entities.meshes, entities.icons, entities.overlay);

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
    /** Entitets-id under en skärmpunkt i NDC, eller null. */
    pickEntityAtNdc(ndcX, ndcY) {
      raycaster.setFromCamera(ndcVec.set(ndcX, ndcY), camera);
      return entities.pick(raycaster);
    },
    /** Skärmposition i pixlar för entitetens mitt. */
    entityScreenPos(entity) {
      return toScreen(entities.center(entity));
    },
    /** Skärmposition i pixlar för punkten ovanför en entitet. */
    entityLabelScreenPos(entity) {
      return toScreen(entities.labelAnchor(entity));
    },
    isStrategic() {
      return rig.distance > STRATEGIC_DISTANCE;
    },
    render(world, alpha, selection) {
      const strategic = rig.distance > STRATEGIC_DISTANCE;
      entities.sync(world, alpha, selection);
      markers.setStrategic(strategic);
      entities.setStrategic(strategic);
      renderer.render(scene, camera);
    },
  };
}
