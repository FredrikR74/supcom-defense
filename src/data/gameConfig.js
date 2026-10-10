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
   * Fiendens strömmande tryck (se sim/director.js). Inkomst i mass per sekund:
   * baseRate × (1 + growthPerMinute × minuter) ^ growthExponent, gånger
   * svårighetsgradens multiplikator (×0,1 vid 0, ×1 vid 50, ×10 vid 100).
   * Spelet tar aldrig slut: trycket växer tills kärnan faller.
   */
  director: {
    /** Lugn början innan första fienden. */
    graceSeconds: 60,
    /** Fiendens inkomst när lugnet är slut. */
    baseRate: 1,
    /** Tillväxt per minut. Med exponenten 1,5 blir det ~15 mass/s efter 10 min. */
    growthPerMinute: 0.5,
    growthExponent: 1.5,
    /** Hur ofta fienden byter spawnpunkt. */
    spawnSwitchSeconds: 30,
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
