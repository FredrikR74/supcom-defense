/**
 * Ikoner för bygg- och fabriksmenyn (SVG, 40×40). Egen design i FA:s anda: en
 * enkel bild av byggnaden, enheten eller uppgraderingen i lagfärg, med
 * massgrönt och energigult där det hör till. FA:s egna ikoner används inte.
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

  // ACU:n: bred robot med kanonarm och byggarm.
  acu: svg(`
    <rect x="12" y="8" width="16" height="15" rx="3" fill="${TEAM}" ${LINE}/>
    <rect x="16" y="11" width="8" height="4" fill="#67e8f9"/>
    <path d="M12 12H6v10h6M28 12h6v10h-6" fill="${DARK}" ${LINE}/>
    <path d="M6 22v6M34 22v7" stroke="${DARK}" stroke-width="3"/>
    <circle cx="34" cy="31" r="2" fill="${ENERGY}"/>
    <path d="M15 23l-3 12M25 23l3 12" stroke="${DARK}" stroke-width="4" stroke-linecap="round"/>`),

  // Enheter från fabriken
  // Ingenjörsfordon med byggarm.
  engineer: svg(`
    <rect x="7" y="20" width="22" height="10" rx="2" fill="${TEAM}" ${LINE}/>
    <path d="M18 20l6-9 9 3" fill="none" stroke="${ENERGY}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="33" cy="14" r="2.5" fill="${ENERGY}"/>
    <circle cx="11" cy="32" r="3" fill="${DARK}" ${LINE}/><circle cx="25" cy="32" r="3" fill="${DARK}" ${LINE}/>`),
  // Lätt spaningsfordon med radarskål.
  snoop: svg(`
    <path d="M6 28l4-7h18l6 7z" fill="${TEAM}" ${LINE}/>
    <path d="M18 21v-7" stroke="${DARK}" stroke-width="2"/>
    <path d="M11 10a8 6 0 0 0 14 0" fill="none" stroke="#67e8f9" stroke-width="2.5"/>
    <circle cx="11" cy="31" r="3" fill="${DARK}" ${LINE}/><circle cx="28" cy="31" r="3" fill="${DARK}" ${LINE}/>`),
  // Tvåbent robot med gevär.
  mechMarine: svg(`
    <rect x="13" y="9" width="12" height="12" rx="2" fill="${TEAM}" ${LINE}/>
    <rect x="16" y="12" width="6" height="3" fill="#67e8f9"/>
    <path d="M15 21l-4 13M23 21l4 13" stroke="${DARK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M25 15h11" stroke="${DARK}" stroke-width="3"/>`),
  // Stridsvagn med torn och kanon.
  striker: svg(`
    <rect x="4" y="24" width="30" height="9" rx="3" fill="${DARK}" ${LINE}/>
    <path d="M7 24l3-6h18l3 6z" fill="${TEAM}" ${LINE}/>
    <rect x="13" y="13" width="11" height="6" rx="1" fill="${TEAM}" ${LINE}/>
    <path d="M24 15h13" stroke="${DARK}" stroke-width="3"/>`),
  // Artilleri med högt riktat eldrör.
  lobo: svg(`
    <rect x="5" y="25" width="28" height="8" rx="3" fill="${DARK}" ${LINE}/>
    <path d="M8 25l2-6h18l2 6z" fill="${TEAM}" ${LINE}/>
    <path d="M18 20l12-14" stroke="${DARK}" stroke-width="3.5"/>
    <path d="M30 6l3-3" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`),
  // Luftvärn med dubbla eldrör uppåt.
  archer: svg(`
    <rect x="5" y="25" width="28" height="8" rx="3" fill="${DARK}" ${LINE}/>
    <path d="M9 25l2-6h16l2 6z" fill="${TEAM}" ${LINE}/>
    <path d="M15 19l4-14M22 19l4-14" stroke="${DARK}" stroke-width="2.5"/>
    <path d="M12 7l4 2M26 4l2 4" stroke="#67e8f9" stroke-width="1.5"/>`),

  // T2 och T3
  // Fabrikshall med kommandotorn och dubbla ränder.
  landFactoryT2: svg(`
    <path d="M5 33V17l7-5v5l7-5v5l7-5v5l9-3v19z" fill="${TEAM}" ${LINE}/>
    <rect x="6" y="5" width="6" height="12" fill="${DARK}" ${LINE}/>
    <rect x="7" y="8" width="4" height="2" fill="#67e8f9"/>
    <rect x="14" y="23" width="12" height="10" fill="${DARK}" ${LINE}/>
    <path d="M14 26h12M14 29h12" stroke="${TEAM}" stroke-width="1"/>
    <path d="M27 21h7M27 24h7" stroke="${DARK}" stroke-width="1.5"/>`),
  // Högre borrtorn med pumpkrona.
  massExtractorT2: svg(`
    <ellipse cx="20" cy="33" rx="14" ry="4" fill="${MASS}" opacity="0.55"/>
    <path d="M11 32l4-17h10l4 17z" fill="${TEAM}" ${LINE}/>
    <rect x="15" y="9" width="10" height="6" fill="${DARK}" ${LINE}/>
    <rect x="17" y="4" width="6" height="5" fill="${TEAM}" ${LINE}/>
    <path d="M20 16v14" stroke="${MASS}" stroke-width="2.5"/>
    <path d="M13 24h14" stroke="${DARK}" stroke-width="1.5"/>`),
  massExtractorT3: svg(`
    <ellipse cx="20" cy="34" rx="15" ry="4" fill="${MASS}" opacity="0.7"/>
    <path d="M10 33l4-18h12l4 18z" fill="${TEAM}" ${LINE}/>
    <rect x="14" y="9" width="12" height="6" fill="${DARK}" ${LINE}/>
    <rect x="16" y="3" width="8" height="6" fill="${TEAM}" ${LINE}/>
    <path d="M20 16v15" stroke="${MASS}" stroke-width="3"/>
    <path d="M12 22h16M12 27h16" stroke="${DARK}" stroke-width="1.5"/>`),
  // Fusionsreaktor: kupol med glödande ring och kyltorn.
  powerGeneratorT2: svg(`
    <rect x="4" y="26" width="32" height="8" rx="2" fill="${DARK}" ${LINE}/>
    <path d="M10 27a10 10 0 0 1 20 0z" fill="${TEAM}" ${LINE}/>
    <path d="M11 24h18" stroke="${ENERGY}" stroke-width="2.5"/>
    <circle cx="20" cy="15" r="2.5" fill="${ENERGY}"/>
    <path d="M4 26l2-12h4l2 12M28 26l2-12h4l2 12" fill="${TEAM}" ${LINE}/>`),
  // Kub med massgrön kärna i en bur.
  massFabricator: svg(`
    <rect x="8" y="18" width="24" height="15" rx="2" fill="${TEAM}" ${LINE}/>
    <path d="M12 18l4-10h8l4 10" fill="none" stroke="${DARK}" stroke-width="2"/>
    <path d="M20 8l6 6-6 6-6-6z" fill="${MASS}" ${LINE}/>
    <path d="M8 25h24" stroke="${DARK}" stroke-width="1.5"/>
    <path d="M14 29h4M22 29h4" stroke="${ENERGY}" stroke-width="2"/>`),
  // Torn med tre eldrör.
  pointDefenseT2: svg(`
    <path d="M6 35l3-10h22l3 10z" fill="${DARK}" ${LINE}/>
    <rect x="11" y="15" width="16" height="11" rx="2" fill="${TEAM}" ${LINE}/>
    <path d="M27 17h10M27 20.5h10M27 24h10" stroke="${DARK}" stroke-width="2.2"/>
    <circle cx="16" cy="20" r="2" fill="${RED}"/>`),
  // Långt artillerirör snett uppåt på en plattform.
  artilleryT2: svg(`
    <path d="M5 35l4-8h22l4 8z" fill="${DARK}" ${LINE}/>
    <rect x="12" y="19" width="15" height="9" rx="2" fill="${TEAM}" ${LINE}/>
    <path d="M22 21L36 5" stroke="${DARK}" stroke-width="4"/>
    <path d="M34 7l3-3" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`),
  // Pylon med sköldbubbla.
  shieldGenerator: svg(`
    <path d="M3 30a17 17 0 0 1 34 0" fill="#93c5fd" opacity="0.35" stroke="#93c5fd" stroke-width="1.5"/>
    <rect x="6" y="30" width="28" height="5" rx="1" fill="${DARK}" ${LINE}/>
    <path d="M16 30l2-16h4l2 16z" fill="${TEAM}" ${LINE}/>
    <circle cx="20" cy="12" r="3" fill="#67e8f9"/>`),
  // Större ingenjörsfordon med två byggarmar.
  engineerT2: svg(`
    <rect x="5" y="20" width="26" height="10" rx="2" fill="${TEAM}" ${LINE}/>
    <path d="M14 20l5-9 9 2M22 20l5-7 8 3" fill="none" stroke="${ENERGY}" stroke-width="2.3" stroke-linecap="round"/>
    <circle cx="28" cy="13" r="2" fill="${ENERGY}"/><circle cx="35" cy="16" r="2" fill="${ENERGY}"/>
    <circle cx="10" cy="32" r="3" fill="${DARK}" ${LINE}/><circle cx="26" cy="32" r="3" fill="${DARK}" ${LINE}/>`),
  // Tung stridsvagn med dubbla eldrör.
  pillar: svg(`
    <rect x="3" y="24" width="32" height="10" rx="3" fill="${DARK}" ${LINE}/>
    <path d="M6 24l3-7h20l3 7z" fill="${TEAM}" ${LINE}/>
    <rect x="11" y="11" width="14" height="7" rx="1" fill="${TEAM}" ${LINE}/>
    <path d="M25 13h13M25 16.5h13" stroke="${DARK}" stroke-width="2.4"/>`),
  // Robot med gatlingkanon.
  mongoose: svg(`
    <rect x="12" y="8" width="14" height="13" rx="2" fill="${TEAM}" ${LINE}/>
    <rect x="15" y="11" width="8" height="3" fill="#67e8f9"/>
    <path d="M14 21l-4 13M24 21l4 13" stroke="${DARK}" stroke-width="4" stroke-linecap="round"/>
    <rect x="25" y="14" width="5" height="6" fill="${DARK}" ${LINE}/>
    <path d="M30 15h8M30 17h8M30 19h8" stroke="${DARK}" stroke-width="1.2"/>`),
  // Svävande stridsvagn med pontoner.
  riptide: svg(`
    <path d="M3 28l3-6h28l3 6z" fill="${DARK}" ${LINE}/>
    <path d="M7 22l3-6h18l3 6z" fill="${TEAM}" ${LINE}/>
    <rect x="14" y="11" width="10" height="5" rx="1" fill="${TEAM}" ${LINE}/>
    <path d="M24 13h10" stroke="${DARK}" stroke-width="3.5"/>
    <path d="M8 32h6M26 32h6" stroke="#67e8f9" stroke-width="2"/>`),
  // Lastbil med missillåda.
  flapjack: svg(`
    <rect x="4" y="25" width="30" height="7" rx="2" fill="${DARK}" ${LINE}/>
    <rect x="26" y="17" width="9" height="8" fill="${TEAM}" ${LINE}/>
    <path d="M6 24l14-14 6 6-14 10z" fill="${TEAM}" ${LINE}/>
    <path d="M14 15l4 4M17 12l4 4" stroke="${RED}" stroke-width="2"/>
    <circle cx="9" cy="34" r="3" fill="${DARK}" ${LINE}/><circle cx="29" cy="34" r="3" fill="${DARK}" ${LINE}/>`),
  // Flakvagn med två grova rör.
  skyBoxer: svg(`
    <rect x="4" y="25" width="30" height="8" rx="3" fill="${DARK}" ${LINE}/>
    <path d="M8 25l2-7h18l2 7z" fill="${TEAM}" ${LINE}/>
    <path d="M14 18l5-14M22 18l5-14" stroke="${DARK}" stroke-width="3.5"/>
    <path d="M10 7l5 2M28 3l3 5" stroke="#67e8f9" stroke-width="1.5"/>`),
  // Svävare med sköldemitter.
  parashield: svg(`
    <path d="M4 22a16 14 0 0 1 32 0" fill="#93c5fd" opacity="0.3" stroke="#93c5fd" stroke-width="1.5"/>
    <path d="M6 31l3-6h22l3 6z" fill="${TEAM}" ${LINE}/>
    <path d="M20 25v-9" stroke="${DARK}" stroke-width="2"/>
    <circle cx="20" cy="14" r="3" fill="#67e8f9"/>
    <path d="M9 34h6M25 34h6" stroke="#67e8f9" stroke-width="2"/>`),

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

/** SVG för `key` (byggnad, enhet eller uppgradering), eller en tom ram. */
export function buildIcon(key) {
  return ICONS[key] ?? svg(`<rect x="8" y="8" width="24" height="24" fill="${TEAM}" ${LINE}/>`);
}
