# SupCom Defense: plan

Ett single player-tower defense-spel i webbläsaren, med Supreme Commander: Forged Alliance-stil på grafik och enheter.

## Spelidé

- Du börjar med en **UEF Armored Command Unit (ACU)**, en **kärnbyggnad** (en Quantum Gate) och ett startkapital i **mass** och **energi**.
- Du bygger en bas: ekonomibyggnader och försvarstorn.
- Du startar själv nästa **våg**. Fiender kommer från en eller flera kanter av kartan och försöker förstöra kärnan.
- Ekonomibyggnaderna (Mass Extractors på fyndigheter och Power Generators) ger löpande inkomst. Den används till fler torn, uppgraderingar och **reparationer**.
- Du förlorar om kärnan förstörs. Du vinner om du klarar sista vågen.

### Designval (kan ändras)

| Fråga | Förslag | Alternativ |
|---|---|---|
| Hur byggs saker? | ACU och ingenjörer bygger som i SupCom (byggkraft, tar tid) | Placera direkt, allt blir klart direkt |
| Hur går fiender? | Mot kärnan via flödesfält. Byggnader blockerar, och fiender skjuter sig igenom om de är instängda | Fast väg som i klassisk TD |
| Vad händer om ACU:n dör? | Den återuppstår vid kärnan efter X sekunder | Förlust |
| Vågor | Spelaren startar nästa våg, med en paus för att bygga mellan vågorna | Timer |
| Ekonomi | Flödesbaserad som i SupCom (kostnaden dras under bygget) | Engångskostnad vid placering |

## Grundprinciper

1. **Små steg.** Varje steg tar ungefär 30 minuter till 2 timmar och slutar med något du kan **se eller testa**.
2. **Simulering och rendering hålls isär.** Spellogiken (`sim/`) körs i fasta tick (10 per sekund) och vet ingenting om Three.js. Renderingen (`render/`) läser bara simuleringens tillstånd och interpolerar mellan tick.
3. **Simuleringen är deterministisk.** Den använder en seedad slumpgenerator och aldrig `Math.random()` i `sim/`.
4. **Varje steg har ett test.** Det är antingen ett automatiskt test (Vitest) eller en manuell kontroll i webbläsaren.
5. **Börja fult.** Använd boxar och cylindrar i stället för modeller. Snygga grafiken sist.
6. **All balans ligger i data.** Enheter, torn och vågor definieras i `data/` så att du kan finjustera utan att ändra logiken.
7. **Bara riktiga FA-enheter och FA-byggnader.** Allt spelaren bygger och alla fiender ska finnas i Supreme Commander: Forged Alliance, med samma namn, tech-nivå och roll. Spelaren är **UEF** och fienderna är **Cybran**. Vi hittar inte på egna enheter eller byggnader. Det enda avsteget från FA är spelläget (tower defense). Namn, roller och ungefärliga relationer mellan stats tas från FA. Absoluta värden får skalas för balansen. Ett test kontrollerar att alla namn i `data/` finns på en godkänd lista (se 4.11).
8. **All text i spelet är på engelska.** Det gäller knappar, paneler, hover-info, felsökningsrutan, kartnamn och felmeddelanden, precis som i FA. Kodkommentarer och planen är på svenska.

## Teknikval

| Område | Val |
|---|---|
| Språk | JavaScript (ES-moduler) |
| Byggverktyg | Vite |
| 3D | Three.js (`InstancedMesh` för många fiender) |
| Tester | Vitest |
| UI | HTML och CSS ovanpå canvas |

## Mappstruktur (målbild)

```
src/
  main.js
  sim/               // ren spellogik
    world.js
    rng.js
    systems/         // economy, build, movement, targeting, combat, waves, repair
  render/            // Three.js
  input/             // mus, tangentbord, markering
  ui/                // resurspanel, byggmeny, vågpanel
  data/
    units.js         // fiendetyper
    structures.js    // torn och ekonomibyggnader
    waves.js         // vågdefinitioner
tests/
```

---

## Fas 0: Grund

- [x] **0.1 Projektskelett.** Vite, `three` och `vitest`.
  *Test:* `npm run dev` och `npm test` fungerar.
- [x] **0.2 Three.js-scen.** En canvas som fyller fönstret, med en roterande kub.
  *Test:* kuben syns och canvasen skalas om när fönstret ändrar storlek.
- [x] **0.3 Spelloop med fast tick.** 10 tick per sekund, rendering med requestAnimationFrame. Visa tick-räknare och FPS.
  *Test:* tick-räknaren ökar med cirka 10 per sekund.
- [x] **0.4 Seedad slumpgenerator.**
  *Test (Vitest):* samma seed ger samma sekvens.

## Fas 1: Karta och kamera

- [x] **1.1 Mark med byggrutnät.** Ett plan på 128×128 med synligt rutnät (1 ruta = 1 byggenhet).
  *Test:* rutnätet syns.
- [x] **1.2 Höjdkarta.** Låga kullar och en platå i mitten för basen.
  *Test (Vitest):* `getHeight(x, z)` returnerar rätt värde.
- [x] **1.3 Panorering.** WASD/piltangenter och musen mot skärmkanten.
- [x] **1.4 Zoom mot muspekaren**, som i SupCom.
  *Test:* punkten under pekaren står still medan du zoomar.
- [x] **1.5 Strategisk zoom.** Långt utzoomat visas ikoner i stället för meshes.
  *Test:* zooma ut och in.
- [x] **1.6 Kartobjekt.** Kärnans position, fiendernas spawnpunkter och massfyndigheter, alla definierade i en kartfil.
  *Test:* markörerna syns på rätt plats.

## Fas 2: Kärna och ekonomi

- [x] **2.1 Kärnbyggnad.** Placeras vid start och har HP.
  *Test:* den syns, och en HP-stapel visas när du håller muspekaren över den.
- [x] **2.2 Resurslager.** Mass och energi, med startkapital från konfigurationen (t.ex. 500 mass och 2000 energi).
  *Test (Vitest):* ny spelare får rätt startkapital.
- [x] **2.3 Resurspanel i UI.** Visar lager, maxkapacitet och +/- per sekund.
  *Test:* värdena syns.
- [x] **2.4 Inkomst.** Kärnan ger en liten basinkomst.
  *Test (Vitest):* inkomst 10 per sekund ger +1 per tick.
- [x] **2.5 Strömavbrott (stall).** När utgiften är större än inkomsten och lagret är tomt sätts effektiviteten till inkomst/utgift.
  *Test (Vitest):* inkomst 5 och utgift 10 ger effektiviteten 0,5.

## Fas 3: Markering och ACU

- [x] **3.1 Entiteter i sim.** `world.add({type, x, z, owner})`.
  *Test (Vitest):* lägg till och ta bort.
- [x] **3.2 ACU.** Startar vid kärnan och renderas som en box i spelarens färg.
- [x] **3.3 Klickmarkering och lådmarkering.** Den markerade enheten får en ring.
  *Test:* manuellt.
- [x] **3.4 Flyttorder.** Högerklick på marken, rak linje.
  *Test (Vitest):* enheten är på förväntad position efter N tick.
- [x] **3.5 Ordrekö med Shift.** Visa linjer mellan waypoints.

## Fas 4: Byggande

- [x] **4.1 Byggmeny.** Visas när ACU:n är markerad: Mass Extractor, Power Generator, Wall och Point Defense (T1-torn).
  *Test:* knapparna syns bara när ACU:n är markerad.
- [x] **4.2 Placeringsförhandsvisning.** Fäster mot rutnätet och blir röd vid krock, för brant mark eller fel underlag (utvinnare kräver fyndighet).
  *Test (Vitest):* `canPlace()` för olika fall.
- [x] **4.3 Byggprocess.** ACU:n går dit och bygger. Framsteget beror på byggkraft och effektivitet, och resurserna dras löpande.
  *Test (Vitest):* med kostnad 100 mass, byggtid 10 s och full ekonomi blir byggnaden klar efter 100 tick.
- [x] **4.4 Ekonomibyggnader producerar.**
  *Test:* inkomsten ökar i panelen.
- [x] **4.5 Avbryt och sälj.** Riv en byggnad och få tillbaka en del av massan.
  *Test (Vitest):* rätt återbetalning.
- [x] **4.6 Byggkö med Shift.**
- [x] **4.7 Ingenjörer.** Kan byggas från kärnan eller en fabrik och hjälpa till att bygga (assist). Byggkraften läggs ihop.
  *Test (Vitest):* två byggare halverar tiden.

## Fas 4b: Byggarbetsflöden som i SupCom

- [x] **4.15 Fabrikskö.** Ctrl+klick köar 5 åt gången. Hela kön visas som rutor i ordning, med framsteg på den första. Högerklick på en ruta tar bort den; tar man bort den som byggs får man tillbaka det den kostat hittills.
- [x] **4.14 T1-stridsvagn.** UEF MA12 Striker (Medium Tank, UEL0201) byggs i Land Factory, med vridbart torn. Den skjuter medan den kör.
- [x] **4.8 Land Factory.** UEF T1 Land Factory kan byggas av ACU:n och ingenjörer och har en produktionskö. **Ingenjörer byggs i fabriken och inte i kärnan**, som i FA. Kärnan (Quantum Gate) slutar producera ingenjörer. Man kan köa enheter, sätta waypoints och slå på repetering medan fabriken fortfarande byggs, och produktionen startar när den är klar.
  *Test (Vitest):* fabriken producerar en ingenjör efter buildTime / buildPower. Kärnan har ingen produktionslista. En kö som läggs medan fabriken byggs börjar produceras när fabriken är klar.
- [x] **4.9 Waypoint från fabrik.** Högerklick med fabriken markerad sätter en samlingspunkt (rally point). Shift+högerklick köar flera waypoints. Nya enheter följer dem. Visa en flagga och linjer när fabriken är markerad.
  *Test (Vitest):* en ny enhet får fabrikens waypoints som order. Manuellt: enheterna går till flaggan.
- [x] **4.10 Repetera produktion.** En knapp slår av och på repetering av kön, som i FA.
  *Test (Vitest):* med repetering läggs en färdig enhet sist i kön igen.
- [x] **4.11 Kontroll av FA-namn.** En lista över godkända FA-namn (UEF och Cybran) med tech-nivå. Den ska kontrolleras mot en FA-enhetsdatabas när steget görs. Byt `Wall` mot FA:s namn *Wall Section*.
  *Test (Vitest):* varje `name` i `data/structures.js` och `data/units.js` finns på listan.
- [x] **4.12 Dra ut en rad byggnader med Shift+dra.** I placeringsläget håller du Shift och drar från en startpunkt. Förhandsvisningar läggs ut längs linjen med en byggnads bredd mellan sig, så att murar blir sammanhängande. När du släpper köas alla platser som är giltiga, i ordning från startpunkten.
  *Test (Vitest):* `lineOfPlacements(start, end, size)` ger rätt rutor för vågräta, lodräta och diagonala drag. Manuellt: dra en mur med 10 sektioner.
- [x] **4.13 Assistera en annan enhet.** Högerklick med byggare markerade:
  - på en **egen byggare** (ACU eller ingenjör): följ den och hjälp till med det den bygger
  - på en **egen fabrik**: hjälp fabriken så att produktionen går fortare (byggkrafterna läggs ihop)

  Assisten gäller tills du ger en ny order. Har den assisterade inget jobb väntar assisten intill den.
  *Test (Vitest):* en ingenjör som assisterar ACU:n gör ACU:ns bygge snabbare. En ingenjör som assisterar fabriken gör produktionen snabbare. Assisten följer efter när ACU:n går.

## Fas 5: Fiender och vägar

- [x] **5.1 Passerbarhetsrutnät.** Branta rutor och byggnader blockerar. Lägg till ett felsökningsläge som visar dem.
  *Test (Vitest):* en ruta med byggnad blir blockerad.
- [x] **5.2 Flödesfält mot kärnan.** En BFS/Dijkstra från kärnan över hela rutnätet. Räknas om när en byggnad placeras eller förstörs.
  *Test (Vitest):* varje fri ruta pekar mot en granne närmare kärnan.
- [x] **5.3 Visualisera flödesfältet.** Felsökningsläge med pilar.
  *Test:* pilarna går runt en mur du bygger.
- [x] **5.4 Spawna en fiende.** En Cybran T1 *Mantis* (Assault Bot) som följer flödesfältet till kärnan.
  *Test:* den kör till kärnan och svänger runt hinder.
- [x] **5.5 Placeringsregel: aldrig helt instängd.** Förbjud en placering om den gör att någon spawnpunkt saknar väg till kärnan. Det här är alternativ A. Alternativ B är att fiender skjuter sig igenom.
  *Test (Vitest):* en placering som stänger vägen nekas.
- [x] **5.6 Separation.** Fiender knuffar varandra lätt så att de inte överlappar.
- [ ] **5.7 Rendera med `InstancedMesh`.** (Gjort. FPS med 300 fiender återstår att mäta i ett synligt fönster: `game.spawn(300)` i konsolen.)
  *Test:* 300 fiender ger fortfarande 60 FPS.

- [x] **5.8 Vägsökning för egna enheter.** ACU:n och ingenjörer går runt byggnader och brant terräng med A* på samma rutnät. Är sikten fri går de rakt, och vägen kortas av där det går. Den räknas om när byggnader tillkommer eller försvinner. Klickar man på en blockerad plats går enheten så nära den kommer.
  *Test (Vitest):* ACU:n tar sig förbi en mur utan att gå in i den. En byggare når en byggplats bakom en mur. En flyttorder till en blockerad ruta slutar intill den.

## Fas 6: Strid

- [x] **6.1 HP och död.** HP-stapel. Vid 0 HP tas enheten bort och lämnar ett vrak.
  *Test (Vitest):* skada som överstiger HP ger en död enhet.
- [x] **6.2 Fiender skadar kärnan.** Fiender som når kärnan stannar och skjuter på den.
  *Test:* kärnans HP sjunker.
- [x] **6.3 Rumsligt rutnät (spatial hash)** för snabba avståndsfrågor.
  *Test (Vitest):* `queryRadius` returnerar rätt enheter.
- [x] **6.4 Tornens målsökning.** Närmaste fiende inom räckvidd, eller den som är närmast kärnan.
  *Test (Vitest):* rätt mål väljs.
- [x] **6.5 Point Defense skjuter.** Projektiler med hastighet, skada och eldhastighet. Tornet vrider sitt torn mot målet.
  *Test:* tornet dödar en fiende.
- [x] **6.6 Fiender skjuter på byggnader.** De angriper torn och murar inom räckvidd på vägen.
  *Test:* ett torn tar skada.
- [x] **6.7 Byggnader kan förstöras.** Flödesfältet räknas om.
  *Test:* en förstörd mur öppnar en väg.
- [x] **6.8 Muzzle flash och explosionseffekt.** En enkel partikelboll.

## Fas 6b: FA-regler och översikt

Värden och regler hämtade direkt från FAF:s spelkod och blueprints (github.com/FAForever/fa).

- [x] **6.9 FA-värden.** HP, kostnader, byggtider, BuildRate, produktion och vapen från blueprints. Räckvidd och projektilfart är halverade, eftersom första kartan (128×128) är ungefär hälften så stor som en FA-karta. **Obs:** detta måste justeras när större kartor kommer, se 10.1.
- [x] **6.10 Startresurser.** 650 mass och 3900 energi (ACU:ns lager, som FA ger vid start). ACU:n ger +1 mass och +20 energi; kärnan ger inget.
- [x] **6.11 Upkeep.** Mass Extractor drar 2 energi/s och producerar mindre vid energibrist.
- [x] **6.12 Info om markering.** Panel med namn, HP, regen, veterancy och vad det markerade ger och drar i mass och energi.
- [x] **6.13 Sysslolösa byggare.** "Zz"-markering ovanför och knappar som markerar nästa sysslolösa ACU eller ingenjör och flyttar kameran dit.
- [x] **6.14 FA:s målprioritering.** Mobila enheter först, sedan försvarsbyggnader. Murar (BENIGN) skjuts aldrig automatiskt.
- [x] **6.15 Egna enheter i vägen.** En enhet i rörelse knuffas inte undan, och enheter på en ny byggplats flyttar sig.
- [x] **6.16 HP-regen och veterancy enligt FAF.** Erfarenhet är dödad massa fördelad efter skada. Varje nivå ger +10 % max-HP, läkning och extra regen. ACU:n har egna trösklar och regen 10 HP/s.
  *Test (Vitest):* `tests/faRules.test.js`.

## Fas 7: Vågor

> **Ändrat:** vågorna som spelaren startar själv (7.1–7.3) är ersatta av ett kontinuerligt fiendetryck (7.6–7.7). Ekonomin är strömmande, så fienden måste också vara det, annars kan man bara vänta och bygga i oändlighet.

- [x] **7.1 Vågdata.** `waves.js` innehåller en lista med `{ enemies: [{type, count, interval, spawn}] }`.
  *Test (Vitest):* våg 1 ger rätt antal spawns över tid.
- [x] **7.2 Vågpanel.** Visar "Våg 3/20", en knapp för nästa våg och förhandsinformation om vad som kommer.
- [x] **7.3 Våg klar.** När alla fiender i vågen är döda startar byggfasen och du får en eventuell bonus i mass.
  *Test (Vitest):* tillståndet växlar korrekt.
- [x] **7.4 Belöning per fiende.** Mass i vrak som kan återvinnas (som i FA), och en bonus i mass för varje besegrad våg.
- [x] **7.6 Kontinuerligt fiendetryck.** Fienden har en strömmande "inkomst" i mass per sekund som växer med tiden. Enheter köps löpande när budgeten räcker. Spawnpunkten byts var 30:e sekund, och nya typer låses upp med tiden (Medusa från minut 4). Lugn början på 60 s. Värdena ligger i `gameConfig.director`.
  *Test (Vitest):* spenderad mass följer budgeten, trycket växer, typer låses upp, och det är deterministiskt.
- [x] **7.8 Kills, attackorder och motanfall.** Varje enhet räknar sina kills. Högerklick på en fiende ger en attackorder. En beväpnad enhet som beskjuts utom räckhåll åker dit och anfaller, om den står still eller är på väg mot kärnan (en flyttorder respekteras).
- [x] **7.7 Svårighetsreglage 0–100.** Multiplicerar fiendens inkomst: 0 ger ×0,1 (Very easy), 50 ger ×1 (Normal) och 100 ger ×10 (Impossible). Går att ändra under spelet.
- [x] **7.5 Fler fiendetyper (Cybran T1).** *Mole* (Land Scout: snabb och svag), *Hunter* (Light Assault Bot) och *Medusa* (Mobile Light Artillery, lång räckvidd som beskjuter tornen). *Hunter väntar tills namnet är verifierat för FA; Mole och Medusa är gjorda.*
  *Test:* varje typ syns i en egen testvåg.

## Fas 8: Reparation och återvinning

- [x] **8.1 Reparera.** Högerklick på en skadad egen byggnad eller enhet. Som i FA-motorn återställs HP i byggtakt och kostar som att bygga den saknade delen (`repairCostMult` = 1).
  *Test (Vitest):* att reparera 50 % HP kostar 50 % × reparationsfaktor × byggkostnaden.
- [x] **8.2 Reparera kärnan.** Quantum Gateway (UEB0304, rätt FA-namn): 10000 HP, 3000 mass och 30000 energi, BuildTime 4097.
- [x] **8.3 Återvinna vrak** med högerklick. Som i FAF: tiden är massan / (BuildRate × 10) s, och vraket innehåller kostnad × 0,9 × tech-faktor (T1 0,9), alltså 81 %.
  *Test:* mass-lagret ökar.
- [x] **8.4 Patrull (P).** Fram och tillbaka mellan punkter; Shift lägger till fler. Byggare reparerar och återvinner automatiskt på vägen, och beväpnade enheter stannar och slåss. Felsökningsvyerna har flyttat till F8 (blockerade rutor) och F9 (flödesfält).
- [x] **8.5 Granska fiender.** Vänsterklick på en fiende eller ett vrak visar den i infopanelen (utan att markera den): namn, fraktion, HP, veterancy, vapen (skada, DPS, räckvidd), kills, fart och massvärde. Samma stridsvärden visas för egna enheter.

## Fas 9: Spelbar match

- [x] **9.1 Förlust.** Kärnan förstörs: en förlustskärm visar hur länge man höll ut, med en Restart-knapp.
- [x] **9.2 Ingen vinst: spelet pågår tills man dör.** Trycket accelererar ((1 + 0,5 × min)^1,5) och växer utan gräns. Panelen visar överlevd tid och hur fort trycket ökar.
- [ ] **9.3 ACU-död.** Den återuppstår efter X sekunder (eller förlust, se designvalen).
- [ ] **9.4 Startmeny.** Välj karta och svårighetsgrad (HP-multiplikator för fiender).
- [ ] **9.5 Paus och spelhastighet.**
- [ ] **9.6 Balansera fiendetrycket** (baseRate, growthPerMinute och enhetsvikter) mot FA-ekonomin.

**🎯 Milstolpe: ett komplett, spelbart tower defense-spel.**

## Fas 10: Fler torn och djup

- [ ] **10.1 Kartskala för avstånd.** Räckvidd och projektilfart (och eventuellt enheternas fart) är i dag hårdkodat halverade i `data/units.js` och `data/structures.js`. Inför större kartor: lagra FA:s ohalverade värden i data och låt en skalfaktor per karta (t.ex. `map.distanceScale`) räkna fram dem, så att varje karta får rätt avstånd.
  *Test (Vitest):* en Mantis räckvidd blir 18 × kartans skalfaktor. Samma enhet får olika räckvidd på kartor med olika skala.

Allt här är FA-byggnader och FA-enheter. De nya namnen läggs till på den godkända listan från 4.11.

- [ ] Wall Section som visuellt fäster ihop med intilliggande sektioner
- [ ] T1 Anti-Air Turret och Cybran-flyg (t.ex. *Zeus* T1 Bomber och *Jester* T1 Light Gunship) som ignorerar flödesfältet och flyger rakt
- [ ] T2: Point Defense, Artillery Installation, Shield Generator, Tactical Missile Defense och Cybran T2-fiender (t.ex. *Rhino*)
- [ ] Radar System som visar inkommande vågor på minimapen
- [ ] Uppgradering av Mass Extractor och fabriker från T1 till T2 till T3, som i FA
- [ ] Mass Fabricator, Mass Storage och Energy Storage med adjacency-bonus som i FA
- [ ] Fiender med Tactical Missile Launcher, mot spelarens Tactical Missile Defense
- [ ] Cybran T3 (t.ex. *Loyalist* och *Brick*)
- [ ] Bossvågor med Cybran-experimentella enheter: *Monkeylord* och *Megalith*
- [ ] Quantum Gate kan bygga Support Armored Command Units, som i FA
- [ ] Fler fiendefraktioner (Aeon och Seraphim) med sina egna FA-enheter

## Fas 11: Utseende

- [ ] SupCom-färgpalett, glödande lagfärg och strategiska ikoner
- [ ] Byggeffekt (nanostrålar från byggaren och en "wireframe" som fylls i)
- [ ] glTF-modeller i stället för boxar
- [ ] Ljud: skott, explosioner och "Construction complete"
- [ ] Minimap

---

## Arbetsflöde per steg

1. Välj nästa oavbockade steg.
2. Skriv testet först om steget gäller sim-logik.
3. Implementera det minsta som får steget att fungera.
4. Verifiera manuellt i webbläsaren.
5. Bocka av steget och gör en commit (`git commit -m "5.2 flödesfält"`).
