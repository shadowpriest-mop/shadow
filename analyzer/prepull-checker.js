// Pre-Pull Action Checker for MoP Shadow Priest
// Validates that proper pre-pull actions were executed

const PrePullSpells = {
  HALO: 120644,
  HALO_DAMAGE: 120696,
  MIND_SPIKE: 73510,
  POTION_OF_JADE_SERPENT: 105702, // Cast/Buff ID (same for both)
  POTION_BUFF: 105702 // Buff uses same ID as cast
};

const PREPULL_TIMING = {
  HALO: -2.5, // Should be cast at -2.5s
  MIND_SPIKE: -1.0, // Should be cast at -1s
  POTION: -1.0, // Should be used at -1s
  TOLERANCE: 0.5 // Allow 0.5s timing tolerance
};

class PrePullChecker {
  constructor(events, buffEvents, fightStart, playerID, playerName) {
    this.events = events || [];
    this.buffEvents = buffEvents || [];
    this.fightStart = fightStart;
    this.playerID = playerID; // Add player ID to filter events
    this.playerName = playerName || 'Unknown'; // Add player name for debugging
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
    this.checkHalo();
    this.checkMindSpike();
    this.checkPotion();

    return this.results;
  }

  /**
   * Check if Halo was cast in pre-pull
   * Halo has ~1.5s cast + travel time, so if cast at -2.5s, damage lands ~0-1s after pull
   * However, due to hitbox issues and travel time, can hit much later (up to 5s)
   */
  checkHalo() {
    // Look for Halo damage events in the first 6 seconds after combat starts
    // Pre-pull Halo can hit late due to travel time and hitbox issues
    const haloDamageEvents = this.events.filter(e =>
      e.type === 'damage' &&
      e.abilityGameID === PrePullSpells.HALO_DAMAGE &&
      e.timestamp >= this.fightStart &&
      e.timestamp <= this.fightStart + 6000 // Within 6s of pull (extended for hitbox/travel time)
    );

    console.log('=== Checking Halo ===');
    console.log('Total Halo damage events found (0-6s):', haloDamageEvents.length);
    if (haloDamageEvents.length > 0) {
      haloDamageEvents.forEach((e, i) => {
        const timing = (e.timestamp - this.fightStart) / 1000;
        console.log(`  Halo damage ${i}: +${timing.toFixed(3)}s, sourceID=${e.sourceID}, targetID=${e.targetID}`);
      });
    }

    if (haloDamageEvents.length > 0) {
      // Find the earliest halo damage (should be the pre-pull one)
      const earliestHalo = haloDamageEvents.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestHalo.timestamp - this.fightStart) / 1000;
      this.results.halo.found = true;
      this.results.halo.timing = timingSeconds;

      // Check if timing is reasonable
      // 0-1.5s = perfect, 1.5-5s = acceptable (late due to travel/hitbox), >5s = likely in-combat cast
      if (timingSeconds >= 0 && timingSeconds <= 1.5) {
        this.results.halo.status = 'good';
      } else if (timingSeconds <= 5.0) {
        this.results.halo.status = 'good'; // Still good, just late hit due to travel/hitbox
      } else {
        this.results.halo.status = 'notice'; // Probably cast in-combat
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

    console.log('=== Checking Mind Spike ===');
    console.log('Total Mind Spike events found (0-2s):', mindSpikeEvents.length);
    if (mindSpikeEvents.length > 0) {
      mindSpikeEvents.forEach((e, i) => {
        const timing = (e.timestamp - this.fightStart) / 1000;
        console.log(`  Mind Spike ${i}: type=${e.type}, +${timing.toFixed(3)}s, sourceID=${e.sourceID}`);
      });
    }

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
    // Filter potion events by player ID to only check THIS player's potion
    const potionInRegularEvents = this.events.filter(e =>
      (e.abilityGameID === PrePullSpells.POTION_BUFF ||
       e.abilityGameID === PrePullSpells.POTION_OF_THE_JADE_SERPENT) &&
      (e.sourceID === this.playerID || e.targetID === this.playerID)
    );

    if (potionInRegularEvents.length > 0) {
      // Strategy: Check for removebuff in regular events
      // Potion lasts 25s, if removebuff happens 23-26s into fight, it was pre-pull
      const potionRemoves = potionInRegularEvents.filter(e =>
        e.type === 'removebuff' &&
        e.timestamp >= this.fightStart + 23000 &&
        e.timestamp <= this.fightStart + 26000
      );

      if (potionRemoves.length > 0) {
        const removeTime = (potionRemoves[0].timestamp - this.fightStart) / 1000;
        const applyTime = removeTime - 25; // Potion lasts 25 seconds

        this.results.potion.found = true;
        this.results.potion.buffActive = true;
        this.results.potion.timing = applyTime;

        if (applyTime >= -1.5 && applyTime <= 0) {
          this.results.potion.status = 'good';
        } else {
          this.results.potion.status = 'notice';
        }
        return;
      }

      // Fallback: Check for any potion event near start (but not combatantinfo)
      const earlyPotionEvents = potionInRegularEvents.filter(e =>
        e.timestamp <= this.fightStart + 1000 &&
        e.type !== 'combatantinfo' // Exclude metadata events
      );

      if (earlyPotionEvents.length > 0) {
        const earliest = earlyPotionEvents.reduce((e1, e2) =>
          e1.timestamp < e2.timestamp ? e1 : e2
        );

        const timingSeconds = (earliest.timestamp - this.fightStart) / 1000;
        this.results.potion.found = true;
        this.results.potion.buffActive = true;
        this.results.potion.timing = timingSeconds;
        this.results.potion.status = 'good';
        return;
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
