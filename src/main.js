import { createWorld, tickWorld, TICK_SECONDS, PLAYER_ID } from './sim/world.js';
import { getEntity } from './sim/entities.js';
import { queueCommand } from './sim/commands.js';
import { spawnSquad } from './sim/squads.js';
import { acuRespawnIn } from './sim/acu.js';
import { createFixedStep } from './loop.js';
import { createRenderer } from './render/renderer.js';
import { createCameraInput } from './input/cameraInput.js';
import { createBuildInput } from './input/buildInput.js';
import { createSelectionInput } from './input/selection.js';
import { createDebugOverlay } from './ui/debug.js';
import { createFrameProfiler } from './devtools/frameProfiler.js';
import { createResourcePanel } from './ui/resourcePanel.js';
import { createControlGroups } from './input/controlGroups.js';
import { createHoverInfo } from './ui/hoverInfo.js';
import { createCommandPanel } from './ui/commandPanel.js';
import { createThreatPanel } from './ui/threatPanel.js';
import { createSelectionInfo } from './ui/selectionInfo.js';
import { createIdlePanel } from './ui/idlePanel.js';
import { createAcuButton } from './ui/acuButton.js';
import { createMinimap } from './ui/minimap.js';
import { createSound } from './ui/sound.js';
import { showStartMenu } from './ui/startMenu.js';
import maps from './data/maps/index.js';
import gameConfig from './data/gameConfig.js';
import enhancements from './data/enhancements.js';

/** Spelhastigheter man stegar mellan med +/− (1× är normal). */
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

const $ = (id) => document.getElementById(id);
const sound = createSound();

/** Antal egna enheter och byggnader (kärnan räknas inte), för räknaren i resurspanelen. */
function ownCounts(world) {
  let units = 0;
  let structures = 0;
  for (const e of world.entities) {
    if (e.owner !== PLAYER_ID) continue;
    if (e.kind === 'unit') units++;
    else if (e.kind === 'structure' && e.id !== world.coreId) structures++;
  }
  return { units, structures };
}

/** Startar ett spel på `map` med svårighetsgraden `difficulty` (0–100). */
function startGame({ map, difficulty }) {
  const canvas = $('game');
  const world = createWorld({ seed: 1, map, config: { difficulty } });
  // Tillåt längre frames vid hög spelhastighet, annars hinner simuleringen inte med.
  const step = createFixedStep(TICK_SECONDS, { maxFrameSeconds: 1 });
  const view = createRenderer(canvas, world);
  const cameraInput = createCameraInput(canvas, view.rig, view.pickGround);
  const debug = createDebugOverlay($('debug'));
  const profiler = createFrameProfiler();
  const measure = profiler.measure;
  const resources = createResourcePanel($('resources'));
  const hoverInfo = createHoverInfo($('hover'));

  const selection = new Set();
  /** Delat UI-tillstånd. `placing`: { type } när spelaren placerar en byggnad. */
  const ui = { placing: null };
  /** Paus och spelhastighet (index i SPEEDS). */
  const time = { paused: false, speed: SPEEDS.indexOf(1) };

  // Byggläget skapas före markeringen så att det får klicken först.
  const buildInput = createBuildInput(canvas, view, world, selection, ui);
  const selectionInput = createSelectionInput(canvas, $('selection-box'), view, world, selection, ui);

  /** Patrullläge: nästa klick på marken blir en patrullpunkt (som P i FA). */
  const startPatrol = () => {
    if (selection.size === 0) return;
    ui.mode = 'patrol';
    ui.patrolPlaced = false;
  };

  const selectedIds = () => [...selection];
  const sellSelected = () => queueCommand(world, { type: 'sell', owner: PLAYER_ID, ids: selectedIds() });

  const commandPanel = createCommandPanel($('commands'), {
    onBuild: (type) => { ui.placing = { type }; },
    onProduce: (unit, count = 1) => {
      for (const id of selectedIds()) queueCommand(world, { type: 'produce', owner: PLAYER_ID, id, unit, count });
    },
    onCancelProduce: (id, index, count = 1) =>
      queueCommand(world, { type: 'cancelProduce', owner: PLAYER_ID, id, index, count }),
    onRepeat: (value) => queueCommand(world, { type: 'setRepeat', owner: PLAYER_ID, ids: selectedIds(), value }),
    onPause: (value) => queueCommand(world, { type: 'setPaused', owner: PLAYER_ID, ids: selectedIds(), value }),
    onEnhance: (enhancement, queue = false) =>
      queueCommand(world, { type: 'enhance', owner: PLAYER_ID, ids: selectedIds(), enhancement, queue }),
    onCancelEnhance: (enhancement) =>
      queueCommand(world, { type: 'cancelEnhance', owner: PLAYER_ID, ids: selectedIds(), enhancement }),
    onPatrol: startPatrol,
    onSell: sellSelected,
  });

  const threatPanel = createThreatPanel($('threat'), $('toast'), {
    onDifficulty: (value) => queueCommand(world, { type: 'setDifficulty', owner: PLAYER_ID, value }),
  });

  /** Kärnan föll: visa hur länge man höll ut och en knapp för att börja om. */
  function showGameOver(elapsed) {
    const el = $('gameover');
    const m = Math.floor(elapsed / 60);
    const s = String(Math.floor(elapsed % 60)).padStart(2, '0');
    el.querySelector('.gameover-time').textContent = `You held out for ${m}:${s}`;
    el.querySelector('.gameover-restart').onclick = () => location.reload();
    el.hidden = false;
  }

  const modeHint = $('mode-hint');
  const speedHint = $('speed');
  /** Behåll bara markerade av `type` (eller ta bort dem, med `keep = false`). */
  const filterSelection = (type, keep) => {
    for (const id of [...selection]) {
      const e = getEntity(world, id);
      if (!e || (e.type === type) !== keep) selection.delete(id);
    }
  };
  const selectionInfo = createSelectionInfo($('info'), {
    onSelectOnly: (type) => filterSelection(type, true),
    onDeselect: (type) => filterSelection(type, false),
  });
  const acuButton = createAcuButton($('acu'), {
    onSelect: (acu) => {
      selection.clear();
      selection.add(acu.id);
    },
    onCenter: (acu) => view.centerOn(acu.x, acu.z),
  });
  const minimap = createMinimap($('minimap'), world, view);
  const idlePanel = createIdlePanel($('idle'), {
    // Markerar utan att flytta kameran.
    onSelect: (unit) => {
      selection.clear();
      selection.add(unit.id);
    },
    onSelectAll: (all) => {
      selection.clear();
      for (const unit of all) selection.add(unit.id);
    },
  });

  const controlGroups = createControlGroups(world, selection);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    // Kontrollgrupper: Ctrl+siffra sparar (Alt+siffra om webbläsaren tar Ctrl+siffra
    // till flikbyte), siffran väljer, Shift+siffra lägger till, dubbeltryck centrerar.
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    if (digit !== undefined) {
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        const n = controlGroups.save(digit);
        threatPanel.toast(n > 0 ? `Group ${digit} set (${n})` : `Group ${digit} cleared`);
      } else {
        const group = controlGroups.recall(digit, { add: e.shiftKey });
        if (group?.double) {
          const cx = group.entities.reduce((sum, u) => sum + u.x, 0) / group.entities.length;
          const cz = group.entities.reduce((sum, u) => sum + u.z, 0) / group.entities.length;
          view.centerOn(cx, cz);
        }
      }
      return;
    }
    if (e.code === 'Delete') sellSelected();
    if (e.code === 'KeyP') startPatrol();
    if (e.code === 'Escape') ui.mode = null;
    if (e.code === 'Space' || e.code === 'Pause') {
      e.preventDefault();
      time.paused = !time.paused;
    }
    // Tecknet (`key`), inte tangentens plats: på svenskt tangentbord ligger + där US har −.
    if (e.key === '+' || e.code === 'NumpadAdd') time.speed = Math.min(SPEEDS.length - 1, time.speed + 1);
    if (e.key === '-' || e.code === 'NumpadSubtract') time.speed = Math.max(0, time.speed - 1);
    if (e.code === 'KeyM') threatPanel.toast(sound.toggleMute() ? 'Sound off' : 'Sound on');
    // Felsökning: F7 = debugruta, F8 = blockerade rutor, F9 = flödesfältet.
    if (e.code === 'F7') {
      e.preventDefault();
      $('debug').hidden = !$('debug').hidden;
    }
    if (e.code === 'F8') {
      e.preventDefault();
      view.toggleBlockedCells();
    }
    if (e.code === 'F9') {
      e.preventDefault();
      view.toggleFlowField();
    }
    // Bara i dev: N = en trupp med åtta Mantis vid en slumpad spawnpunkt.
    if (import.meta.env.DEV && e.code === 'KeyN') {
      spawnSquad(world, Array(8).fill('mantis'), Math.floor(Math.random() * world.map.spawns.length));
    }
  });

  // Felsökning i webbläsarkonsolen (bara i dev): game.world, game.tick(100).
  if (import.meta.env.DEV) {
    window.game = {
      world,
      selection,
      view,
      /** Tid per del av bildrutan (ms), som i debugrutan. */
      get profile() { return Object.fromEntries(profiler.report().map(([k, v]) => [k, +v.toFixed(2)])); },
      ui,
      time,
      /** Skapar en trupp med `n` fiender av `type` vid spawnpunkt `spawnIndex`. */
      spawn(n = 1, type = 'mantis', spawnIndex = 0) {
        return spawnSquad(world, Array(n).fill(type), spawnIndex).id;
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

    const gameSeconds = time.paused ? 0 : frameSeconds * SPEEDS[time.speed];
    const { ticks, alpha } = step.advance(gameSeconds);
    measure('sim', () => { for (let i = 0; i < ticks; i++) tickWorld(world); });

    // Begränsa så att en lång frame (t.ex. efter en bakgrundsflik) inte ger ett jättehopp.
    cameraInput.update(Math.min(frameSeconds, 0.1));
    selectionInput.prune();

    const ndc = cameraInput.mouseNdc();
    buildInput.update(ndc);
    for (const ev of world.events) {
      if (ev.type === 'defeat') showGameOver(ev.elapsed);
      if (ev.type === 'acuDeath') threatPanel.toast(`ACU destroyed! Respawning in ${ev.seconds} s`);
      if (ev.type === 'acuRespawn') threatPanel.toast('ACU respawned at the Quantum Gateway');
      if (ev.type === 'enhanced' && ev.owner === PLAYER_ID) threatPanel.toast(`Upgrade complete: ${enhancements[ev.enhancement].name}`);
    }
    measure('sound', () => sound.handleEvents(world.events, view.rig.target));
    view.render(world, alpha, selection, time.paused ? 0 : frameSeconds, measure);

    const hovered = measure('hover pick', () => ndc && !ui.placing && getEntity(world, view.pickEntityAtNdc(ndc.x, ndc.y)));
    hoverInfo.update(hovered, hovered && view.entityLabelScreenPos(hovered));
    resources.update(world.players[PLAYER_ID].economy, ownCounts(world));
    measure('command panel', () => commandPanel.update(world, selection, ui));
    modeHint.hidden = ui.mode !== 'patrol';
    measure('threat panel', () => threatPanel.update(world, { respawnIn: acuRespawnIn(world) }));
    measure('selection info', () => selectionInfo.update(world, selection, ui));
    measure('idle panel', () => idlePanel.update(world));
    measure('acu button', () => acuButton.update(world, selection));
    measure('minimap', () => minimap.update());

    const speed = SPEEDS[time.speed];
    speedHint.hidden = !time.paused && speed === 1;
    speedHint.textContent = time.paused ? 'PAUSED' : `Speed ${speed}×`;

    if (!$('debug').hidden) {
      const cursor = ndc && view.pickAtNdc(ndc.x, ndc.y);
      debug.update(world, frameSeconds, [
        ...profiler.report().map(([name, ms]) => `${name.padEnd(15)}${ms.toFixed(1)} ms`),
        `zoom ${view.rig.distance.toFixed(0)}${view.isStrategic() ? ' (strategic)' : ''}`,
        cursor
          ? `mouse ${cursor.x.toFixed(1)}, ${cursor.z.toFixed(1)}  h ${cursor.y.toFixed(2)}`
          : 'mouse -',
      ]);
    }
    profiler.endFrame(frameSeconds);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Startmeny först; i dev kan `?quick` hoppa direkt in i första kartan.
const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has('quick')) {
  startGame({ map: maps[0], difficulty: gameConfig.difficulty });
} else {
  showStartMenu($('menu'), maps, { difficulty: gameConfig.difficulty }).then((settings) => {
    sound.init(); // Start-klicket är en användarhandling, så ljud får spelas
    startGame(settings);
  });
}
