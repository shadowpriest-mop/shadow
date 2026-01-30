// Pre-Pull Action Checker for MoP Shadow Priest
// Validates that proper pre-pull actions were executed

const PrePullSpells = {
  HALO: 120644,
  HALO_DAMAGE: 120696,
  CASCADE: 127632,
  CASCADE_DAMAGE: 127628,
  DIVINE_STAR: 122121,
  DIVINE_STAR_DAMAGE: 122128,
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
  constructor(events, buffEvents, fightStart, playerID, playerName, talents) {
    this.events = events || [];
    this.buffEvents = buffEvents || [];
    this.fightStart = fightStart;
    this.playerID = playerID; // Add player ID to filter events
    this.playerName = playerName || 'Unknown'; // Add player name for debugging
    this.talents = talents || [];

    // Extract tier 6 (level 90) talent name
    this.tier90TalentName = this.getTier90TalentName();

    this.results = {
      tier90Talent: { found: false, timing: null, status: 'missing', spellName: null },
      mindSpike: { found: false, timing: null, status: 'missing' },
      potion: { found: false, timing: null, status: 'missing', buffActive: false }
    };
  }

  /**
   * Get the name of the tier 90 talent selected by the player
   */
  getTier90TalentName() {
    if (!this.talents || this.talents.length === 0) {
      return 'Tier-90';
    }

    const tier90Talent = this.talents.find(t => t.type === 6);
    if (tier90Talent) {
      return tier90Talent.name;
    }

    return 'Tier-90';
  }

  /**
   * Main analysis function - check for pre-pull actions
   */
  analyze() {
    this.checkTier90Talent();
    this.checkMindSpike();
    this.checkPotion();

    // Add the tier90 talent name to results for display
    this.results.tier90TalentName = this.tier90TalentName;

    return this.results;
  }

  /**
   * Check if tier-90 talent (Halo/Cascade/Divine Star) was cast in pre-pull
   * Since logs only record from combat start, we can only detect the damage event.
   * All three spells have travel time and can hit late due to travel/hitbox issues.
   */
  checkTier90Talent() {
    // Look for damage events from any tier-90 talent in the first 10 seconds after combat starts
    // Extended window to account for travel time and hitbox issues
    const tier90DamageEvents = this.events.filter(e =>
      e.type === 'damage' &&
      (e.abilityGameID === PrePullSpells.HALO_DAMAGE ||
       e.abilityGameID === PrePullSpells.CASCADE_DAMAGE ||
       e.abilityGameID === PrePullSpells.DIVINE_STAR_DAMAGE) &&
      e.timestamp >= this.fightStart &&
      e.timestamp <= this.fightStart + 10000 // Within 10s of pull
    );

    console.log('=== Checking Tier-90 Talent (Halo/Cascade/Divine Star) ===');
    console.log('Total tier-90 damage events found (0-10s):', tier90DamageEvents.length);
    if (tier90DamageEvents.length > 0) {
      tier90DamageEvents.forEach((e, i) => {
        const timing = (e.timestamp - this.fightStart) / 1000;
        const spellName = e.abilityGameID === PrePullSpells.HALO_DAMAGE ? 'Halo' :
                         e.abilityGameID === PrePullSpells.CASCADE_DAMAGE ? 'Cascade' :
                         'Divine Star';
        console.log(`  ${spellName} damage ${i}: +${timing.toFixed(3)}s, sourceID=${e.sourceID}, targetID=${e.targetID}`);
      });
    }

    if (tier90DamageEvents.length > 0) {
      // Find the earliest tier-90 damage (should be the pre-pull one)
      const earliestTier90 = tier90DamageEvents.reduce((earliest, current) =>
        current.timestamp < earliest.timestamp ? current : earliest
      );

      const timingSeconds = (earliestTier90.timestamp - this.fightStart) / 1000;

      // Determine which spell was used
      let spellName = 'Unknown';
      if (earliestTier90.abilityGameID === PrePullSpells.HALO_DAMAGE) {
        spellName = 'Halo';
      } else if (earliestTier90.abilityGameID === PrePullSpells.CASCADE_DAMAGE) {
        spellName = 'Cascade';
      } else if (earliestTier90.abilityGameID === PrePullSpells.DIVINE_STAR_DAMAGE) {
        spellName = 'Divine Star';
      }

      this.results.tier90Talent.found = true;
      this.results.tier90Talent.timing = timingSeconds;
      this.results.tier90Talent.spellName = spellName;

      // Mark as good if hit within first 8 seconds (accounts for extreme travel/hitbox cases)
      // Anything later is probably an in-combat cast
      if (timingSeconds <= 8.0) {
        this.results.tier90Talent.status = 'good';
      } else {
        this.results.tier90Talent.status = 'notice'; // Probably cast in-combat
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
      this.results.tier90Talent.status,
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

    if (!this.results.tier90Talent.found) {
      items.push('Missing tier-90 talent pre-pull (Halo/Cascade/Divine Star)');
    } else if (this.results.tier90Talent.status === 'notice') {
      const spellName = this.results.tier90Talent.spellName || 'Tier-90 talent';
      items.push(`${spellName} timing off (landed at +${this.results.tier90Talent.timing.toFixed(1)}s, expected within 8s)`);
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
