// MoP Shadow Priest Settings
// Configuration for talents, set bonuses, and other dynamic options

class MoPSettings {
  constructor(settings = {}) {
    // Haste rating from gear (if not available in combatant data)
    this.hasteRating = settings.hasteRating || null;

    // Talent Selections
    // Tier 2 (Level 30) - Mobility/CC
    this.tier2 = settings.tier2 || 'none'; // Options: 'psyfiend', 'dominate_mind', 'mind_bomb'

    // Tier 3 (Level 45) - From Darkness, Comes Light
    this.fromDarknessComesLight = settings.fromDarknessComesLight !== undefined ? settings.fromDarknessComesLight : false;

    // Tier 4 (Level 60) - Solace and Insanity (CRITICAL for rotation)
    this.solaceAndInsanity = settings.solaceAndInsanity !== undefined ? settings.solaceAndInsanity : true;

    // Tier 5 (Level 75) - Utility
    this.tier5 = settings.tier5 || 'none'; // Options: 'twist_of_fate', 'power_infusion', 'divine_insight'

    // Tier 6 (Level 90) - AoE spell
    this.tier6 = settings.tier6 || 'halo'; // Options: 'divine_star', 'cascade', 'halo'

    // Set Bonuses
    // T14 2pc: Mind Blast reduces DP cooldown by 1 sec
    this.t14_2pc = settings.t14_2pc !== undefined ? settings.t14_2pc : false;

    // T14 4pc: Generating 3 shadow orbs grants Dark Evangelism
    this.t14_4pc = settings.t14_4pc !== undefined ? settings.t14_4pc : false;

    // T15 2pc: Increases VT and SW:P periodic damage by 10%
    this.t15_2pc = settings.t15_2pc !== undefined ? settings.t15_2pc : false;

    // T15 4pc: Shadow Word: Death crits grant 15% haste for 6 sec
    this.t15_4pc = settings.t15_4pc !== undefined ? settings.t15_4pc : false;

    // T16 2pc: Mind Flay has a chance to spawn Shadowy Apparitions
    this.t16_2pc = settings.t16_2pc !== undefined ? settings.t16_2pc : false;

    // T16 4pc: Mind Blast cost reduced by 1 Shadow Orb
    this.t16_4pc = settings.t16_4pc !== undefined ? settings.t16_4pc : false;

    // Glyphs
    this.glyphOfMindFlay = settings.glyphOfMindFlay !== undefined ? settings.glyphOfMindFlay : false;
    this.glyphOfShadowWordDeath = settings.glyphOfShadowWordDeath !== undefined ? settings.glyphOfShadowWordDeath : false;

    // Raid Buffs (for inference if not in logs)
    this.darkIntent = settings.darkIntent !== undefined ? settings.darkIntent : true; // Assume warlock present
  }

  /**
   * Check if two settings objects are equal
   */
  equals(other) {
    return this.hasteRating === other.hasteRating &&
           this.tier2 === other.tier2 &&
           this.fromDarknessComesLight === other.fromDarknessComesLight &&
           this.solaceAndInsanity === other.solaceAndInsanity &&
           this.tier5 === other.tier5 &&
           this.tier6 === other.tier6 &&
           this.t14_2pc === other.t14_2pc &&
           this.t14_4pc === other.t14_4pc &&
           this.t15_2pc === other.t15_2pc &&
           this.t15_4pc === other.t15_4pc &&
           this.t16_2pc === other.t16_2pc &&
           this.t16_4pc === other.t16_4pc &&
           this.glyphOfMindFlay === other.glyphOfMindFlay &&
           this.glyphOfShadowWordDeath === other.glyphOfShadowWordDeath &&
           this.darkIntent === other.darkIntent;
  }

  /**
   * Get Mind Blast cooldown based on talents/set bonuses
   */
  getMindBlastCooldown() {
    // Base cooldown is 8 seconds
    // No talents or set bonuses modify this in MoP (unlike Wrath's Improved Mind Blast)
    return 8;
  }

  /**
   * Get Devouring Plague orb cost based on set bonuses
   */
  getDevouringPlagueOrbCost() {
    // T16 4pc reduces cost by 1 orb
    return this.t16_4pc ? 2 : 3;
  }

  /**
   * Check if Mind Flay: Insanity is available
   */
  hasMindFlayInsanity() {
    return this.solaceAndInsanity;
  }

  /**
   * Get tier 6 talent spell (for tab display)
   */
  getTier6Spell() {
    switch (this.tier6) {
      case 'divine_star':
        return 'Divine Star';
      case 'cascade':
        return 'Cascade';
      case 'halo':
      default:
        return 'Halo';
    }
  }

  /**
   * Serialize to JSON for storage
   */
  toJSON() {
    return {
      hasteRating: this.hasteRating,
      tier2: this.tier2,
      fromDarknessComesLight: this.fromDarknessComesLight,
      solaceAndInsanity: this.solaceAndInsanity,
      tier5: this.tier5,
      tier6: this.tier6,
      t14_2pc: this.t14_2pc,
      t14_4pc: this.t14_4pc,
      t15_2pc: this.t15_2pc,
      t15_4pc: this.t15_4pc,
      t16_2pc: this.t16_2pc,
      t16_4pc: this.t16_4pc,
      glyphOfMindFlay: this.glyphOfMindFlay,
      glyphOfShadowWordDeath: this.glyphOfShadowWordDeath,
      darkIntent: this.darkIntent
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new MoPSettings(json);
  }
}

// Default settings
const DEFAULT_SETTINGS = new MoPSettings({
  solaceAndInsanity: true,
  tier6: 'halo',
  darkIntent: true
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MoPSettings,
    DEFAULT_SETTINGS
  };
}
