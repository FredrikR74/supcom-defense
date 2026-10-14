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

- **ACU-uppgraderingar:** Zephyr Amplifier, Nano-Repair System och Resource Allocation System.

Enheter: UEF ACU, Engineer och MA12 Striker. Fiender: Cybran Mantis, Mole och Medusa.

## Kommande

- [ ] **1. Snyggare modeller för enheter och byggnader.** Mer detaljerade modeller som är tydligt lika sina FA-förlagor (siluett, proportioner, lagfärg). Modellerna görs procedurellt i kod med egen design (fasade prismor, paneler, lagfärgsränder och animerade delar), sammanslagna per material så att de bara kostar några få draw calls. FA:s egna modeller används inte. Alla nuvarande enheter och byggnader är omgjorda; granska dem i modellvisaren `/models.html`. Nya enheter görs i samma stil med hjälpfunktionerna i `models.js` (`prism`, `chamferBox`, `strut`, `insectLegs`).
  *Test:* varje enhet och byggnad går att känna igen inzoomat; FPS påverkas inte märkbart.
- [ ] **2. Air och anti-air.** UEF T1 Air Factory och flygplan, och T1 Anti-Air Turret. Fienden får Cybran-flyg. Flygplan ignorerar flödesfältet och terrängen, och bara luftvärn och vapen som kan skjuta mot luft träffar dem, som i FA.
  *Test (Vitest):* flyg flyger rakt över murar; markvapen skjuter inte på flyg; luftvärn gör det.
- [ ] **3. UEF T1-enheter för fienden.** Spelaren kan redan bygga alla UEF T1-landenheter (Snoop, Mech Marine, MA12 Striker, Lobo, Archer och Engineer) med värden från FAF:s blueprints. Kvar: fiendens pool ska kunna innehålla UEF-enheter. Archer skjuter bara på flyg och har inga mål förrän punkt 2 (flyg) är klar.
  *Test (Vitest):* fiendens pool kan skapa UEF-enheter.
- [ ] **4. Radar och fog of war.** Krigsdimma: man ser bara det som är inom egna enheters och byggnaders siktradie. UEF Radar System visar fiender inom sin radie som radarblippar. Värden från blueprints.
  *Test (Vitest):* en fiende utanför sikt och radar är dold; inom radar syns den som blipp; inom sikt syns den helt.
- [ ] **5. T2.** UEF T2-byggnader och T2-enheter (t.ex. T2 Point Defense, Shield Generator, T2 Land Factory och T2-stridsvagnar) och motsvarande T2-fiender, med FA-värden. Uppgradering av fabriker från T1 till T2 som i FA.
  *Test (Vitest):* en T1-fabrik kan uppgraderas till T2 och sedan bygga T2-enheter.
- [ ] **6. Uppgradera Mass Extractor.** T1 till T2 till T3 som i FA, med uppgraderingskostnad, byggtid och ny produktion och upkeep från blueprints. Produktionen fortsätter under uppgraderingen.
  *Test (Vitest):* efter uppgraderingen ger utvinnaren T2:s mass och drar T2:s energi.
- [ ] **7. Fler kartor med mer variation.** Fler och större kartor med olika terräng (raviner, höjder och flera vägar) och olika antal spawnpunkter. **Räckvidd och projektilfart** är i dag hårdkodat halverade för första kartans storlek, så lagra FA:s ohalverade värden i data och låt en skalfaktor per karta räkna fram dem.
  *Test (Vitest):* alla kartor klarar karttesterna (spawnpunkter når kärnan); samma enhet får rätt räckvidd på kartor med olika skala.
- [x] **8. ACU-uppgraderingar.** UEF ACU:ns enhancements med värden från FAF:s blueprint (`UEL0001_unit.bp`) och effekter från `UEL0001_script.lua`. Uppgraderingarna ligger i `src/data/enhancements.js`. ACU:n bygger dem på sig själv med sin byggkraft och står still under tiden. Kostnaden dras löpande, och ingenjörer kan assistera. En ny order avbryter uppgraderingen, och det som lagts ner är förlorat. Varje plats (höger arm, vänster arm, rygg) rymmer en uppgradering, och en ny ersätter den gamla. Uppgraderingarna försvinner när ACU:n dör, precis som veterancy.
  - **Zephyr Amplifier** (höger arm): 800 mass, 24 000 energi, byggtid 800. +100 skada och räckvidd 22→30 (i spelet 11→15).
  - **Nano-Repair System** (vänster arm): 800 mass, 24 000 energi, byggtid 800. +1 500 max-HP och +40 regen.
  - **Resource Allocation System** (höger arm): 5 000 mass, 175 000 energi, byggtid 2 800. +14 mass/s och +2 500 energi/s.

  Senare: T2/T3 Engineering Suite (med steg 5), sköldarna (med T2 Shield Generator i steg 5), C-D1 Shoulder Drone (med steg 2), Tactical Missile Launcher och "Billy" (kräver missilvapen). Personal Teleporter tas inte med.
  *Test (Vitest):* `tests/enhancements.test.js`. Uppgraderingen tar `buildTime / byggkraft`, kostar rätt och ger rätt effekt. En ny uppgradering på samma plats ersätter den gamla. En assisterande ingenjör gör den snabbare, och den försvinner när ACU:n återuppstår.

## Arbetsflöde per steg

1. Välj nästa oavbockade steg.
2. Skriv testet först om steget gäller sim-logik.
3. Implementera det minsta som får steget att fungera.
4. Verifiera manuellt i webbläsaren.
5. Bocka av steget och gör en commit.
