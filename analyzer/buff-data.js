// MoP Shadow Priest Buff Data
// Based on Wrath analyzer architecture, adapted for MoP mechanics

const BuffTrigger = {
  CAST_END: 'CAST_END',
  ON_USE: 'ON_USE',
  EXTERNAL: 'EXTERNAL'
};

const AuraId = {
  // Player Buffs - Major Haste Cooldowns
  BLOODLUST: 2825, // Shaman
  HEROISM: 32182, // Shaman (Alliance)
  TIME_WARP: 80353, // Mage
  ANCIENT_HYSTERIA: 90355, // Hunter pet (Core Hound)

  // Racials
  BERSERKING: 26297, // Troll 20% haste

  // Priest Buffs
  POWER_INFUSION: 10060, // 20% haste, 5% damage
  SHADOWFORM: 15473, // 5% haste (always active for Shadow)
  BORROWED_TIME: 59889, // 15% haste after casting PWS (Disc talent, unlikely in Shadow logs)

  // Raid Buffs
  DARK_INTENT: 109773, // Warlock buff: 3% haste

  // MoP Trinket Procs (Common ones - add more as needed)
  SPIRITS_OF_THE_SUN: 138486, // Unerring Vision of Lei Shen proc
  SOOTHING_TALISMAN: 138759, // Rune of Re-Origination proc
  BREATH_OF_THE_HYDRA: 138374, // Breath of the Hydra proc

  // Engineering
  SYNAPSE_SPRINGS: 96228, // Engineering hands enchant

  // Set Bonuses (tracked as pseudo-buffs)
  T14_2PC: 123159, // 2pc: Mind Blast reduces DP cooldown (not a visible buff)
  T14_4PC: 123160, // 4pc: Orb generation (not a visible buff)

  // Tier 15 trinkets
  UNERRING_VISION: 138486,
  RUNE_OF_REORIGINATION: 139117,

  // From Darkness, Comes Light proc
  SURGE_OF_DARKNESS: 87160, // Free instant SW:D
  SURGE_OF_LIGHT: 114255, // Free instant Mind Spike (if talented)
  TWIST_OF_FATE: 123254, // 15% increased damage/healing after killing blow

  // Profession Enchants/Procs
  JADE_SPIRIT: 104993, // Weapon enchant: 2000 int proc
  LIGHTWEAVE: 125487, // Tailoring cloak enchant: 2000 int proc
  NITRO_BOOSTS: 54861, // Engineering belt tinker

  // Raid Cooldowns
  SKULL_BANNER: 114206, // Warrior banner: 20% crit chance

  // Additional Trinket Procs
  QUICKENED_TONGUES: 126659, // Trinket proc
  INNER_BRILLIANCE: 126577, // Trinket proc

  // Vampiric Touch refresh mechanic
  VT_REFRESH: 34914 // Not a real buff, but tracks VT refresh timing
};

// Default buff values
const BUFF_DEFAULTS = {
  haste: 0,
  hasteRating: 0,
  damage: 0,
  trigger: BuffTrigger.EXTERNAL,
  doesNotStackWith: [],
  summaryIcon: false,
  detailsIcon: true,
  debuff: false,
  maxStack: 0
};

// Helper to create buff data with defaults
function buff(params = {}) {
  return Object.assign({}, BUFF_DEFAULTS, params);
}

// MoP Buff Definitions
const BUFFS = {
  // Major Haste Cooldowns (30% haste, don't stack with each other or PI)
  [AuraId.BLOODLUST]: buff({
    name: 'Bloodlust',
    haste: 0.30,
    trigger: BuffTrigger.EXTERNAL,
    doesNotStackWith: [AuraId.HEROISM, AuraId.TIME_WARP, AuraId.ANCIENT_HYSTERIA, AuraId.POWER_INFUSION],
    summaryIcon: true
  }),

  [AuraId.HEROISM]: buff({
    name: 'Heroism',
    haste: 0.30,
    trigger: BuffTrigger.EXTERNAL,
    doesNotStackWith: [AuraId.BLOODLUST, AuraId.TIME_WARP, AuraId.ANCIENT_HYSTERIA, AuraId.POWER_INFUSION],
    summaryIcon: true
  }),

  [AuraId.TIME_WARP]: buff({
    name: 'Time Warp',
    haste: 0.30,
    trigger: BuffTrigger.EXTERNAL,
    doesNotStackWith: [AuraId.BLOODLUST, AuraId.HEROISM, AuraId.ANCIENT_HYSTERIA, AuraId.POWER_INFUSION],
    summaryIcon: true
  }),

  [AuraId.ANCIENT_HYSTERIA]: buff({
    name: 'Ancient Hysteria',
    haste: 0.30,
    trigger: BuffTrigger.EXTERNAL,
    doesNotStackWith: [AuraId.BLOODLUST, AuraId.HEROISM, AuraId.TIME_WARP, AuraId.POWER_INFUSION],
    summaryIcon: true
  }),

  // Power Infusion (20% haste, doesn't stack with lust)
  [AuraId.POWER_INFUSION]: buff({
    name: 'Power Infusion',
    haste: 0.20,
    damage: 0.05, // Also gives 5% damage
    trigger: BuffTrigger.EXTERNAL,
    doesNotStackWith: [AuraId.BLOODLUST, AuraId.HEROISM, AuraId.TIME_WARP, AuraId.ANCIENT_HYSTERIA],
    summaryIcon: true
  }),

  // Shadowform (passive 5% haste for Shadow Priests)
  [AuraId.SHADOWFORM]: buff({
    name: 'Shadowform',
    haste: 0.05,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: false, // Always active, don't show
    detailsIcon: false
  }),

  // Racials
  [AuraId.BERSERKING]: buff({
    name: 'Berserking',
    haste: 0.20,
    trigger: BuffTrigger.ON_USE,
    summaryIcon: true
  }),

  // Raid Buffs
  [AuraId.DARK_INTENT]: buff({
    name: 'Dark Intent',
    haste: 0.03,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: false, // Raid buff, always present
    detailsIcon: false
  }),

  // Engineering
  [AuraId.SYNAPSE_SPRINGS]: buff({
    name: 'Synapse Springs',
    hasteRating: 480, // 480 intellect, but gives haste via stat conversion
    trigger: BuffTrigger.ON_USE,
    summaryIcon: true
  }),

  // Proc Trinkets (example values - adjust based on item level)
  [AuraId.SPIRITS_OF_THE_SUN]: buff({
    name: 'Spirits of the Sun',
    hasteRating: 4998, // Lei Shen trinket proc
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.SOOTHING_TALISMAN]: buff({
    name: 'Soothing Talisman',
    hasteRating: 8000, // Rune of Re-Origination proc (example)
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.BREATH_OF_THE_HYDRA]: buff({
    name: 'Breath of the Hydra',
    hasteRating: 4500, // Example proc value
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  // Tier 15 trinkets
  [AuraId.UNERRING_VISION]: buff({
    name: 'Unerring Vision of Lei Shen',
    hasteRating: 4998,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.RUNE_OF_REORIGINATION]: buff({
    name: 'Rune of Re-Origination',
    hasteRating: 8000,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  // Talent Procs
  [AuraId.SURGE_OF_DARKNESS]: buff({
    name: 'Surge of Darkness',
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.SURGE_OF_LIGHT]: buff({
    name: 'Surge of Light',
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.TWIST_OF_FATE]: buff({
    name: 'Twist of Fate',
    damage: 0.15,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  // Profession Enchants
  [AuraId.JADE_SPIRIT]: buff({
    name: 'Jade Spirit',
    intellect: 2000, // Intellect buff, not haste
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.LIGHTWEAVE]: buff({
    name: 'Lightweave',
    hasteRating: 2000,
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.NITRO_BOOSTS]: buff({
    name: 'Nitro Boosts',
    trigger: BuffTrigger.ON_USE,
    summaryIcon: true
  }),

  // Raid Cooldowns
  [AuraId.SKULL_BANNER]: buff({
    name: 'Skull Banner',
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  // Trinket Procs
  [AuraId.QUICKENED_TONGUES]: buff({
    name: 'Quickened Tongues',
    hasteRating: 7000, // Essence of Terror proc (varies by ilvl: 6908@496, 7796@509)
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  }),

  [AuraId.INNER_BRILLIANCE]: buff({
    name: 'Inner Brilliance',
    intellect: 1000, // Intellect buff, not haste
    trigger: BuffTrigger.EXTERNAL,
    summaryIcon: true
  })
};

// Create lookup by aura ID
const BUFF_DATA = {};
Object.keys(BUFFS).forEach(auraId => {
  const data = BUFFS[auraId];
  data.id = parseInt(auraId);
  BUFF_DATA[auraId] = data;
});

// Get buff data by ID
function getBuffData(auraId, stackCount = 1) {
  const data = BUFF_DATA[auraId];
  if (!data) {
    return null;
  }

  // Clone and set stack count
  const buffInstance = Object.assign({}, data);
  buffInstance.stack = data.maxStack > 0 ? stackCount : 0;

  return buffInstance;
}

// Check if an aura ID is a debuff
function isDebuff(auraId) {
  return BUFF_DATA[auraId]?.debuff || false;
}

// Handle buffs that don't stack
// Returns true if this buff should be included, false if a stronger buff exists
function includeBuff(buff, activeBuffs) {
  if (!buff.doesNotStackWith || buff.doesNotStackWith.length === 0) {
    return true;
  }

  // Check if any non-stacking buffs are active
  for (const otherId of buff.doesNotStackWith) {
    const otherBuff = activeBuffs.find(b => b.id === otherId);
    if (otherBuff && yieldPriority(buff, otherBuff, activeBuffs)) {
      return false;
    }
  }

  return true;
}

// Determine if buff should yield to other
// Yields if other has larger haste, or if equal haste, other came first
function yieldPriority(buff, other, activeBuffs) {
  if (other.haste > buff.haste) {
    return true;
  }

  if (other.haste === buff.haste) {
    return activeBuffs.findIndex(b => b.id === other.id) < activeBuffs.findIndex(b => b.id === buff.id);
  }

  return false;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BuffTrigger,
    AuraId,
    BUFF_DATA,
    getBuffData,
    isDebuff,
    includeBuff
  };
}

// Also export to window for browser use
if (typeof window !== 'undefined') {
  window.BUFF_DATA = BUFF_DATA;
  window.getBuffData = getBuffData;
  window.isDebuff = isDebuff;
  window.includeBuff = includeBuff;
  window.BuffTrigger = BuffTrigger;
  window.AuraId = AuraId;
}
