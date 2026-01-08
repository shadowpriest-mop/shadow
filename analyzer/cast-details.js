// MoP Cast Details Model
// Adapted from Wrath analyzer cast-details.ts

class CastDetails {
  constructor(params) {
    this.spellId = params.spellId;
    this.name = params.name;
    this.rank = params.rank;
    this.castStart = params.castStart;
    this.castEnd = params.castEnd;
    this.castTimeMs = params.castEnd - params.castStart;

    this.sourceId = params.sourceId;
    this.targetId = params.targetId;
    this.targetInstance = params.targetInstance || 0;

    this.buffs = params.buffs || [];
    this.spellPower = params.spellPower || 0;
    this.haste = params.haste || 0;
    this.gcd = params.gcd || 1.0;

    // Damage tracking
    this.instances = [];
    this.totalDamage = 0;
    this.hits = 0;
    this.crits = 0;
    this.failed = false;
    this.resisted = false;

    // Quality metrics (calculated by CastsAnalyzer)
    this.nextCastLatency = undefined; // ms delay to next cast
    this.dotDowntime = undefined; // ms gap before DoT refresh
    this.clippedPreviousCast = false; // did this refresh clip the previous DoT?
    this.clippedTicks = 0; // how many ticks were lost
    this.clippedEarly = false; // did we stop Mind Flay too early?
    this.timeOffCooldown = undefined; // ms Mind Blast was ready but not used
    this.truncated = false; // target died during cast
  }

  setInstances(instances) {
    this.instances = instances;

    this.totalDamage = 0;
    this.hits = 0;
    this.crits = 0;

    for (const instance of instances) {
      this.totalDamage += instance.amount;

      if (!instance.resisted && !instance.immune) {
        this.hits++;
      }

      if (instance.critical) {
        this.crits++;
      }
    }

    this.failed = this.instances.length === 0 || this.hits === 0;
    this.resisted = this.instances.some(i => i.resisted);
  }

  get lastDamageTimestamp() {
    if (this.instances.length === 0) {
      return undefined;
    }

    return this.instances[this.instances.length - 1].timestamp;
  }

  hasSameTarget(other) {
    return other.targetId === this.targetId &&
           other.targetInstance === this.targetInstance;
  }

  /**
   * Get buffs that should show in cast summary (collapsed view)
   */
  get summaryBuffs() {
    if (!this._summaryBuffs) {
      this._summaryBuffs = this.buffs.filter(buff => buff.summaryIcon);
    }
    return this._summaryBuffs;
  }

  /**
   * Get buffs that should show in cast details (expanded view)
   */
  get detailBuffs() {
    if (!this._detailBuffs) {
      this._detailBuffs = this.buffs.filter(buff => buff.detailsIcon);
    }
    return this._detailBuffs;
  }

  /**
   * Check if cast has a specific buff active
   */
  hasBuff(auraId) {
    return this.buffs.some(b => b.id === auraId);
  }
}

class DamageInstance {
  constructor(event, castTimestamp = null) {
    this.timestamp = event.timestamp;
    this.targetId = event.targetID;
    this.targetInstance = event.targetInstance || 0;
    this.amount = event.amount || 0;
    this.absorbed = event.absorbed || 0;
    this.resisted = event.resisted || 0;
    this.critical = event.hitType === 2; // 2 = crit in WCL
    this.immune = event.hitType === 9; // 9 = immune
    this.resisted = event.hitType === 8; // 8 = resist

    // Calculate time difference and distance (for projectile spells like Halo)
    if (castTimestamp !== null) {
      this.timeDiff = event.timestamp - castTimestamp; // ms
      this.distance = Math.round((this.timeDiff / 100) * 10) / 10; // 1 yard per 0.1s (100ms), rounded to 1 decimal
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CastDetails, DamageInstance };
}
