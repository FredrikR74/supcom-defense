import { createWorld, tickWorld, TICK_SECONDS, PLAYER_ID } from './sim/world.js';
import { getEntity } from './sim/entities.js';
import { queueCommand } from './sim/commands.js';
import { spawnEnemy } from './sim/enemies.js';
import { createFixedStep } from './loop.js';
import { createRenderer } from './render/renderer.js';
import { createCameraInput } from './input/cameraInput.js';
import { createBuildInput } from './input/buildInput.js';
import { createSelectionInput } from './input/selection.js';
import { createDebugOverlay } from './ui/debug.js';
import { createResourcePanel } from './ui/resourcePanel.js';
import { createHoverInfo } from './ui/hoverInfo.js';
import { createCommandPanel } from './ui/commandPanel.js';
import { createThreatPanel } from './ui/threatPanel.js';
import { createSelectionInfo } from './ui/selectionInfo.js';
import { createIdlePanel } from './ui/idlePanel.js';
import firstDefense from './data/maps/firstDefense.js';

const canvas = document.getElementById('game');
const world = createWorld({ seed: 1, map: firstDefense });
const step = createFixedStep(TICK_SECONDS);
const view = createRenderer(canvas, world);
const cameraInput = createCameraInput(canvas, view.rig, view.pickGround);
const debug = createDebugOverlay(document.getElementById('debug'));
const resources = createResourcePanel(document.getElementById('resources'));
const hoverInfo = createHoverInfo(document.getElementById('hover'));

const selection = new Set();
/** Delat UI-tillstånd. `placing`: { type } när spelaren placerar en byggnad. */
const ui = { placing: null };

// Byggläget skapas före markeringen så att det får klicken först.
const buildInput = createBuildInput(canvas, view, world, selection, ui);
const selectionInput = createSelectionInput(
  canvas,
  document.getElementById('selection-box'),
  view,
  world,
  selection,
);

const selectedIds = () => [...selection];
const sellSelected = () => queueCommand(world, { type: 'sell', owner: PLAYER_ID, ids: selectedIds() });

const commandPanel = createCommandPanel(document.getElementById('commands'), {
  onBuild: (type) => { ui.placing = { type }; },
  onProduce: (unit) => {
    for (const id of selectedIds()) queueCommand(world, { type: 'produce', owner: PLAYER_ID, id, unit });
  },
  onRepeat: (value) => queueCommand(world, { type: 'setRepeat', owner: PLAYER_ID, ids: selectedIds(), value }),
  onSell: sellSelected,
});

const threatPanel = createThreatPanel(document.getElementById('threat'), document.getElementById('toast'), {
  onDifficulty: (value) => queueCommand(world, { type: 'setDifficulty', owner: PLAYER_ID, value }),
});

const selectionInfo = createSelectionInfo(document.getElementById('info'));
const idlePanel = createIdlePanel(document.getElementById('idle'), {
  onSelect: (unit) => {
    selection.clear();
    selection.add(unit.id);
    view.centerOn(unit.x, unit.z);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Delete') sellSelected();
  // Felsökning: P = blockerade rutor, O = flödesfältet.
  if (e.code === 'KeyP') view.toggleBlockedCells();
  if (e.code === 'KeyO') view.toggleFlowField();
  // Bara i dev tills vågorna finns (fas 7): N = en Mantis vid varje spawnpunkt.
  if (import.meta.env.DEV && e.code === 'KeyN') {
    world.map.spawns.forEach((_, i) => spawnEnemy(world, 'mantis', i));
  }
});

// Felsökning i webbläsarkonsolen (bara i dev): game.world, game.tick(100).
if (import.meta.env.DEV) {
  window.game = {
    world,
    selection,
    view,
    ui,
    /** Skapar `n` fiender av `type`, fördelade över spawnpunkterna. */
    spawn(n = 1, type = 'mantis') {
      for (let i = 0; i < n; i++) spawnEnemy(world, type, i);
      return world.entities.length;
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) tickWorld(world);
      return world.tick;
    },
  };
}

let last = performance.now();

function frame(now) {
  const frameSeconds = (now - last) / 1000;
  last = now;

  const { ticks, alpha } = step.advance(frameSeconds);
  for (let i = 0; i < ticks; i++) tickWorld(world);

  // Begränsa så att en lång frame (t.ex. efter en bakgrundsflik) inte ger ett jättehopp.
  cameraInput.update(Math.min(frameSeconds, 0.1));
  selectionInput.prune();

  const ndc = cameraInput.mouseNdc();
  buildInput.update(ndc);
  for (const ev of world.events) {
    if (ev.type === 'victory') threatPanel.toast('Victory! You survived the Cybran assault');
  }
  view.render(world, alpha, selection, frameSeconds);

  const hovered = ndc && !ui.placing && getEntity(world, view.pickEntityAtNdc(ndc.x, ndc.y));
  hoverInfo.update(hovered, hovered && view.entityLabelScreenPos(hovered));
  resources.update(world.players[PLAYER_ID].economy);
  commandPanel.update(world, selection, ui);
  threatPanel.update(world);
  selectionInfo.update(world, selection);
  idlePanel.update(world);

  const cursor = ndc && view.pickAtNdc(ndc.x, ndc.y);
  debug.update(world, frameSeconds, [
    `zoom ${view.rig.distance.toFixed(0)}${view.isStrategic() ? ' (strategic)' : ''}`,
    cursor
      ? `mouse ${cursor.x.toFixed(1)}, ${cursor.z.toFixed(1)}  h ${cursor.y.toFixed(2)}`
      : 'mouse -',
  ]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
