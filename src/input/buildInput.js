import { queueCommand } from '../sim/commands.js';
import { PLAYER_ID } from '../sim/constants.js';
import { canPlace, snapBuildPosition, lineOfPlacements } from '../sim/placement.js';
import structures from '../data/structures.js';
import units from '../data/units.js';

/** Markerade egna enheter som kan bygga `type`. */
export function buildersFor(world, selection, type) {
  return world.entities.filter((e) =>
    selection.has(e.id) && e.owner === PLAYER_ID && e.kind === 'unit' &&
    units[e.type].builds?.includes(type));
}

/**
 * Placeringsläge: `ui.placing = { type }` medan spelaren väljer var en byggnad ska stå.
 * - Vänsterklick placerar en byggnad.
 * - Shift+klick köar och stannar kvar i placeringsläget.
 * - Shift+dra lägger ut en rad byggnader från startpunkten till musen.
 * - Högerklick/Esc avbryter, och släppt Shift avslutar efter köade byggen.
 * Måste skapas före markeringsinmatningen så att den hinner fånga klicken.
 */
/** Varför en plats nekas (canPlace:s `reason`), som text för spelaren. */
const REASON_TEXT = {
  occupied: 'Something is already here',
  'too steep': 'Ground is too steep',
  'requires mass deposit': 'Must be built on a mass deposit',
  'covers mass deposit': 'Would cover a mass deposit',
  'too close to enemy gateway': 'Too close to an enemy gateway',
  'blocks enemy path': "Would block the enemy's only path",
  'outside map': 'Outside the map',
};

export function createBuildInput(canvas, view, world, selection, ui) {
  /** Startpunkt (fäst mittpunkt) för en pågående Shift+dra-rad. */
  let lineStart = null;
  /** Text vid muspekaren som säger varför spöket är rött. */
  const reasonTip = document.createElement('div');
  reasonTip.className = 'place-reason';
  reasonTip.hidden = true;
  document.body.appendChild(reasonTip);

  const toNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1,
    };
  };

  /** Fäst byggposition för en skärmpunkt i NDC, eller null. */
  function snappedAt(ndc) {
    const ground = view.pickAtNdc(ndc.x, ndc.y);
    return ground ? snapBuildPosition(world, ui.placing.type, ground.x, ground.z) : null;
  }

  /** Byggplatser (med giltighet) för nuvarande läge: en, eller en hel rad vid Shift+dra. */
  function placementsAt(ndc) {
    const pos = snappedAt(ndc);
    if (!pos) return [];
    const { type } = ui.placing;
    const positions = lineStart ? lineOfPlacements(lineStart, pos, structures[type].size) : [pos];
    return positions.map((p) => {
      const { ok, reason } = canPlace(world, type, p.x, p.z);
      return { pos: p, ok, reason };
    });
  }

  function queueBuilds(placements, queue) {
    const { type } = ui.placing;
    const ids = buildersFor(world, selection, type).map((b) => b.id);
    placements.forEach(({ pos, ok }, i) => {
      if (!ok) return;
      queueCommand(world, {
        type: 'build',
        owner: PLAYER_ID,
        ids,
        structure: type,
        x: pos.x,
        z: pos.z,
        queue: queue || i > 0,
      });
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!ui.placing) return;
    e.stopImmediatePropagation();
    if (e.button === 2) {
      ui.placing = null;
      lineStart = null;
      return;
    }
    if (e.button !== 0) return;

    if (e.shiftKey) {
      // Shift: börja en rad; den placeras när knappen släpps.
      lineStart = snappedAt(toNdc(e));
      return;
    }
    queueBuilds(placementsAt(toNdc(e)), false);
    ui.placing = null;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !lineStart || !ui.placing) return;
    queueBuilds(placementsAt(toNdc(e)), true);
    lineStart = null;
    ui.placing.queued = true;
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      ui.placing = null;
      lineStart = null;
    }
  });
  // Släpper man Shift efter att ha köat byggen avslutas placeringen, som i SupCom.
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && ui.placing?.queued && !lineStart) ui.placing = null;
  });

  /** Visar varför platsen under pekaren (eller en plats i raden) nekas. */
  function showReason(placements, ndc) {
    const bad = placements[placements.length - 1]?.ok === false
      ? placements[placements.length - 1]
      : placements.find((p) => !p.ok);
    const text = bad ? REASON_TEXT[bad.reason] : null;
    reasonTip.hidden = !text;
    if (!text) return;
    if (reasonTip.textContent !== text) reasonTip.textContent = text;
    const r = canvas.getBoundingClientRect();
    reasonTip.style.left = `${r.left + ((ndc.x + 1) / 2) * r.width + 18}px`;
    reasonTip.style.top = `${r.top + ((1 - ndc.y) / 2) * r.height + 14}px`;
  }

  return {
    /** Uppdaterar förhandsvisningen. Anropas varje frame. */
    update(mouseNdc) {
      if (ui.placing && buildersFor(world, selection, ui.placing.type).length === 0) {
        ui.placing = null;
      }
      if (!ui.placing) lineStart = null;
      if (!ui.placing || !mouseNdc) {
        view.setPlacementGhosts(null);
        reasonTip.hidden = true;
        return;
      }
      const placements = placementsAt(mouseNdc);
      view.setPlacementGhosts(ui.placing.type, placements);
      showReason(placements, mouseNdc);
    },
  };
}
