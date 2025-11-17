// Pre-Pull Action Checker for MoP Shadow Priest
// Validates that proper pre-pull actions were executed

const PrePullSpells = {
  HALO: 120644,
  HALO_DAMAGE: 120696,
  MIND_SPIKE: 73510,
  POTION_OF_JADE_SERPENT: 105702, // Cast ID
  POTION_BUFF: 114757 // Buff ID
};

const PREPULL_TIMING = {
  HALO: -2.5, // Should be cast at -2.5s
  MIND_SPIKE: -1.0, // Should be cast at -1s
  POTION: -1.0, // Should be used at -1s
  TOLERANCE: 0.5 // Allow 0.5s timing tolerance
};

class PrePullChecker {
  constructor(events, buffEvents, fightStart) {
    this.events = events || [];
    this.buffEvents = buffEvents || [];
    this.fightStart = fightStart;
    this.results = {
      halo: { found: false, timing: null, status: 'missing' },
      mindSpike: { found: false, timing: null, status: 'missing' },
      potion: { found: false, timing: null, status: 'missing', buffActive: false }
    };
  }

  /**
   * Main analysis function - check for pre-pull actions
   */
  analyze() {
    console.log('=== PrePullChecker.analyze() ===');
    console.log('Fight start time:', this.fightStart);
    console.log('Total events:', this.events.length);
    console.log('Total buff events:', this.buffEvents.length);

    this.checkHalo();
    this.checkMindSpike();
    this.checkPotion();

    console.log('Pre-pull check results:', this.results);
    return this.results;
  }

  /**
   * Check if Halo was cast in pre-pull
   */
  checkHalo() {
    // Look for Halo damage events around -2.5s
    // We check damage instead of cast because of travel time
    const haloDamageEvents = this.events.filter(e =>
      e.type === 'damage' &&
      e.abilityGameID === PrePullSpells.HALO_DAMAGE &&
      e.timestamp < this.fightStart
    );

    if (haloDamageEvents.length > 0) {
      // Find the earliest halo damage (should be the pre-pull one)
      const earliestHalo = haloDamageEvents.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestHalo.timestamp - this.fightStart) / 1000;
      this.results.halo.found = true;
      this.results.halo.timing = timingSeconds;

      // Check if timing is reasonable (-2 to -3.5 seconds)
      if (timingSeconds >= -3.5 && timingSeconds <= -2.0) {
        this.results.halo.status = 'good';
      } else {
        this.results.halo.status = 'notice'; // Found but timing is off
      }
    }
  }

  /**
   * Check if Mind Spike was cast in pre-pull
   */
  checkMindSpike() {
    // Look for Mind Spike cast events around -1s
    const mindSpikeEvents = this.events.filter(e =>
      (e.type === 'cast' || e.type === 'damage') &&
      e.abilityGameID === PrePullSpells.MIND_SPIKE &&
      e.timestamp < this.fightStart
    );

    if (mindSpikeEvents.length > 0) {
      // Find the latest mind spike before pull (should be the pre-pull one)
      const latestMindSpike = mindSpikeEvents.reduce((latest, current) =>
        current.timestamp > latest.timestamp ? current : latest
      );

      const timingSeconds = (latestMindSpike.timestamp - this.fightStart) / 1000;
      this.results.mindSpike.found = true;
      this.results.mindSpike.timing = timingSeconds;

      // Check if timing is reasonable (-0.5 to -1.5 seconds)
      if (timingSeconds >= -1.5 && timingSeconds <= -0.5) {
        this.results.mindSpike.status = 'good';
      } else {
        this.results.mindSpike.status = 'notice'; // Found but timing is off
      }
    }
  }

  /**
   * Check if Potion of Jade Serpent was used and buff is active
   */
  checkPotion() {
    // Look for potion buff at fight start
    // Check if buff is active at or very close to fight start
    const potionBuffs = this.buffEvents.filter(e =>
      e.abilityGameID === PrePullSpells.POTION_BUFF &&
      e.type === 'applybuff' &&
      e.timestamp <= this.fightStart &&
      e.timestamp >= this.fightStart - 5000 // Within 5 seconds before start
    );

    if (potionBuffs.length > 0) {
      const latestPotionBuff = potionBuffs.reduce((latest, current) =>
        current.timestamp > latest.timestamp ? current : latest
      );

      const timingSeconds = (latestPotionBuff.timestamp - this.fightStart) / 1000;
      this.results.potion.found = true;
      this.results.potion.buffActive = true;
      this.results.potion.timing = timingSeconds;

      // Check if timing is reasonable (-0.5 to -1.5 seconds)
      if (timingSeconds >= -1.5 && timingSeconds <= 0) {
        this.results.potion.status = 'good';
      } else {
        this.results.potion.status = 'notice'; // Found but timing might be off
      }
    } else {
      // Also check for potion cast events as fallback
      const potionCasts = this.events.filter(e =>
        (e.type === 'cast' || e.type === 'applybuff') &&
        (e.abilityGameID === PrePullSpells.POTION_OF_JADE_SERPENT ||
         e.abilityGameID === PrePullSpells.POTION_BUFF) &&
        e.timestamp < this.fightStart &&
        e.timestamp >= this.fightStart - 5000
      );

      if (potionCasts.length > 0) {
        const latestPotion = potionCasts.reduce((latest, current) =>
          current.timestamp > latest.timestamp ? current : latest
        );

        const timingSeconds = (latestPotion.timestamp - this.fightStart) / 1000;
        this.results.potion.found = true;
        this.results.potion.timing = timingSeconds;
        this.results.potion.status = 'good';
      }
    }
  }

  /**
   * Get overall pre-pull status
   */
  getOverallStatus() {
    const statuses = [
      this.results.halo.status,
      this.results.mindSpike.status,
      this.results.potion.status
    ];

    if (statuses.includes('missing')) {
      return 'warning';
    } else if (statuses.includes('notice')) {
      return 'notice';
    } else {
      return 'good';
    }
  }

  /**
   * Generate human-readable summary
   */
  getSummary() {
    const items = [];

    if (!this.results.halo.found) {
      items.push('Missing Halo pre-pull (-2.5s)');
    } else if (this.results.halo.status === 'notice') {
      items.push(`Halo timing off (${this.results.halo.timing.toFixed(1)}s, should be ~-2.5s)`);
    }

    if (!this.results.mindSpike.found) {
      items.push('Missing Mind Spike pre-pull (-1s)');
    } else if (this.results.mindSpike.status === 'notice') {
      items.push(`Mind Spike timing off (${this.results.mindSpike.timing.toFixed(1)}s, should be ~-1s)`);
    }

    if (!this.results.potion.found) {
      items.push('Missing Potion of Jade Serpent pre-pull (-1s)');
    } else if (!this.results.potion.buffActive) {
      items.push('Potion buff not active at pull');
    } else if (this.results.potion.status === 'notice') {
      items.push(`Potion timing off (${this.results.potion.timing.toFixed(1)}s, should be ~-1s)`);
    }

    if (items.length === 0) {
      return 'All pre-pull actions executed correctly';
    }

    return items.join('; ');
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.PrePullChecker = PrePullChecker;
}
