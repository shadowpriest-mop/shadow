// MoP Event Analyzer - MVP Version
// Simplified cast reconstruction for initial release

class EventAnalyzer {
  constructor(events, settings) {
    this.events = events;
    this.settings = settings;
    this.casts = [];
  }

  /**
   * Main analysis function - process events into casts
   */
  analyze() {
    // For MVP: Simple cast counting and DoT uptime
    const stats = {
      casts: this.countCasts(),
      dotUptimes: this.calculateDotUptimes(),
      orbGeneration: this.trackOrbGeneration(),
      fight: this.events.fight
    };

    return stats;
  }

  /**
   * Count casts by spell ID
   */
  countCasts() {
    const counts = {};

    this.events.casts.forEach(cast => {
      const spellId = cast.ability.guid;
      if (!counts[spellId]) {
        counts[spellId] = {
          spellId,
          name: cast.ability.name,
          count: 0
        };
      }
      counts[spellId].count++;
    });

    return counts;
  }

  /**
   * Calculate DoT uptimes from debuff events
   */
  calculateDotUptimes() {
    const dotSpells = {
      589: 'Shadow Word: Pain',
      34914: 'Vampiric Touch',
      2944: 'Devouring Plague'
    };

    const uptimes = {};
    const fightDuration = this.events.fight.duration;

    Object.keys(dotSpells).forEach(spellId => {
      const numericId = parseInt(spellId);
      uptimes[spellId] = this.calculateSingleDotUptime(numericId, fightDuration);
    });

    return uptimes;
  }

  /**
   * Calculate uptime for a single DoT
   */
  calculateSingleDotUptime(spellId, fightDuration) {
    const debuffEvents = this.events.debuffs.filter(e =>
      e.ability.guid === spellId
    );

    let totalUptime = 0;
    let currentStart = null;

    debuffEvents.forEach(event => {
      if (event.type === 'applydebuff' || event.type === 'refreshdebuff') {
        if (!currentStart) {
          currentStart = event.timestamp;
        }
      } else if (event.type === 'removedebuff') {
        if (currentStart) {
          totalUptime += (event.timestamp - currentStart);
          currentStart = null;
        }
      }
    });

    // If still active at fight end
    if (currentStart) {
      totalUptime += (this.events.fight.end - currentStart);
    }

    // Calculate percentage
    const uptimePercent = (totalUptime / fightDuration) * 100;
    return {
      uptime: totalUptime,
      duration: fightDuration,
      percent: Math.round(uptimePercent * 10) / 10 // Round to 1 decimal
    };
  }

  /**
   * Track Shadow Orb generation from resource events
   */
  trackOrbGeneration() {
    const orbEvents = this.events.resources.filter(e =>
      e.resourceType === 17 // Shadow Orbs resource type
    );

    let orbsGenerated = 0;
    let orbsSpent = 0;
    let maxOrbs = 0;

    orbEvents.forEach(event => {
      if (event.resourceChange > 0) {
        orbsGenerated += event.resourceChange;
      } else if (event.resourceChange < 0) {
        orbsSpent += Math.abs(event.resourceChange);
      }

      if (event.resourceAmt > maxOrbs) {
        maxOrbs = event.resourceAmt;
      }
    });

    return {
      generated: orbsGenerated,
      spent: orbsSpent,
      wasted: Math.max(0, orbsGenerated - orbsSpent),
      maxReached: maxOrbs
    };
  }

  /**
   * Get cast count for a specific spell
   */
  getCastCount(spellId) {
    return this.events.casts.filter(c => c.ability.guid === spellId).length;
  }

  /**
   * Get damage tick count for a spell (for channels/DoTs)
   */
  getTickCount(spellId) {
    return this.events.damage.filter(d => d.ability.guid === spellId).length;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventAnalyzer };
}
