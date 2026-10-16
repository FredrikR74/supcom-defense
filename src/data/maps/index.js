import firstDefense from './firstDefense.js';
import crossroads from './crossroads.js';
import mountainPass from './mountainPass.js';
import highlands from './highlands.js';
import mountainPassTest from './mountainPassTest.js';

/**
 * Alla kartor som går att välja i startmenyn. Testkartan finns bara i
 * utvecklingsläget (Vite dev-servern på localhost och i testerna), inte i
 * den publicerade versionen.
 */
export default [firstDefense, crossroads, mountainPass, highlands, ...(import.meta.env.DEV ? [mountainPassTest] : [])];
