import { createSound, SAMPLE_SETS, WEAPON_SOUNDS } from '../ui/sound.js';
import units from '../data/units.js';
import structures from '../data/structures.js';

/**
 * Ljudtest för utveckling (/sounds.html, finns inte i den publicerade
 * versionen): alla ljud spelet använder, spelade precis som i en strid via
 * samma händelser som simuleringen skickar, plus varje råklipp för sig.
 * Reglagen flyttar ljudet åt sidan och bort, så att stereo och avståndsfilter
 * hörs.
 */
const sound = createSound();
const $ = (id) => document.getElementById(id);
const sections = $('sections');
const listener = { x: 0, z: 0 };
/** Fiendernas enheter (ägaren styr bara syntesen om ett klipp saknas). */
const CYBRAN = new Set(['mantis', 'mole', 'medusa', 'hunter']);

const nameOf = (type) => {
  const def = units[type] ?? structures[type];
  return def ? def.unitName ?? def.name : type;
};

/** Var ljudet ska låta: reglagen för sida och avstånd. */
function position() {
  const side = Number($('pan').value);
  const dist = Number($('dist').value);
  return { x: side, z: Math.sqrt(Math.max(0, dist * dist - side * side)) };
}

const play = (event) => sound.handleEvents([{ ...position(), ...event }], listener);

function section(title, items) {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  for (const { label, sub, onClick } of items) {
    const b = document.createElement('button');
    b.innerHTML = label + (sub ? `<small>${sub}</small>` : '');
    b.addEventListener('click', onClick);
    row.appendChild(b);
  }
  sections.append(h, row);
}

section('Weapons (in game)', Object.entries(WEAPON_SOUNDS).map(([type, w]) => ({
  label: nameOf(type),
  sub: w.kind,
  onClick: () => play({ type: 'fire', source: type, owner: CYBRAN.has(type) ? 2 : 1 }),
})));

section('Impacts (in game)', [
  { label: 'Hit', sub: 'direct fire', onClick: () => play({ type: 'hit', ballistic: false }) },
  { label: 'Artillery impact', sub: 'shell lands', onClick: () => play({ type: 'miss', ballistic: true }) },
]);

section('Explosions (in game)', [
  { label: 'Mole dies', sub: 'small unit', onClick: () => play({ type: 'death', kind: 'unit', size: units.mole.radius }) },
  { label: 'Mantis dies', sub: 'unit', onClick: () => play({ type: 'death', kind: 'unit', size: units.mantis.radius }) },
  { label: 'ACU dies', sub: 'large unit', onClick: () => play({ type: 'death', kind: 'unit', size: units.acu.radius }) },
  { label: 'Point Defense destroyed', sub: 'small structure', onClick: () => play({ type: 'death', kind: 'structure', size: 0.7 }) },
  { label: 'Land Factory destroyed', sub: 'large structure', onClick: () => play({ type: 'death', kind: 'structure', size: 2.8 }) },
]);

section('Voice', ['Commander down', 'Commander online'].map((text) => ({
  label: text,
  onClick: () => sound.say(text),
})));

for (const [set, names] of Object.entries(SAMPLE_SETS)) {
  section(`Raw clips: ${set}`, names.map((name) => ({ label: name, onClick: () => sound.playClip(name) })));
}

function showPosition() {
  const side = Number($('pan').value);
  $('panV').textContent = side === 0 ? 'center' : side < 0 ? `left ${-side}` : `right ${side}`;
  $('distV').textContent = $('dist').value;
}
$('pan').addEventListener('input', showPosition);
$('dist').addEventListener('input', showPosition);
showPosition();

// Ljud får bara startas från en användarhandling.
$('start').addEventListener('click', () => {
  sound.init();
  $('start').hidden = true;
  $('board').hidden = false;
});
