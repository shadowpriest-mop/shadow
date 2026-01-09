// MoP Shadow Priest Spell Data
// Based on Wrath analyzer architecture, adapted for MoP mechanics

const DamageType = {
  NONE: 0,
  DIRECT: 1,
  DOT: 2,
  CHANNEL: 3,
  AOE: 4
};

const SpellId = {
  NONE: 0,

  // Shadow Priest Abilities (MoP - no ranks!)
  MIND_BLAST: 8092,
  MIND_FLAY: 15407,
  MIND_FLAY_INSANITY: 129197,
  MIND_SEAR: 48045,
  MIND_SPIKE: 73510,
  SHADOW_WORD_PAIN: 589,
  SHADOW_WORD_DEATH: 32379,
  VAMPIRIC_TOUCH: 34914,
  DEVOURING_PLAGUE: 2944,
  SHADOWFIEND: 34433,
  SHADOWFIEND_ALT: 132603, // Alternative Shadowfiend ID
  MINDBENDER: 132604, // Talent version of Shadowfiend
  DISPERSION: 47585,
  VAMPIRIC_EMBRACE: 15286,
  HALO: 120644,
  CASCADE: 127632,
  DIVINE_STAR: 122121,
  PSYCHIC_HORROR: 64044,
  MIND_BOMB: 105421,
  SILENCE: 15487,
  POWER_WORD_SHIELD: 17,
  RENEW: 139,
  INNER_FIRE: 588,
  POWER_INFUSION: 10060,
  ANGELIC_FEATHER: 121536,
  DESPERATE_PRAYER: 19236,

  // Racials
  BERSERKING: 26297, // Troll

  // Engineering/Professions
  SYNAPSE_SPRINGS: 126734, // Engineering tinker (gloves)
  GOBLIN_GLIDER: 126389, // Goblin Glider (engineering)
  G91_LANDSHARK: 124199, // G91 Landshark (engineering mount)

  // Consumables
  POTION_OF_THE_JADE_SERPENT: 105702, // Intellect potion
  HEALTHSTONE: 6262, // Warlock healthstone

  // Related damage IDs (DoT ticks, channeled ticks, etc.)
  MIND_FLAY_TICK: 15407, // MF uses same ID for cast and damage
  MIND_FLAY_INSANITY_TICK: 129197, // MF:I uses same ID
  MIND_SEAR_TICK: 49821,
  HALO_DAMAGE: 120696,
  CASCADE_DAMAGE: 127628,
  DIVINE_STAR_DAMAGE: 122128,

  // Pseudo spell IDs for melee
  PSEUDO_SPELL_BASE: 10000000,
  MELEE: 10000032
};

// Default values for spell data
const SPELL_DEFAULTS = {
  damageIds: [],
  baseCastTime: 0,
  maxDamageInstances: 0,
  maxDuration: 0,
  maxTicks: 0,
  baseTickTime: 0,
  cooldown: 0,
  gcd: true,
  dotHaste: false,
  statsByTick: false,
  multiTarget: false,
};

// Helper to create spell data with defaults
function spell(params = {}) {
  return Object.assign({}, SPELL_DEFAULTS, params);
}

// MoP Spell Definitions
const SPELLS = {
  [SpellId.SHADOW_WORD_PAIN]: spell({
    name: 'Shadow Word: Pain',
    damageType: DamageType.DOT,
    dotHaste: false, // SWP does NOT snapshot haste in MoP
    maxDamageInstances: 6,
    maxDuration: 18,
    maxTicks: 6,
    baseTickTime: 3
  }),

  [SpellId.VAMPIRIC_TOUCH]: spell({
    name: 'Vampiric Touch',
    damageType: DamageType.DOT,
    dotHaste: true, // VT snapshots haste in MoP
    baseCastTime: 1.5,
    maxDamageInstances: 5,
    maxDuration: 15,
    maxTicks: 5,
    baseTickTime: 3
  }),

  [SpellId.DEVOURING_PLAGUE]: spell({
    name: 'Devouring Plague',
    damageType: DamageType.DOT,
    dotHaste: true, // DP snapshots haste in MoP
    maxDamageInstances: 6,
    maxDuration: 6,
    maxTicks: 6,
    baseTickTime: 1,
    requiresOrbs: 3 // MoP specific: requires 3 Shadow Orbs
  }),

  [SpellId.MIND_BLAST]: spell({
    name: 'Mind Blast',
    damageType: DamageType.DIRECT,
    baseCastTime: 1.5,
    maxDamageInstances: 1,
    cooldown: 8, // Base cooldown, can be reduced by talents
    generatesOrbs: 1 // MoP specific: generates 1 Shadow Orb
  }),

  [SpellId.MIND_SPIKE]: spell({
    name: 'Mind Spike',
    damageType: DamageType.DIRECT,
    baseCastTime: 1.5,
    maxDamageInstances: 1,
    cooldown: 0
  }),

  [SpellId.MIND_FLAY]: spell({
    name: 'Mind Flay',
    damageIds: [SpellId.MIND_FLAY_TICK],
    damageType: DamageType.CHANNEL,
    maxDamageInstances: 3,
    maxDuration: 3,
    maxTicks: 3,
    baseTickTime: 1,
    statsByTick: true
  }),

  [SpellId.MIND_FLAY_INSANITY]: spell({
    name: 'Mind Flay: Insanity',
    damageIds: [SpellId.MIND_FLAY_INSANITY_TICK],
    damageType: DamageType.CHANNEL,
    maxDamageInstances: 3,
    maxDuration: 3,
    maxTicks: 3,
    baseTickTime: 1,
    statsByTick: true,
    requiresInsanity: true // MoP specific: only castable while DP is active
  }),

  [SpellId.SHADOW_WORD_DEATH]: spell({
    name: 'Shadow Word: Death',
    damageType: DamageType.DIRECT,
    maxDamageInstances: 1,
    cooldown: 10 // 10 second cooldown, 2 charges in MoP
  }),

  [SpellId.SHADOWFIEND]: spell({
    name: 'Shadowfiend',
    damageType: DamageType.DIRECT,
    maxDuration: 15,
    cooldown: 180
  }),

  [SpellId.SHADOWFIEND_ALT]: spell({
    name: 'Shadowfiend',
    damageType: DamageType.DIRECT,
    maxDuration: 15,
    cooldown: 180
  }),

  [SpellId.MINDBENDER]: spell({
    name: 'Mindbender',
    damageType: DamageType.DIRECT,
    maxDuration: 15,
    cooldown: 60 // Mindbender has shorter cooldown than Shadowfiend
  }),

  [SpellId.DISPERSION]: spell({
    name: 'Dispersion',
    damageType: DamageType.NONE,
    cooldown: 120,
    gcd: true
  }),

  [SpellId.VAMPIRIC_EMBRACE]: spell({
    name: 'Vampiric Embrace',
    damageType: DamageType.NONE,
    cooldown: 180
  }),

  [SpellId.HALO]: spell({
    name: 'Halo',
    damageIds: [SpellId.HALO_DAMAGE],
    damageType: DamageType.AOE,
    baseCastTime: 1.5,
    maxDamageInstances: 0, // Variable based on targets
    cooldown: 40,
    multiTarget: true,
    hasTravelTime: true // Damage delayed due to projectile travel
  }),

  [SpellId.CASCADE]: spell({
    name: 'Cascade',
    damageIds: [SpellId.CASCADE_DAMAGE],
    damageType: DamageType.AOE,
    baseCastTime: 1.5,
    maxDamageInstances: 0,
    cooldown: 25,
    multiTarget: true,
    hasTravelTime: true // Damage delayed due to projectile travel
  }),

  [SpellId.DIVINE_STAR]: spell({
    name: 'Divine Star',
    damageIds: [SpellId.DIVINE_STAR_DAMAGE],
    damageType: DamageType.AOE,
    baseCastTime: 1.5,
    maxDamageInstances: 0,
    cooldown: 15,
    multiTarget: true,
    hasTravelTime: true // Damage delayed due to projectile travel
  }),

  [SpellId.MIND_SEAR]: spell({
    name: 'Mind Sear',
    damageIds: [SpellId.MIND_SEAR_TICK],
    damageType: DamageType.CHANNEL,
    maxDamageInstances: 0, // Variable based on targets
    maxDuration: 5,
    maxTicks: 5,
    baseTickTime: 1,
    multiTarget: true
  }),

  [SpellId.MIND_SEAR_TICK]: spell({
    name: 'Mind Sear',
    damageType: DamageType.CHANNEL,
    multiTarget: true
  }),

  [SpellId.BERSERKING]: spell({
    name: 'Berserking',
    damageType: DamageType.NONE,
    cooldown: 180,
    gcd: false
  }),

  [SpellId.SYNAPSE_SPRINGS]: spell({
    name: 'Synapse Springs',
    damageType: DamageType.NONE,
    cooldown: 60,
    gcd: false
  }),

  [SpellId.SILENCE]: spell({
    name: 'Silence',
    damageType: DamageType.NONE,
    cooldown: 45,
    gcd: true
  }),

  [SpellId.POWER_WORD_SHIELD]: spell({
    name: 'Power Word: Shield',
    damageType: DamageType.NONE,
    gcd: true
  }),

  [SpellId.RENEW]: spell({
    name: 'Renew',
    damageType: DamageType.NONE,
    maxDuration: 15,
    gcd: true
  }),

  [SpellId.INNER_FIRE]: spell({
    name: 'Inner Fire',
    damageType: DamageType.NONE,
    gcd: false
  }),

  [SpellId.POWER_INFUSION]: spell({
    name: 'Power Infusion',
    damageType: DamageType.NONE,
    cooldown: 120,
    gcd: false
  }),

  [SpellId.ANGELIC_FEATHER]: spell({
    name: 'Angelic Feather',
    damageType: DamageType.NONE,
    cooldown: 0,
    gcd: true
  }),

  [SpellId.DESPERATE_PRAYER]: spell({
    name: 'Desperate Prayer',
    damageType: DamageType.NONE,
    cooldown: 120,
    gcd: true
  }),

  [SpellId.GOBLIN_GLIDER]: spell({
    name: 'Goblin Glider',
    damageType: DamageType.NONE,
    cooldown: 0,
    gcd: false
  }),

  [SpellId.G91_LANDSHARK]: spell({
    name: 'G91 Landshark',
    damageType: DamageType.NONE,
    cooldown: 0,
    gcd: false
  }),

  [SpellId.POTION_OF_THE_JADE_SERPENT]: spell({
    name: 'Potion of the Jade Serpent',
    damageType: DamageType.NONE,
    gcd: false
  }),

  [SpellId.HEALTHSTONE]: spell({
    name: 'Healthstone',
    damageType: DamageType.NONE,
    cooldown: 120,
    gcd: false
  }),

  [SpellId.MELEE]: spell({
    name: 'Melee',
    damageType: DamageType.DIRECT,
    gcd: false
  })
};

// Create lookup by spell ID
const SPELL_DATA = {};
Object.keys(SPELLS).forEach(spellId => {
  const data = SPELLS[spellId];
  data.mainId = parseInt(spellId);
  SPELL_DATA[spellId] = data;
});

// Map WCL ability IDs (ability.guid) to local spell ID
// Handles negative IDs (melee, etc.)
function mapSpellId(guid) {
  if (guid > 0) {
    return guid;
  }
  return SpellId.PSEUDO_SPELL_BASE + Math.abs(guid);
}

// Get spell data by ID
function getSpellData(spellId) {
  return SPELL_DATA[spellId];
}

// Get spell data from damage ID
function getSpellFromDamageId(damageId) {
  if (SPELL_DATA[damageId]) {
    return SPELL_DATA[damageId];
  }

  // Search for spell that has this damage ID
  return Object.values(SPELL_DATA).find(spell =>
    spell.damageIds && spell.damageIds.includes(damageId)
  );
}

// Export for use in other modules
// Browser globals
if (typeof window !== 'undefined') {
  window.DamageType = DamageType;
  window.SpellId = SpellId;
  window.SPELL_DATA = SPELL_DATA;
  window.mapSpellId = mapSpellId;
  window.getSpellData = getSpellData;
  window.getSpellFromDamageId = getSpellFromDamageId;
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DamageType,
    SpellId,
    SPELL_DATA,
    mapSpellId,
    getSpellData,
    getSpellFromDamageId
  };
}
