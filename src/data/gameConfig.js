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
};
