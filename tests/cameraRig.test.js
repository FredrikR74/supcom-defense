import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraRig } from '../src/render/cameraRig.js';

function setup() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 1000);
  const rig = createCameraRig(camera, { mapSize: 128, groundHeight: 5 });
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -5);
  const groundAt = (x, y) => rig.rayAt(x, y).intersectPlane(plane, new THREE.Vector3());
  return { camera, rig, groundAt };
}

describe('cameraRig', () => {
  it('tittar mot målpunkten', () => {
    const { groundAt } = setup();
    const p = groundAt(0, 0);
    expect(p.x).toBeCloseTo(64);
    expect(p.z).toBeCloseTo(64);
  });

  it.each([
    [0.5, -0.3, 0.5],
    [-0.8, 0.6, 0.5],
    [0.2, 0.2, 1.8],
  ])('zoomAt(%f, %f, %f) behåller markpunkten under pekaren', (x, y, factor) => {
    const { rig, groundAt } = setup();
    const before = groundAt(x, y).clone();
    rig.zoomAt(x, y, factor);
    const after = groundAt(x, y);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.z).toBeCloseTo(before.z, 4);
  });

  it('begränsar zoomavståndet', () => {
    const { rig } = setup();
    rig.zoomAt(0, 0, 0.001);
    expect(rig.distance).toBe(rig.minDistance);
    rig.zoomAt(0, 0, 1000);
    expect(rig.distance).toBe(rig.maxDistance);
  });

  it('håller målpunkten inom kartan vid panorering', () => {
    const { rig } = setup();
    rig.pan(-1000, 1000);
    expect(rig.target.x).toBe(0);
    expect(rig.target.z).toBe(128);
  });

  it('blir mer rakt uppifrån när man zoomar ut', () => {
    const { rig, camera } = setup();
    const pitch = () => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      return Math.asin(-dir.y);
    };
    rig.zoomAt(0, 0, 0.2);
    const near = pitch();
    rig.zoomAt(0, 0, 100);
    expect(pitch()).toBeGreaterThan(near);
  });
});
