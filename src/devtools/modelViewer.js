import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createModel, applySurfaceDetail, poseLeg } from '../render/models.js';

/**
 * Modellvisare för utveckling (/models.html): en modell i taget på en platta,
 * samma ljus som i spelet, och "Walk" för att se gånganimationen.
 */
const TYPES = ['acu', 'engineer', 'snoop', 'mechMarine', 'striker', 'lobo', 'archer', 'mantis', 'mole', 'medusa',
  'landFactory', 'massExtractor', 'powerGenerator', 'pointDefense', 'wall', 'core', 'cybranGateway'];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
applySurfaceDetail(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x2a2418, 0.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(-100, 60, -40);
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x5b5544, roughness: 1 }),
);
scene.add(ground);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
camera.position.set(3, 2.4, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
window.viewer = { camera, controls };

let model = null;
let walking = false;
let phase = 0;

function show(type) {
  if (model) scene.remove(model);
  model = createModel(type);
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  controls.target.set(0, (box.max.y) / 2, 0);
  for (const b of bar.querySelectorAll('button[data-type]')) b.classList.toggle('on', b.dataset.type === type);
  history.replaceState(null, '', `#${type}`);
}

const bar = document.getElementById('bar');
for (const type of TYPES) {
  const b = document.createElement('button');
  b.textContent = type;
  b.dataset.type = type;
  b.onclick = () => show(type);
  bar.append(b);
}
const walkButton = document.createElement('button');
walkButton.textContent = 'Walk';
walkButton.onclick = () => {
  walking = !walking;
  walkButton.classList.toggle('on', walking);
};
bar.append(walkButton);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('hashchange', () => {
  if (TYPES.includes(location.hash.slice(1))) show(location.hash.slice(1));
});
resize();
show(TYPES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'acu');

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const legL = model.getObjectByName('legL');
  const legR = model.getObjectByName('legR');
  if (legL && legR) {
    if (walking) phase += dt * 3 * 4.2; // ACU:ns fart 3 och samma stegtakt som i spelet
    const swing = walking ? Math.sin(phase) * 0.5 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
  }
  for (let i = 0; i < 4; i++) {
    const leg = model.getObjectByName(`leg${i}`);
    if (leg) poseLeg(leg, phase, walking ? 1 : 0);
  }
  if (walking && !legL) phase += dt * 3.6 * 7; // Cybran: samma stegtakt som i spelet
  controls.update();
  renderer.render(scene, camera);
});
