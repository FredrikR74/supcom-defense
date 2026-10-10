/**
 * Balanstest utan grafik: en enkel skriptad spelare spelar den riktiga
 * simuleringen och vi mäter hur länge kärnan överlever vid olika svårighetsgrader.
 *
 *   node scripts/balance.mjs [svårighetsgrad ...] [--minutes=30] [--map=firstDefense]
 *
 * Spelaren: ACU:n bygger Mass Extractors på platån, generatorer, en Land Factory
 * (Strikers på repetering, samlingspunkt vid kärnan) och sedan Point Defense i en
 * ring runt kärnan, plus fler generatorer när energin tryter. Inget mer avancerat:
 * det är en riktlinje för hur trycket växer, inte ett facit.
 */
import { createWorld, tickWorld, PLAYER_ID, ENEMY_ID } from '../src/sim/world.js';
import { queueCommand } from '../src/sim/commands.js';
import { getEntity, isIdleBuilder } from '../src/sim/entities.js';
import { canPlace } from '../src/sim/placement.js';
import maps from '../src/data/maps/index.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const difficulties = args.filter((a) => !a.startsWith('--')).map(Number);
const minutes = Number(option('minutes', 30));
const map = maps.find((m) => m.id === option('map', 'firstDefense'));

function cmd(world, c) {
  queueCommand(world, { owner: PLAYER_ID, ...c });
}

/** Lediga platser för en byggnad i en ring runt kärnan. */
function* ringSpots(world, type, radius) {
  const { x: cx, z: cz } = world.map.core;
  for (let a = 0; a < 360; a += 15) {
    const x = Math.round(cx + radius * Math.cos((a * Math.PI) / 180)) + 0.5;
    const z = Math.round(cz + radius * Math.sin((a * Math.PI) / 180)) + 0.5;
    const pos = type === 'powerGenerator' ? { x: Math.round(x), z: Math.round(z) } : { x, z };
    if (canPlace(world, type, pos.x, pos.z).ok) yield pos;
  }
}

function play(difficulty) {
  const world = createWorld({ map, config: { difficulty } });
  const economy = world.players[PLAYER_ID].economy;
  const core = world.map.core;
  let opening = true;
  let factoryId = null;
  let pdRadius = 9;

  const plateauDeposits = world.map.massDeposits.filter((d) => Math.hypot(d.x - core.x, d.z - core.z) < 14);
  const build = (structure, pos, queue = true) =>
    cmd(world, { type: 'build', ids: [world.acuId], structure, x: pos.x, z: pos.z, queue });

  const totalTicks = minutes * 60 * 10;
  for (let t = 0; t < totalTicks; t++) {
    if (world.director.state === 'defeat') break;
    const acu = getEntity(world, world.acuId);

    if (opening && acu) {
      plateauDeposits.forEach((d) => build('massExtractor', d));
      build('powerGenerator', ringSpots(world, 'powerGenerator', 7).next().value);
      build('landFactory', { x: core.x, z: core.z + 10 });
      opening = false;
    }

    if (factoryId == null) {
      const f = world.entities.find((e) => e.type === 'landFactory' && e.owner === PLAYER_ID);
      if (f?.built) {
        factoryId = f.id;
        cmd(world, { type: 'setRally', ids: [f.id], x: core.x, z: core.z + 6 });
        cmd(world, { type: 'setRepeat', ids: [f.id], value: true });
        cmd(world, { type: 'produce', id: f.id, unit: 'striker', count: 2 });
      }
    }

    // Var 5:e sekund: en sysslolös ACU bygger energi vid brist, annars nästa torn.
    if (t % 50 === 0 && acu && isIdleBuilder(acu)) {
      const lowEnergy = economy.energy.stored < 1000 && economy.energy.income < economy.energy.requested + 20;
      const type = lowEnergy ? 'powerGenerator' : 'pointDefense';
      const spot = ringSpots(world, type, type === 'pointDefense' ? pdRadius : 7).next().value;
      if (spot) build(type, spot, false);
      else if (type === 'pointDefense') pdRadius += 2;
    }
    tickWorld(world);
  }

  const count = (pred) => world.entities.filter(pred).length;
  return {
    difficulty,
    survived: world.director.state === 'defeat' ? world.director.elapsed : `>${minutes * 60}`,
    pointDefenses: count((e) => e.type === 'pointDefense' && e.built),
    strikers: count((e) => e.type === 'striker'),
    enemiesAlive: count((e) => e.owner === ENEMY_ID && e.kind === 'unit'),
    enemyMassSpent: Math.round(world.director.spentMass),
  };
}

const fmt = (s) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s} s`);
for (const d of difficulties.length ? difficulties : [25, 50, 75]) {
  const t0 = Date.now();
  const r = play(d);
  console.log(
    `difficulty ${String(d).padStart(3)}: survived ${fmt(r.survived).padStart(7)}` +
    ` · PD ${r.pointDefenses} · Strikers ${r.strikers} · enemies alive ${r.enemiesAlive}` +
    ` · enemy mass ${r.enemyMassSpent} · (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}
