/**
 * Ikoner för byggmenyn (SVG, 40×40). Egen design i FA:s anda: en enkel bild
 * av byggnaden eller uppgraderingen i lagfärg, med massgrönt och energigult
 * där det hör till. FA:s egna ikoner används inte.
 */

const TEAM = '#60a5fa';
const DARK = '#1e3a5f';
const MASS = '#a3e635';
const ENERGY = '#facc15';
const RED = '#f87171';
const LINE = 'stroke="#0b1220" stroke-width="1.2" stroke-linejoin="round"';

const svg = (body) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;

const ICONS = {
  // Fabrikshall med sågtandstak och port.
  landFactory: svg(`
    <path d="M5 33V17l7-5v5l7-5v5l7-5v5l9-3v19z" fill="${TEAM}" ${LINE}/>
    <rect x="14" y="23" width="12" height="10" fill="${DARK}" ${LINE}/>
    <path d="M14 26h12M14 29h12" stroke="${TEAM}" stroke-width="1"/>`),
  // Borrtorn över en grön fyndighet.
  massExtractor: svg(`
    <ellipse cx="20" cy="32" rx="14" ry="4" fill="${MASS}" opacity="0.55"/>
    <path d="M12 31l4-20h8l4 20z" fill="${TEAM}" ${LINE}/>
    <rect x="15" y="7" width="10" height="5" fill="${DARK}" ${LINE}/>
    <path d="M20 13v16" stroke="${MASS}" stroke-width="2.5"/>`),
  // Kraftverk med blixt.
  powerGenerator: svg(`
    <rect x="7" y="12" width="26" height="21" rx="2" fill="${TEAM}" ${LINE}/>
    <rect x="11" y="7" width="6" height="6" fill="${DARK}" ${LINE}/>
    <path d="M22 14l-7 10h5l-2 8 8-11h-5l3-7z" fill="${ENERGY}" ${LINE}/>`),
  // Cylindrisk tank med massgröna band.
  massStorage: svg(`
    <path d="M9 11v19c0 2.5 5 4 11 4s11-1.5 11-4V11" fill="${TEAM}" ${LINE}/>
    <ellipse cx="20" cy="11" rx="11" ry="4" fill="${DARK}" ${LINE}/>
    <path d="M9 18c0 2.5 5 4 11 4s11-1.5 11-4M9 25c0 2.5 5 4 11 4s11-1.5 11-4" fill="none" stroke="${MASS}" stroke-width="2"/>`),
  // Batteri med energigula celler.
  energyStorage: svg(`
    <rect x="9" y="9" width="22" height="25" rx="2" fill="${TEAM}" ${LINE}/>
    <rect x="15" y="5" width="10" height="4" fill="${DARK}" ${LINE}/>
    <rect x="12" y="13" width="16" height="5" fill="${ENERGY}"/>
    <rect x="12" y="20" width="16" height="5" fill="${ENERGY}"/>
    <rect x="12" y="27" width="16" height="4" fill="${ENERGY}" opacity="0.4"/>`),
  // Murblock.
  wall: svg(`
    <path d="M4 16h32v17H4z" fill="${TEAM}" ${LINE}/>
    <path d="M4 22h32M4 28h32M12 16v6M24 16v6M18 22v6M30 22v6M12 28v5M24 28v5" stroke="${DARK}" stroke-width="1.5"/>
    <path d="M4 16l3-4h26l3 4" fill="${DARK}" ${LINE}/>`),
  // Kanontorn med eldrör.
  pointDefense: svg(`
    <path d="M8 34l3-10h18l3 10z" fill="${DARK}" ${LINE}/>
    <circle cx="20" cy="20" r="8" fill="${TEAM}" ${LINE}/>
    <path d="M24 17l12-6v4l-11 6z" fill="${TEAM}" ${LINE}/>
    <circle cx="20" cy="20" r="2.5" fill="${RED}"/>`),

  // Uppgraderingar
  // Kraftigare eldrör med laddningsringar.
  zephyrAmplifier: svg(`
    <path d="M5 24l20-10 4 7-20 10z" fill="${TEAM}" ${LINE}/>
    <path d="M25 14l8-4 3 6-7 5z" fill="${DARK}" ${LINE}/>
    <path d="M13 20l3 6M18 18l3 6" stroke="#67e8f9" stroke-width="2"/>
    <circle cx="35" cy="11" r="3" fill="#67e8f9" opacity="0.8"/>`),
  // Sköld med reparationskors.
  nanoRepair: svg(`
    <path d="M20 5l13 5v9c0 8-6 13-13 16C13 32 7 27 7 19v-9z" fill="${TEAM}" ${LINE}/>
    <path d="M17 12h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#4ade80" ${LINE}/>`),
  // Mass och energi som strömmar ut ur en kärna.
  resourceAllocation: svg(`
    <circle cx="20" cy="20" r="7" fill="${TEAM}" ${LINE}/>
    <path d="M20 13V4M14 7l6-4 6 4" fill="none" stroke="${MASS}" stroke-width="2.5"/>
    <path d="M20 27v9M14 33l6 4 6-4" fill="none" stroke="${ENERGY}" stroke-width="2.5"/>
    <path d="M13 20H4M27 20h9" stroke="${MASS}" stroke-width="2"/>
    <circle cx="20" cy="20" r="3" fill="${ENERGY}"/>`),
};

/** SVG för `key` (byggnad eller uppgradering), eller en tom ram. */
export function buildIcon(key) {
  return ICONS[key] ?? svg(`<rect x="8" y="8" width="24" height="24" fill="${TEAM}" ${LINE}/>`);
}
