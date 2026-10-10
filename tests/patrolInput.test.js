import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld, PLAYER_ID } from '../src/sim/world.js';
import { createSelectionInput } from '../src/input/selection.js';
import firstDefense from '../src/data/maps/firstDefense.js';

/** Webbläsarhändelse utan DOM: bara de fält som markeringen läser. */
const event = (type, props) => Object.assign(new Event(type), props);

describe('patrulläge (P)', () => {
  let world;
  let canvas;
  let ui;
  let selection;

  beforeEach(() => {
    globalThis.window = new EventTarget();
    canvas = Object.assign(new EventTarget(), {
      clientWidth: 100,
      clientHeight: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    });
    const view = {
      pickAtNdc: (x, y) => ({ x: 50 + x * 10, z: 50 - y * 10 }),
      pickEntityAtNdc: () => null,
      entityScreenPos: () => ({ x: -1, y: -1 }),
    };
    world = createWorld({ map: firstDefense });
    selection = new Set([world.acuId]);
    ui = { mode: 'patrol', patrolPlaced: false };
    createSelectionInput(canvas, { hidden: true, style: {} }, view, world, selection, ui);
  });

  const press = (x, y, shiftKey) => {
    canvas.dispatchEvent(event('mousedown', { button: 0, clientX: x, clientY: y, shiftKey }));
    window.dispatchEvent(event('mouseup', { button: 0, clientX: x, clientY: y, shiftKey }));
  };
  const patrols = () => world.commands.filter((c) => c.type === 'patrol');

  it('Shift-klick lägger punkter och läget ligger kvar medan Shift hålls', () => {
    press(20, 20, true);
    press(20, 80, true);
    expect(patrols()).toHaveLength(2);
    expect(ui.mode).toBe('patrol');
  });

  it('när Shift släpps efter punkterna blir nästa dragning en vanlig markering', () => {
    press(20, 20, true);
    press(20, 80, true);
    window.dispatchEvent(event('keyup', { key: 'Shift' }));
    expect(ui.mode).toBe(null);
    press(60, 10, false);
    expect(patrols()).toHaveLength(2);
    expect(selection.has(world.acuId)).toBe(false); // klick i tomma luften avmarkerar
  });

  it('Shift som släpps innan någon punkt lagts avbryter inte läget', () => {
    window.dispatchEvent(event('keyup', { key: 'Shift' }));
    expect(ui.mode).toBe('patrol');
    press(20, 20, false);
    expect(patrols()).toHaveLength(1);
    expect(patrols()[0].ids).toEqual([world.acuId]);
    expect(ui.mode).toBe(null);
  });

  it('köad patrull skickas med queue', () => {
    press(20, 20, true);
    expect(patrols()[0]).toMatchObject({ owner: PLAYER_ID, queue: true });
  });
});
