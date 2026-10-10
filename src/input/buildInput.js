import { queueCommand } from '../sim/commands.js';
import { PLAYER_ID } from '../sim/constants.js';
import { canPlace, snapBuildPosition } from '../sim/placement.js';
import units from '../data/units.js';

/** Markerade egna enheter som kan bygga `type`. */
export function buildersFor(world, selection, type) {
  return world.entities.filter((e) =>
    selection.has(e.id) && e.owner === PLAYER_ID && e.kind === 'unit' &&
    units[e.type].builds?.includes(type));
}

/**
 * Placeringsläge: `ui.placing = { type }` medan spelaren väljer var en byggnad ska stå.
 * Vänsterklick placerar (Shift: fortsätt placera och köa), högerklick/Esc avbryter.
 * Måste skapas före markeringsinmatningen så att den hinner fånga klicken.
 */
export function createBuildInput(canvas, view, world, selection, ui) {
  const toNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1,
    };
  };

  /** Fäst position och om den är giltig, för en skärmpunkt i NDC. */
  function placementAt(ndc) {
    const ground = view.pickAtNdc(ndc.x, ndc.y);
    if (!ground) return null;
    const pos = snapBuildPosition(world, ui.placing.type, ground.x, ground.z);
    return { pos, ok: canPlace(world, ui.placing.type, pos.x, pos.z).ok };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!ui.placing) return;
    e.stopImmediatePropagation();
    if (e.button === 2) {
      ui.placing = null;
      return;
    }
    if (e.button !== 0) return;

    const placement = placementAt(toNdc(e));
    if (!placement?.ok) return;
    const { type } = ui.placing;
    queueCommand(world, {
      type: 'build',
      owner: PLAYER_ID,
      ids: buildersFor(world, selection, type).map((b) => b.id),
      structure: type,
      x: placement.pos.x,
      z: placement.pos.z,
      queue: e.shiftKey,
    });
    if (e.shiftKey) ui.placing.queued = true;
    else ui.placing = null;
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') ui.placing = null;
  });
  // Släpper man Shift efter att ha köat byggen avslutas placeringen, som i SupCom.
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && ui.placing?.queued) ui.placing = null;
  });

  return {
    /** Uppdaterar förhandsvisningen. Anropas varje frame. */
    update(mouseNdc) {
      if (ui.placing && buildersFor(world, selection, ui.placing.type).length === 0) {
        ui.placing = null;
      }
      const placement = ui.placing && mouseNdc && placementAt(mouseNdc);
      if (!placement) {
        view.setPlacementGhost(null);
        return;
      }
      view.setPlacementGhost(ui.placing.type, placement.pos, placement.ok);
    },
  };
}
