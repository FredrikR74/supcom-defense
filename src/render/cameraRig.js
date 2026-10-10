import * as THREE from 'three';

const MIN_PITCH = THREE.MathUtils.degToRad(50);
const MAX_PITCH = THREE.MathUtils.degToRad(80);

/**
 * SupCom-liknande kamera: tittar ner mot en målpunkt, med norr uppåt.
 * Ju längre ut man zoomar, desto mer rakt uppifrån.
 */
export function createCameraRig(camera, {
  mapSize,
  groundHeight = 0,
  minDistance = 10,
  maxDistance = 190,
  distance = 70,
} = {}) {
  const target = new THREE.Vector3(mapSize / 2, groundHeight, mapSize / 2);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const rig = {
    target,
    distance,
    minDistance,
    maxDistance,

    apply() {
      const t = (rig.distance - minDistance) / (maxDistance - minDistance);
      const pitch = MIN_PITCH + (MAX_PITCH - MIN_PITCH) * t;
      camera.position.set(
        target.x,
        target.y + rig.distance * Math.sin(pitch),
        target.z + rig.distance * Math.cos(pitch),
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },

    /** Stråle från kameran genom en skärmpunkt i NDC (-1..1). */
    rayAt(ndcX, ndcY) {
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray;
    },

    pan(dx, dz) {
      target.x = THREE.MathUtils.clamp(target.x + dx, 0, mapSize);
      target.z = THREE.MathUtils.clamp(target.z + dz, 0, mapSize);
      rig.apply();
    },

    /**
     * Zoomar med `factor` (<1 in, >1 ut) så att markpunkten under skärmpunkten
     * ligger kvar under den. `pickGround(ray)` returnerar markträff eller null.
     */
    zoomAt(ndcX, ndcY, factor, pickGround = () => null) {
      const ray = rig.rayAt(ndcX, ndcY);
      const anchor = pickGround(ray) ?? intersectPlane(ray, groundHeight);

      rig.distance = THREE.MathUtils.clamp(rig.distance * factor, minDistance, maxDistance);
      rig.apply();
      if (!anchor) return;

      const after = intersectPlane(rig.rayAt(ndcX, ndcY), anchor.y);
      if (after) rig.pan(anchor.x - after.x, anchor.z - after.z);
    },
  };

  function intersectPlane(ray, y) {
    plane.constant = -y;
    const p = ray.intersectPlane(plane, hit);
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  rig.apply();
  return rig;
}
