/**
 * ACU-uppgraderingar (enhancements) med värden från FAF:s blueprint för UEF
 * ACU:n (units/UEL0001/UEL0001_unit.bp, Enhancements) och effekterna från
 * UEL0001_script.lua.
 *
 * - `slot`: FA:s plats, 'RCH' (höger arm), 'LCH' (vänster arm) eller 'Back'.
 *   Bara en uppgradering per plats; en ny ersätter den gamla.
 * - `buildTime`: som för byggnader, i sekunder vid byggkraft 1. ACU:n bygger
 *   den på sig själv och ingenjörer kan assistera.
 * - `weapon`: `damageAdd` läggs på skadan (FA:s AddDamageMod) och `range`
 *   ersätter räckvidden (ChangeMaxRadius, halverad som övriga räckvidder).
 * - `maxHpAdd`, `regenAdd`: FA:s buff med MaxHealth.Add och Regen.Add.
 * - `productionAdd`: läggs på ACU:ns egen produktion.
 * - `description`: verktygstips i spelet (engelska).
 */
export default {
  /** HeavyAntiMatterCannon: ZephyrDamageMod = 100, NewMaxRadius = 30. */
  zephyrAmplifier: {
    name: 'Zephyr Amplifier',
    slot: 'RCH',
    cost: { mass: 800, energy: 24000 },
    buildTime: 800,
    weapon: { damageAdd: 100, range: 15 },
    description: '+100 cannon damage, range 11 → 15',
  },

  /** DamageStabilization: NewHealth = 1500, NewRegenRate = 40. */
  nanoRepair: {
    name: 'Nano-Repair System',
    slot: 'LCH',
    cost: { mass: 800, energy: 24000 },
    buildTime: 800,
    maxHpAdd: 1500,
    regenAdd: 40,
    description: '+1500 max HP, +40 HP/s regeneration',
  },

  /** ResourceAllocation: ProductionPerSecondMass = 14, ProductionPerSecondEnergy = 2500. */
  resourceAllocation: {
    name: 'Resource Allocation System',
    slot: 'RCH',
    cost: { mass: 5000, energy: 175000 },
    buildTime: 2800,
    productionAdd: { mass: 14, energy: 2500 },
    description: '+14 mass/s, +2500 energy/s',
  },
};
