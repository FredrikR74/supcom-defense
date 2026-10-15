# SupCom Defense: plan

Ett single player-tower defense-spel i webbläsaren, med Supreme Commander: Forged Alliance-stil på grafik och enheter.

## Spelidé

- Du börjar med en **UEF Armored Command Unit (ACU)**, en **kärnbyggnad** (UEF Quantum Gateway) och FA:s startresurser: 650 mass och 3900 energi.
- Du bygger en bas med ekonomi, fabriker, enheter och försvar, och försvarar kärnan.
- Fienden (Cybran) har en **strömmande ekonomi** precis som du: enheter kommer hela tiden, och trycket växer utan gräns.
- Spelet tar aldrig slut. Det pågår **tills kärnan faller**, och målet är att hålla ut så länge som möjligt.

### Designval

| Fråga | Val |
|---|---|
| Hur byggs saker? | ACU och ingenjörer bygger som i FA (byggkraft, tar tid, kostnaden dras löpande) |
| Hur går fiender? | Mot kärnan via flödesfält. Byggnader blockerar, men man får aldrig stänga in kärnan helt |
| Fiendens tryck | Kontinuerligt och accelererande, med ett svårighetsreglage 0–100 |
| Vad händer om ACU:n dör? | Den återuppstår vid kärnan efter 30 s (avsteg från FA, där det är förlust) |
| Vinst eller förlust | Ingen vinst. Förlust när kärnan förstörs |

## Grundprinciper

1. **Små steg.** Varje steg tar ungefär 30 minuter till 2 timmar och slutar med något du kan **se eller testa**.
2. **Simulering och rendering hålls isär.** Spellogiken (`sim/`) körs i fasta tick (10 per sekund) och vet ingenting om Three.js. Renderingen (`render/`) läser bara simuleringens tillstånd och interpolerar mellan tick.
3. **Simuleringen är deterministisk.** Den använder en seedad slumpgenerator och aldrig `Math.random()` i `sim/`. Spelarens handlingar går in som kommandon som verkställs vid nästa tick.
4. **Varje steg har ett test.** Det är antingen ett automatiskt test (Vitest) eller en manuell kontroll i webbläsaren.
5. **All balans ligger i data.** Enheter, byggnader, kartor och fiendetryck definieras i `src/data/`.
6. **Bara riktiga FA-enheter och FA-byggnader.** Spelaren är **UEF** och fienderna är **Cybran**. Namn, roller och värden tas från FAF:s blueprints och spelkod (github.com/FAForever/fa). Avstånd skalas efter kartans storlek. Testet `tests/faNames.test.js` underkänner namn som inte finns på listan i `src/data/faNames.js`.
7. **All text i spelet är på engelska.** Kodkommentarer och planen är på svenska.

## Teknik

| Område | Val |
|---|---|
| Språk | JavaScript (ES-moduler) |
| Byggverktyg | Vite (`npm run dev`, `npm test`) |
| 3D | Three.js (`InstancedMesh` för fiender och vrak) |
| Tester | Vitest |
| UI | HTML och CSS ovanpå canvas |

```
src/
  main.js            // startmeny och spelloop
  sim/               // ren spellogik: world, commands, director, squads, pathing, unitPath, systems/
  render/            // Three.js: kamera, terräng, modeller, effekter
  input/             // kamera, markering, byggläge
  ui/                // paneler, minikarta, ljud, startmeny
  data/              // units, structures, maps, faNames, gameConfig
  devtools/          // modellvisaren (/models.html)
tests/
scripts/balance.mjs  // ofärdigt balansverktyg utan grafik
```

## Nuläge

Spelet är spelbart från start till förlust. Det har:
- **Bas:** byggande, fabriker med kö, ekonomi med upkeep, reparation, återvinning och patrull.
- **Strid:** FA-värden, veterancy och regen.
- **Fiender och vägar:** fiender som hittar vägen runt murar, och A* för egna enheter.
- **Spelet:** startmeny med två kartor, paus och spelhastighet, minikarta och ljud.
- **ACU-knapp och markeringspanel:** ACU-knappen uppe till vänster syns alltid, med hälsa, blinkar vid skada och visar nedräkningen när ACU:n är död. Vid flera markerade visar infopanelen en ruta per typ med antal och hälsa, och klick väljer bara den typen.
- **Bygg- och fabriksmeny i FA-stil:** flikar (Build och ACU:ns uppgraderingsplatser), tech-nivåer T1–EXP, ikonrutnät med namn under varje ikon och en informationsruta med kostnad, byggtid och effekt.

- **ACU-uppgraderingar:** Zephyr Amplifier, Nano-Repair System och Resource Allocation System.
- **Radar och krigsdimma** som i FA: sikt per enhet, radarblippar och Radar System T1/T2.
- **Bekvämligheter som i FA:** byggmenyn kan fällas ihop, räckvidden (radar, vapen, sköld) syns när man placerar en byggnad, en turkos stapel visar bygg- och uppgraderingsframsteg, fabriken väljer sin högsta tech-flik, nästa tech-nivås enheter kan köas under en uppgradering, ingenjörens byggkö visas och går att korta, och sysslolösa ingenjörer väljs per tech-nivå.
- **Patrull:** byggare reparerar skadade byggnader (inte murar) och återvinner, men hjälper inte till med byggen eller uppgraderingar.
- **Skott och terräng:** artilleri och missiler flyger i en absolut båge och direktskjutande vapen i en rak linje från mynningen till målet. Skott slår ner i kullar och berg som är högre än banan, som i FA.
- **T2:** fabriker och Mass Extractors uppgraderas som i FA, T2-ingenjören bygger T2-byggnaderna, Land Factory HQ bygger T2-enheter, sköldar (Shield Generator och Parashield), och Cybran T2 i fiendens pool.

Enheter: UEF ACU, Engineer, Snoop, Mech Marine, MA12 Striker, Lobo och Archer (T1), och T2 Engineer, Pillar, Mongoose, Riptide, Flapjack, Sky Boxer och Parashield (T2). Fiender: Cybran Mantis, Mole och Medusa (T1), och Rhino, Hoplite, Wagner och Viper (T2).

## Kommande

- [ ] **1. Snyggare modeller för enheter och byggnader.** Mer detaljerade modeller som är tydligt lika sina FA-förlagor (siluett, proportioner, lagfärg). Modellerna görs procedurellt i kod med egen design (fasade prismor, paneler, lagfärgsränder och animerade delar), sammanslagna per material så att de bara kostar några få draw calls. FA:s egna modeller används inte. Alla nuvarande enheter och byggnader är omgjorda; granska dem i modellvisaren `/models.html`. Nya enheter görs i samma stil med hjälpfunktionerna i `models.js` (`prism`, `chamferBox`, `strut`, `insectLegs`).
  *Test:* varje enhet och byggnad går att känna igen inzoomat; FPS påverkas inte märkbart.
- [ ] **2. Air och anti-air.** UEF T1 Air Factory och flygplan, och T1 Anti-Air Turret. Fienden får Cybran-flyg. Flygplan ignorerar flödesfältet och terrängen, och bara luftvärn och vapen som kan skjuta mot luft träffar dem, som i FA.
  *Test (Vitest):* flyg flyger rakt över murar; markvapen skjuter inte på flyg; luftvärn gör det.
- [ ] **3. UEF T1-enheter för fienden.** Spelaren kan redan bygga alla UEF T1-landenheter (Snoop, Mech Marine, MA12 Striker, Lobo, Archer och Engineer) med värden från FAF:s blueprints. Kvar: fiendens pool ska kunna innehålla UEF-enheter. Archer skjuter bara på flyg och har inga mål förrän punkt 2 (flyg) är klar.
  *Test (Vitest):* fiendens pool kan skapa UEF-enheter.
- [x] **4. Radar och fog of war.** Som i FA, i `sim/intel.js`. Varje egen enhet och färdig byggnad ser runt sig (Intel.VisionRadius, halverad), och radar (RadarRadius, ACU:ns OmniRadius och Snoopens radar) visar fiender längre bort. Värden från FAF:s blueprints; byggnader vars blueprint saknar Intel (T1 Mass Extractor, T1 Power Generator, Mass Fabricator, lagren och muren) ser ingenting.
  - **Inom sikt** syns fienden helt. **Bara på radar** syns den som FA:s generiska blipp (en tom röd romb, icon_land_generic) utan modell, hälsa, typ eller tech-nivå, på alla zoomnivåer. **Annars** är den dold, även på minikartan.
  - Dimman ritas som i FA:s "Explored": terrängen syns, men det som ligger utanför egen sikt är mörkare, även på minikartan. Skott, träffar och explosioner i dimman syns och hörs inte.
  - Egna vapen väljer bara fiender som syns eller finns på radar, och släpper ett mål som försvinner i dimman. Lobo och Point Defense skjuter alltså längre än de ser, som i FA, och behöver radar eller andra enheter som ser målet. Fienden (datorn) ser allt.
  - **Radar System:** SA1-1000 (UEB3101, T1: radar 58, 20 energi/s) byggs av ACU:n och ingenjörer och uppgraderas till SA2-2000 (UEB3201, T2: radar 100, 150 energi/s), som T2-ingenjören också kan bygga. Radarn fungerar bara när dess energi räcker. Markerad radar visar sin räckvidd som en grön ring.
  - Radarblippar går att hovra ("Radar contact") och högerklicka för att anfalla, som i FA. Dolda fiender går inte att träffa med musen.
  - Inte med än: Omni Sensor Array (T3), stealth och jamming, och minnet av fiendebyggnader man sett (fienden har inga byggnader).
  *Test (Vitest):* `tests/intel.test.js`. En fiende utanför sikt och radar är dold, inom radar en blipp, inom sikt syns den helt. Radar utan energi och ofärdig radar ger inget, egna vapen skjuter inte på dolda fiender men på dem på radar, och T1-radarn uppgraderas till T2.
- [x] **5. T2.** Värden från FAF:s blueprints. Uppgradering ligger i `sim/upgrades.js` och sköldar i `sim/shields.js`.
  - **Uppgradering som i FA:** en färdig byggnad med `upgradesTo` bygger uppgraderingen med sin egen byggkraft (FA:s BuildRate) och kostnaden (den nya typens hela pris) dras löpande. Ingenjörer kan assistera, och Cancel upgrade ger tillbaka det som lagts ner. En fabrik bygger inga enheter under tiden men behåller kön. Land Factory (BuildRate 20) blir **Land Factory HQ** (UEB0201: 1410 mass, 11 200 energi, byggtid 2300, BuildRate 40).
  - **T2 Engineer** (UEL0208, BuildRate 13) byggs i HQ:n och bygger T1- och T2-byggnader: T2 Mass Extractor, EG-200 Fusion Reactor (500 energi/s), Mass Fabricator, Triad (T2 Point Defense), Klink Hammer (Artillery Installation) och SD-Pulse (Shield Generator).
  - **T2-enheter för UEF:** Pillar, Mongoose, Riptide, Flapjack, Sky Boxer och Parashield. **Cybran T2 i fiendens pool:** Rhino (från minut 10), Hoplite (12), Wagner (14) och Viper (16).
  - **Sköldar:** sköldens HP, regen efter `regenStartTime`, och omladdning på `rechargeTime` när den fallit. Skott som slår ner innanför skölden tar skölden i stället (även splash), men skott inifrån går ut. Vid energibrist faller skölden.
  - **Förenklingar:** enheter med salvor eller flera vapen (Mongoose, Hoplite, Wagner, Flapjack) har ett vapen med samma DPS som i FA. Missiler flyger i båge som artilleri. Mongooses granatkastare och Wagners torped är inte med.
  - **Tech-nivån syns som i FA:** strategiska ikoner i FA:s system (`render/icons.js`): formen visar kategori (romb för landenheter, åttahörning för bottar, kvadrat för byggnader), symbolen roll och vita streck under ikonen tech-nivå (1–3), i ägarens färg för både egna och fiender. Från mellanzoom tonas ikonerna in ovanpå modellerna (som FA:s IconFadeInZoom). Inzoomat är T2-modellerna större än T1, och namn i hover, markeringspanel och menyer skrivs som i FA: "T2 Heavy Tank".
  - **Inte med än:** T2 Land Factory (support factory), T2 Air och Naval Factory, luftvärn och missilförsvar (kräver steg 2), radar och stealth (kräver steg 4) samt Banger (Cybrans flak, inga mål utan flyg).
  *Test (Vitest):* `tests/t2.test.js`. En T1-fabrik uppgraderas till HQ och bygger sedan T2-enheter. Uppgraderingen kostar rätt, stoppar produktionen, går fortare med assist och kan avbrytas. T2-ingenjören bygger T2-byggnader, sköldar tar skott utifrån men släpper ut egna skott, och fiendens pool har Cybran T2.
- [x] **6. Uppgradera Mass Extractor.** T1 → T2 → T3 som i FA (UEB1103 → UEB1202 → UEB1302), med BuildRate 10 och 15. T2 ger 6 mass/s och drar 9 energi/s (900 mass, byggtid 900), T3 ger 18 mass/s och drar 54 energi/s (4600 mass, byggtid 2875). Produktionen fortsätter under uppgraderingen. T3 fås bara genom uppgradering, eftersom T3-ingenjörer inte finns än.
  *Test (Vitest):* efter uppgraderingen ger utvinnaren T2:s (och sedan T3:s) mass och drar motsvarande energi.
- [ ] **7. Fler kartor med mer variation.** Fler och större kartor med olika terräng (raviner, höjder och flera vägar) och olika antal spawnpunkter. **Räckvidd och projektilfart** är i dag hårdkodat halverade för första kartans storlek, så lagra FA:s ohalverade värden i data och låt en skalfaktor per karta räkna fram dem.
  *Test (Vitest):* alla kartor klarar karttesterna (spawnpunkter når kärnan); samma enhet får rätt räckvidd på kartor med olika skala.
- [x] **8. ACU-uppgraderingar.** UEF ACU:ns enhancements med värden från FAF:s blueprint (`UEL0001_unit.bp`) och effekter från `UEL0001_script.lua`. Uppgraderingarna ligger i `src/data/enhancements.js`. ACU:n bygger dem på sig själv med sin byggkraft och står still under tiden. Kostnaden dras löpande, och ingenjörer kan assistera. En flyttorder eller annan order avbryter inte uppgraderingen, utan läggs efter den. Bara Cancel upgrade (eller högerklick på knappen) avbryter, och då får man tillbaka det som lagts ner. Varje plats (höger arm, vänster arm, rygg) rymmer en uppgradering, och en ny ersätter den gamla. Uppgraderingarna försvinner när ACU:n dör, precis som veterancy.
  - **Zephyr Amplifier** (höger arm): 800 mass, 24 000 energi, byggtid 800. +100 skada och räckvidd 22→30 (i spelet 11→15).
  - **Nano-Repair System** (vänster arm): 800 mass, 24 000 energi, byggtid 800. +1 500 max-HP och +40 regen.
  - **Resource Allocation System** (höger arm): 5 000 mass, 175 000 energi, byggtid 2 800. +14 mass/s och +2 500 energi/s.

  Senare: T2/T3 Engineering Suite, sköldarna (sköldsystemet finns nu, se steg 5), C-D1 Shoulder Drone (med steg 2), Tactical Missile Launcher och "Billy" (kräver missilvapen). Personal Teleporter tas inte med.
  *Test (Vitest):* `tests/enhancements.test.js`. Uppgraderingen tar `buildTime / byggkraft`, kostar rätt och ger rätt effekt. En ny uppgradering på samma plats ersätter den gamla. En flyttorder avbryter inte, men cancelEnhance gör det och ger tillbaka kostnaden. En assisterande ingenjör gör den snabbare, och den försvinner när ACU:n återuppstår.

## Arbetsflöde per steg

1. Välj nästa oavbockade steg.
2. Skriv testet först om steget gäller sim-logik.
3. Implementera det minsta som får steget att fungera.
4. Verifiera manuellt i webbläsaren.
5. Bocka av steget och gör en commit.
