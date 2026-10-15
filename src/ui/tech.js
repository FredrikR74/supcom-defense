/**
 * Tech-nivå i text, som FA skriver den i verktygstips ("T2 Heavy Tank"):
 * 'T1', 'T2', 'T3' eller 'EXP'. ACU:n och annat utan tech-nivå ger ''.
 */
const SHORT = { TECH1: 'T1', TECH2: 'T2', TECH3: 'T3', EXPERIMENTAL: 'EXP' };
/** Romerska siffror som på ikonerna i bygg- och markeringspanelen. */
const ROMAN = { TECH1: 'I', TECH2: 'II', TECH3: 'III', EXPERIMENTAL: 'IV' };

export const techShort = (def) => SHORT[def?.techCategory] ?? '';
export const techRoman = (def) => ROMAN[def?.techCategory] ?? '';

/** FA:s beskrivning med tech-nivån först, t.ex. "T2 Heavy Tank". */
export function techName(def) {
  const t = techShort(def);
  return t ? `${t} ${def.name}` : def.name;
}
