/** Övergripande spelinställningar. */
export default {
  /**
   * I FA ger spelet armén ACU:ns lager vid start (ACUUnit.GiveInitialResources),
   * och lagret är ACU:ns StorageMass/StorageEnergy: 650 mass och 3900 energi.
   */
  startingResources: { mass: 650, energy: 3900 },
  baseStorage: { mass: 650, energy: 3900 },
  /** Andel av den förbrukade massan man får tillbaka när man säljer en byggnad. */
  sellRefund: 0.5,
  /** Andel av en enhets/byggnads massa som blir kvar i vraket. */
  wreckMassFraction: 0.5,

  /**
   * Fiendens strömmande tryck (se sim/director.js). Rate i mass per sekund vid
   * svårighetsgrad 50; svårighetsgraden multiplicerar (×0,1 vid 0, ×10 vid 100).
   */
  director: {
    /** Lugn början innan första fienden. */
    graceSeconds: 60,
    /** Fiendens inkomst när lugnet är slut. */
    baseRate: 0.6,
    /** Hur mycket inkomsten ökar per minut. */
    growthPerMinute: 0.6,
    /** Hur ofta fienden byter spawnpunkt. */
    spawnSwitchSeconds: 30,
    /** Överlev så här länge för att vinna. */
    survivalSeconds: 20 * 60,
    /** Fiendetyper (Cybran T1), vikt och från vilken minut de kan komma. */
    unitPool: [
      { type: 'mole', weight: 2 },
      { type: 'mantis', weight: 6 },
      { type: 'medusa', weight: 2, fromMinute: 4 },
    ],
  },
  /** Svårighetsgrad 0–100 vid start (kan ändras under spelet). */
  difficulty: 50,
};
