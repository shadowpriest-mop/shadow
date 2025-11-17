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
   * Halo has ~1.5s cast + travel time, so if cast at -2.5s, damage lands ~0-1s after pull
   */
  checkHalo() {
    // Look for Halo damage events in the first 3 seconds after combat starts
    // Pre-pull Halo (-2.5s) should land between 0-1.5s after pull due to cast + travel time
    const haloDamageEvents = this.events.filter(e =>
      e.type === 'damage' &&
      e.abilityGameID === PrePullSpells.HALO_DAMAGE &&
      e.timestamp >= this.fightStart &&
      e.timestamp <= this.fightStart + 3000 // Within 3s of pull
    );

    if (haloDamageEvents.length > 0) {
      // Find the earliest halo damage (should be the pre-pull one)
      const earliestHalo = haloDamageEvents.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestHalo.timestamp - this.fightStart) / 1000;
      this.results.halo.found = true;
      this.results.halo.timing = timingSeconds;

      // Check if timing is reasonable (0 to 1.5 seconds after pull = good pre-pull)
      if (timingSeconds >= 0 && timingSeconds <= 1.5) {
        this.results.halo.status = 'good';
      } else if (timingSeconds <= 3.0) {
        this.results.halo.status = 'notice'; // Found but timing suggests late pre-pull or in-combat cast
      } else {
        this.results.halo.status = 'notice';
      }
    }
  }

  /**
   * Check if Mind Spike was cast in pre-pull
   * Mind Spike has 1.5s cast, so if cast at -1s, damage lands right around pull time
   */
  checkMindSpike() {
    // Look for Mind Spike damage in the first 2 seconds after combat starts
    // Pre-pull Mind Spike (-1s) with 1.5s cast should land around 0.5s after pull
    const mindSpikeEvents = this.events.filter(e =>
      (e.type === 'cast' || e.type === 'damage') &&
      e.abilityGameID === PrePullSpells.MIND_SPIKE &&
      e.timestamp >= this.fightStart &&
      e.timestamp <= this.fightStart + 2000 // Within 2s of pull
    );

    if (mindSpikeEvents.length > 0) {
      // Find the earliest mind spike (should be the pre-pull one)
      const earliestMindSpike = mindSpikeEvents.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestMindSpike.timestamp - this.fightStart) / 1000;
      this.results.mindSpike.found = true;
      this.results.mindSpike.timing = timingSeconds;

      // Check if timing is reasonable (0 to 1 second after pull = good pre-pull)
      if (timingSeconds >= 0 && timingSeconds <= 1.0) {
        this.results.mindSpike.status = 'good';
      } else if (timingSeconds <= 2.0) {
        this.results.mindSpike.status = 'notice'; // Found but timing suggests it might be in-combat
      } else {
        this.results.mindSpike.status = 'notice';
      }
    }
  }

  /**
   * Check if Potion of Jade Serpent was used and buff is active
   * Potion buff should be active at the very start of combat
   * If used pre-pull, we may not see applybuff, but we can check removebuff timing
   */
  checkPotion() {
    // Strategy 1: Look for potion buff applied at or just after fight start
    const potionBuffs = this.buffEvents.filter(e =>
      e.abilityGameID === PrePullSpells.POTION_BUFF &&
      e.type === 'applybuff' &&
      e.timestamp >= this.fightStart - 1000 && // Allow 1s before pull
      e.timestamp <= this.fightStart + 500 // Within 500ms after pull
    );

    if (potionBuffs.length > 0) {
      const earliestPotionBuff = potionBuffs.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestPotionBuff.timestamp - this.fightStart) / 1000;
      this.results.potion.found = true;
      this.results.potion.buffActive = true;
      this.results.potion.timing = timingSeconds;
      this.results.potion.status = 'good';
      return;
    }

    // Strategy 2: Check for removebuff event
    // Potion lasts 25 seconds, so if it expires between 24-26s, it was used pre-pull
    const potionRemoves = this.buffEvents.filter(e =>
      e.abilityGameID === PrePullSpells.POTION_BUFF &&
      e.type === 'removebuff' &&
      e.timestamp >= this.fightStart + 24000 && // At least 24s into fight
      e.timestamp <= this.fightStart + 26000 // At most 26s into fight
    );

    if (potionRemoves.length > 0) {
      const firstRemove = potionRemoves.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      // Calculate when the potion was applied (25 seconds before it expired)
      const removeTime = (firstRemove.timestamp - this.fightStart) / 1000;
      const applyTime = removeTime - 25; // Potion lasts 25 seconds

      this.results.potion.found = true;
      this.results.potion.buffActive = true;
      this.results.potion.timing = applyTime;

      // Good if applied within 1.5s before pull
      if (applyTime >= -1.5 && applyTime <= 0) {
        this.results.potion.status = 'good';
      } else {
        this.results.potion.status = 'notice';
      }
      return;
    }

    // Strategy 3: Check if buff is already active (refreshbuff or similar)
    const potionRefresh = this.buffEvents.filter(e =>
      e.abilityGameID === PrePullSpells.POTION_BUFF &&
      (e.type === 'applybuff' || e.type === 'refreshbuff') &&
      e.timestamp <= this.fightStart + 1000
    );

    if (potionRefresh.length > 0) {
      this.results.potion.found = true;
      this.results.potion.buffActive = true;
      this.results.potion.status = 'good';
      this.results.potion.timing = 0;
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
      items.push('Missing Halo pre-pull (damage should land 0-1.5s after pull)');
    } else if (this.results.halo.status === 'notice') {
      items.push(`Halo timing off (landed at +${this.results.halo.timing.toFixed(1)}s, expected 0-1.5s)`);
    }

    if (!this.results.mindSpike.found) {
      items.push('Missing Mind Spike pre-pull (should land 0-1s after pull)');
    } else if (this.results.mindSpike.status === 'notice') {
      items.push(`Mind Spike timing off (landed at +${this.results.mindSpike.timing.toFixed(1)}s, expected 0-1s)`);
    }

    if (!this.results.potion.found) {
      items.push('Missing Potion of Jade Serpent (buff should be active at pull)');
    } else if (!this.results.potion.buffActive) {
      items.push('Potion buff not active at pull');
    } else if (this.results.potion.status === 'notice') {
      items.push(`Potion timing off (applied at +${this.results.potion.timing.toFixed(1)}s)`);
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
