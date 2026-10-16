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
  /**
   * Vrakets mass som i FAF (Unit.CreateWreckageProp): kostnad × MassMult (0,9)
   * × tech-faktor (T1 0,9, T2 0,8, T3 0,7, experimentell 0,6) × byggnadsgrad.
   */
  wreckMassMult: 0.9,
  wreckTechMult: { TECH1: 0.9, TECH2: 0.8, TECH3: 0.7, EXPERIMENTAL: 0.6 },
  /** Reparation kostar som att bygga den saknade delen (FA-motorn), gånger denna faktor. */
  repairCostMult: 1,

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
    /**
     * Budgeten sparas ihop till vågor. Pausen mellan vågorna slumpas i det här
     * intervallet och visas inte för spelaren (organiska vågor).
     */
    waveSeconds: { min: 20, max: 45 },
    /** Största truppen; en större våg delas upp i flera trupper. */
    maxSquadSize: 24,
    maxSquadsPerWave: 6,
    /** Truppen samlas så här länge framför gatewayen innan den marscherar. */
    musterSeconds: 3,
    /**
     * Nya fiender är osårbara så här länge (samlingen plus en sekund), så att
     * spelaren inte kan campa vid gatewayen (tower defense-avsteg från FA).
     */
    spawnShieldSeconds: 4,
    /**
     * Fiendetyper (Cybran T1 och T2), vikt och från vilken minut de kan komma.
     * T2 kommer när en spelare i FA brukar ha en T2-fabrik.
     */
    unitPool: [
      { type: 'mole', weight: 2 },
      { type: 'mantis', weight: 6 },
      { type: 'medusa', weight: 2, fromMinute: 4 },
      { type: 'rhino', weight: 3, fromMinute: 10 },
      { type: 'hoplite', weight: 2, fromMinute: 12 },
      { type: 'wagner', weight: 2, fromMinute: 14 },
      { type: 'viper', weight: 1, fromMinute: 16 },
    ],
  },
  /**
   * Spelaren får inte bygga närmare en fiendes gateway än så här (mitt till
   * byggnadens kant), så att man inte kan bygga en bas vid fiendens spawnpunkt.
   */
  gatewayNoBuildRadius: 20,
  /** ACU:n återuppstår vid kärnan efter så här många sekunder (tower defense-avsteg från FA). */
  acuRespawnSeconds: 30,
  /** Svårighetsgrad 0–100 vid start (kan ändras under spelet). */
  difficulty: 50,

  /**
   * Fiendens målval och planering (se sim/enemyAi.js). Ett mål är värt
   * (hur mycket skada det gör på skytten per sekund + ett strategiskt värde),
   * delat med de HP som är kvar när skotten som redan är på väg har slagit ner.
   * Värdena nedan är i samma enhet som skada per sekund.
   */
  enemyAi: {
    values: {
      /** Radar: ta ut spelarens ögon. */
      radar: 60,
      /** Sköldgenerator: utan den slutar allt bakom skölden att vara skyddat. */
      shield: 40,
      /** Ingenjörer och ACU:n bygger och reparerar försvaret. */
      builder: 25,
      factory: 15,
      economy: 10,
      other: 5,
      /** Kärnan: värd mest av byggnaderna utan vapen (hela spelets mål). */
      core: 1500,
    },
    /** Poängen delas med (1 + avståndet × detta), så närmare mål vinner vid lika. */
    distanceFalloff: 0.03,
    /** Ett mål som redan dör av skotten på väg dit får poängen gånger detta (ingen överdödning). */
    overkillFactor: 0.05,
    /** Ett nytt mål måste vara så här mycket bättre för att skytten ska byta. */
    switchMargin: 1.25,
    /** Skyttarna väljer om mål så här ofta (tick). */
    retargetTicks: 5,
    /** Truppen ser efter hinder så här många rutor framåt längs vägen. */
    lookaheadCells: 30,
    /** Truppen går så här långt ur vägen för att ta ut en radar den känner till. */
    radarDetour: 20,
    /** Högst så många enheter skickas mot en radar. */
    raidSize: 2,
    /**
     * Vägarnas hotkostnad: en ruta som en känd fientlig försvarsbyggnad når
     * kostar (1 + dps × detta) gånger så mycket att gå igenom. Fienden går
     * därför runt en dödszon om omvägen är kort, men rakt igenom om den är lång.
     */
    threatCostPerDps: 0.012,
  },
};
