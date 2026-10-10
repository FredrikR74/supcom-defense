import { queueCommand } from '../sim/commands.js';
import { PLAYER_ID } from '../sim/constants.js';

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
    if (e.owner !== owner) return false;
    const p = toScreen(e);
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  });
  const units = inside.filter((e) => e.kind === 'unit');
  return (units.length > 0 ? units : inside).map((e) => e.id);
}

/**
 * Vänsterklick/dra markerar, högerklick ger flyttorder eller assist (Shift köar).
 * `selection` är ett Set med entitets-id:n.
 */
export function createSelectionInput(canvas, boxEl, view, world, selection) {
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
    if (e.button === 0) {
      drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey, active: false };
    } else if (e.button === 2) {
      const ids = [...selection];
      if (ids.length === 0) return;
      const ndc = toNdc(p);
      // Högerklick på en egen ofärdig byggnad: hjälp till att bygga den.
      const targetId = view.pickEntityAtNdc(ndc.x, ndc.y);
      const target = world.entities.find((ent) => ent.id === targetId);
      if (target?.kind === 'structure' && target.owner === PLAYER_ID && !target.built) {
        queueCommand(world, { type: 'assist', owner: PLAYER_ID, ids, targetId, queue: e.shiftKey });
        return;
      }
      const ground = view.pickAtNdc(ndc.x, ndc.y);
      if (!ground) return;
      queueCommand(world, {
        type: 'move',
        owner: PLAYER_ID,
        ids,
        x: ground.x,
        z: ground.z,
        queue: e.shiftKey,
      });
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
    } else {
      const ndc = toNdc({ x: drag.x0, y: drag.y0 });
      const id = view.pickEntityAtNdc(ndc.x, ndc.y);
      const own = world.entities.find((ent) => ent.id === id && ent.owner === PLAYER_ID);
      if (own) select([own.id], drag.shift);
      else if (!drag.shift) selection.clear();
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
