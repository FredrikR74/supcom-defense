import { queueCommand } from '../sim/commands.js';
import { PLAYER_ID } from '../sim/constants.js';
import { needsRepair, getDef } from '../sim/entities.js';

/** Hur långt musen måste dras (pixlar) innan det räknas som lådmarkering. */
const DRAG_THRESHOLD = 5;

/**
 * Id:n för `owner`s entiteter vars skärmposition ligger i rektangeln.
 * Finns det enheter i rutan väljs bara de (byggnader ignoreras), som i SupCom.
 */
export function selectInRect(entities, toScreen, rect, owner) {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  const inside = entities.filter((e) => {
    if (e.owner !== owner || (e.kind !== 'unit' && e.kind !== 'structure')) return false;
    const p = toScreen(e);
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  });
  // Som FA-motorn: bara det med bästa (lägsta) SelectionPriority i rutan väljs.
  const best = Math.min(...inside.map(selectionPriority));
  return inside.filter((e) => selectionPriority(e) === best).map((e) => e.id);
}

/**
 * FA:s General.SelectionPriority: stridsenheter 1 (standard), ACU och ingenjörer 3,
 * byggnader 5. En lådmarkering med blandat innehåll tar bara den lägsta.
 */
export function selectionPriority(e) {
  const def = getDef(e.type);
  return def?.selectionPriority ?? (e.kind === 'structure' ? 5 : 1);
}

/**
 * Vänsterklick/dra markerar. Högerklick ger flyttorder, fabrikswaypoint eller assist (Shift köar).
 * `selection` är ett Set med entitets-id:n.
 */
export function createSelectionInput(canvas, boxEl, view, world, selection, ui = {}) {
  let drag = null; // { x0, y0, x1, y1, shift, active }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toNdc = ({ x, y }) => ({
    x: (x / canvas.clientWidth) * 2 - 1,
    y: -(y / canvas.clientHeight) * 2 + 1,
  });

  function select(ids, additive) {
    if (!additive) selection.clear();
    if (additive && ids.length === 1 && selection.has(ids[0])) {
      selection.delete(ids[0]);
      return;
    }
    for (const id of ids) selection.add(id);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    const p = local(e);
    // Patrullläge (P): nästa klick på marken blir en patrullpunkt.
    if (ui.mode === 'patrol' && (e.button === 0 || e.button === 2)) {
      const ndc = toNdc(p);
      const ground = view.pickAtNdc(ndc.x, ndc.y);
      if (ground) {
        queueCommand(world, {
          type: 'patrol', owner: PLAYER_ID, ids: [...selection], x: ground.x, z: ground.z, queue: e.shiftKey,
        });
      }
      if (!e.shiftKey) ui.mode = null;
      return;
    }
    if (e.button === 0) {
      drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey, active: false };
    } else if (e.button === 2) {
      const ids = [...selection];
      if (ids.length === 0) return;
      const ndc = toNdc(p);
      // Högerklick på något eget som går att assistera: en ofärdig byggnad,
      // en annan enhet eller en fabrik. Simuleringen avgör vilka som kan hjälpa.
      const targetId = view.pickEntityAtNdc(ndc.x, ndc.y);
      const target = world.entities.find((ent) => ent.id === targetId);
      const assistable = target?.owner === PLAYER_ID && (
        target.kind === 'unit' ||
        (target.kind === 'structure' && (!target.built || target.rallyPoints)));
      // Högerklick på en fiende: anfall.
      if (target && target.owner !== PLAYER_ID && target.owner !== 0) {
        queueCommand(world, { type: 'attack', owner: PLAYER_ID, ids, targetId, queue: e.shiftKey });
        return;
      }
      // Högerklick på ett vrak: återvinn. På något eget skadat: reparera.
      if (target?.kind === 'wreck') {
        queueCommand(world, { type: 'reclaim', owner: PLAYER_ID, ids, targetId, queue: e.shiftKey });
        return;
      }
      if (target?.owner === PLAYER_ID && needsRepair(target) && ids.some((id) => id !== targetId)) {
        queueCommand(world, { type: 'repair', owner: PLAYER_ID, ids, targetId, queue: e.shiftKey });
        return;
      }
      const helpers = ids.filter((id) => id !== targetId);
      if (assistable && helpers.length > 0) {
        queueCommand(world, { type: 'assist', owner: PLAYER_ID, ids: helpers, targetId, queue: e.shiftKey });
        return;
      }
      const ground = view.pickAtNdc(ndc.x, ndc.y);
      if (!ground) return;
      // Enheter går dit, fabriker får en waypoint dit.
      const order = { owner: PLAYER_ID, ids, x: ground.x, z: ground.z, queue: e.shiftKey };
      queueCommand(world, { type: 'move', ...order });
      queueCommand(world, { type: 'setRally', ...order });
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const p = local(e);
    drag.x1 = p.x;
    drag.y1 = p.y;
    if (!drag.active && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > DRAG_THRESHOLD) {
      drag.active = true;
    }
    if (drag.active) {
      boxEl.hidden = false;
      boxEl.style.left = `${Math.min(drag.x0, drag.x1)}px`;
      boxEl.style.top = `${Math.min(drag.y0, drag.y1)}px`;
      boxEl.style.width = `${Math.abs(drag.x1 - drag.x0)}px`;
      boxEl.style.height = `${Math.abs(drag.y1 - drag.y0)}px`;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !drag) return;
    if (drag.active) {
      select(selectInRect(world.entities, (ent) => view.entityScreenPos(ent), drag, PLAYER_ID), drag.shift);
      ui.inspectId = null;
    } else {
      const ndc = toNdc({ x: drag.x0, y: drag.y0 });
      const id = view.pickEntityAtNdc(ndc.x, ndc.y);
      const picked = world.entities.find((ent) => ent.id === id);
      if (picked?.owner === PLAYER_ID) {
        select([picked.id], drag.shift);
        ui.inspectId = null;
      } else if (picked) {
        // Fiende eller vrak: visa den i infopanelen, men markera den inte.
        selection.clear();
        ui.inspectId = picked.id;
      } else if (!drag.shift) {
        selection.clear();
        ui.inspectId = null;
      }
    }
    boxEl.hidden = true;
    drag = null;
  });

  return {
    /** Tar bort id:n för entiteter som inte längre finns. */
    prune() {
      for (const id of selection) {
        if (!world.entities.some((e) => e.id === id)) selection.delete(id);
      }
    },
  };
}
