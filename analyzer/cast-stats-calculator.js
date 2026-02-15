// Cast Stats Calculator
// Calculates aggregate statistics from analyzed casts

class CastStatsCalculator {
  constructor(casts, fight) {
    this.casts = casts;
    this.fight = fight;
    this.fightDuration = fight.endTime - fight.startTime;
  }

  /**
   * Calculate all stats for given casts (can be filtered by spell)
   */
  calculateStats(filteredCasts = null) {
    const castsToAnalyze = filteredCasts || this.casts;

    if (castsToAnalyze.length === 0) {
      return this.getEmptyStats();
    }

    return {
      // Basic stats
      castCount: castsToAnalyze.length,
      totalDamage: this.calculateTotalDamage(castsToAnalyze),
      activeDps: this.calculateActiveDps(castsToAnalyze),
      activeTime: this.calculateActiveTime(castsToAnalyze),

      // Hit stats
      hits: this.calculateHits(castsToAnalyze),
      avgHit: this.calculateAvgHit(castsToAnalyze),
      critRate: this.calculateCritRate(castsToAnalyze),
      damagePerGcd: this.calculateDamagePerGcd(castsToAnalyze),

      // DoT stats
      avgDotDowntime: this.calculateAvgDotDowntime(castsToAnalyze),
      clippedDots: this.calculateClippedDots(castsToAnalyze),
      clippedDotsPercent: this.calculateClippedDotsPercent(castsToAnalyze),

      // Cooldown stats
      avgOffCooldown: this.calculateAvgOffCooldown(castsToAnalyze),

      // Channel stats
      avgMfDelay: this.calculateAvgCastLatency(castsToAnalyze),

      // Encounter stats
      avgSpellpower: 0, // TODO: Need to track spellpower from events
      avgHaste: 0,      // TODO: Need to track haste from events
      gcdUsage: this.calculateGcdUsage(castsToAnalyze)
    };
  }

  getEmptyStats() {
    return {
      castCount: 0,
      totalDamage: 0,
      activeDps: 0,
      activeTime: 0,
      hits: 0,
      avgHit: 0,
      critRate: 0,
      damagePerGcd: 0,
      avgDotDowntime: 0,
      clippedDots: 0,
      clippedDotsPercent: 0,
      avgOffCooldown: 0,
      avgMfDelay: 0,
      avgSpellpower: 0,
      avgHaste: 0,
      gcdUsage: 0
    };
  }

  calculateTotalDamage(casts) {
    return casts.reduce((sum, cast) => sum + (cast.totalDamage || 0), 0);
  }

  calculateActiveDps(casts) {
    const activeTime = this.calculateActiveTime(casts);
    if (activeTime === 0) return 0;

    const totalDamage = this.calculateTotalDamage(casts);
    return (totalDamage * 1000) / activeTime; // DPS = damage per second
  }

  calculateActiveTime(casts) {
    if (casts.length === 0) return 0;

    // Calculate time from first cast to last cast, minus long gaps
    const firstCast = casts[0].castStart;
    const lastCast = casts[casts.length - 1].castEnd;
    let totalTime = lastCast - firstCast;

    // Subtract gaps longer than 5 seconds (likely movement/mechanics)
    const MAX_GAP = 5000;
    for (let i = 0; i < casts.length - 1; i++) {
      const gap = casts[i + 1].castStart - casts[i].castEnd;
      if (gap > MAX_GAP) {
        totalTime -= gap;
      }
    }

    return Math.max(0, totalTime);
  }

  calculateHits(casts) {
    return casts.reduce((sum, cast) => sum + (cast.hits || 0), 0);
  }

  calculateAvgHit(casts) {
    const totalHits = this.calculateHits(casts);
    if (totalHits === 0) return 0;

    const totalDamage = this.calculateTotalDamage(casts);
    return totalDamage / totalHits;
  }

  calculateCritRate(casts) {
    const totalHits = this.calculateHits(casts);
    if (totalHits === 0) return 0;

    const totalCrits = casts.reduce((sum, cast) => sum + (cast.crits || 0), 0);
    return (totalCrits / totalHits) * 100;
  }

  calculateDamagePerGcd(casts) {
    if (casts.length === 0) return 0;

    const totalDamage = this.calculateTotalDamage(casts);
    return totalDamage / casts.length; // Rough estimate: 1 cast = 1 GCD
  }

  calculateAvgDotDowntime(casts) {
    const dotCasts = casts.filter(c => [589, 34914, 2944].includes(c.spellId));
    if (dotCasts.length === 0) return 0;

    const totalDowntime = dotCasts.reduce((sum, cast) => {
      return sum + (cast.dotDowntime && cast.dotDowntime > 0 ? cast.dotDowntime : 0);
    }, 0);

    const castsWithDowntime = dotCasts.filter(c => c.dotDowntime && c.dotDowntime > 0).length;
    if (castsWithDowntime === 0) return 0;

    return totalDowntime / castsWithDowntime;
  }

  calculateClippedDots(casts) {
    return casts.filter(c => c.clippedPreviousCast).length;
  }

  calculateClippedDotsPercent(casts) {
    const dotCasts = casts.filter(c => [589, 34914, 2944].includes(c.spellId));
    if (dotCasts.length === 0) return 0;

    const clipped = this.calculateClippedDots(dotCasts);
    return (clipped / dotCasts.length) * 100;
  }

  calculateAvgOffCooldown(casts) {
    const castsWithCd = casts.filter(c => c.timeOffCooldown !== undefined && c.timeOffCooldown > 0);
    if (castsWithCd.length === 0) return 0;

    const totalTime = castsWithCd.reduce((sum, cast) => sum + cast.timeOffCooldown, 0);
    return totalTime / castsWithCd.length;
  }

  calculateAvgCastLatency(casts) {
    const castsWithLatency = casts.filter(c => c.nextCastLatency !== undefined);
    if (castsWithLatency.length === 0) return 0;

    const totalLatency = castsWithLatency.reduce((sum, cast) => sum + cast.nextCastLatency, 0);
    return totalLatency / castsWithLatency.length;
  }


  calculateGcdUsage(casts) {
    if (this.fightDuration === 0) return 0;

    // Rough estimate: 1.5s GCD, calculate how many GCDs were possible
    const GCD_MS = 1500;
    const possibleGcds = this.fightDuration / GCD_MS;

    return (casts.length / possibleGcds) * 100;
  }

  /**
   * Calculate Mind Blast specific stats
   * Returns: { potentialCasts, missedCasts, avgDelay }
   */
  calculateMindBlastStats(mbCasts) {
    const MIND_BLAST_CD = 8000; // 8 second flat cooldown

    if (mbCasts.length === 0) {
      return { potentialCasts: 0, missedCasts: 0, avgDelay: 0 };
    }

    // Calculate average cast time from actual MB casts (varies with haste)
    let totalCastTime = 0;
    for (const cast of mbCasts) {
      totalCastTime += (cast.castEnd - cast.castStart);
    }
    const avgCastTime = totalCastTime / mbCasts.length;

    // Time between MB casts = cooldown + cast time
    const timeBetweenCasts = MIND_BLAST_CD + avgCastTime;

    // Find first MB cast (accounts for opener sequence)
    const firstMB = mbCasts[0];
    const firstMBEnd = firstMB.castEnd;

    // Calculate potential casts from first MB to fight end
    const timeAfterFirstMB = this.fight.endTime - firstMBEnd;
    const potentialCasts = 1 + Math.floor(timeAfterFirstMB / timeBetweenCasts);

    // Calculate missed casts
    const actualCasts = mbCasts.length;
    const missedCasts = Math.max(0, potentialCasts - actualCasts);

    // Calculate average delay (only for casts that were delayed)
    let totalDelay = 0;
    let delayedCasts = 0;

    for (const cast of mbCasts) {
      if (cast.timeOffCooldown && cast.timeOffCooldown > 0) {
        totalDelay += cast.timeOffCooldown;
        delayedCasts++;
      }
    }

    const avgDelay = delayedCasts > 0 ? totalDelay / delayedCasts : 0;

    return {
      potentialCasts,
      missedCasts,
      avgDelay
    };
  }

  /**
   * Calculate Mind Flay clip stats
   * Returns: { avgWastedTime, qualityStatus, clipsCount }
   */
  calculateMindFlayClipStats(mfCasts) {
    const MF_INSANITY_ID = 129197;
    const MF_REGULAR_ID = 15407;

    // Filter to only MF casts that have wasted channel time
    const clippedCasts = mfCasts.filter(cast =>
      (cast.spellId === MF_INSANITY_ID || cast.spellId === MF_REGULAR_ID) &&
      cast.wastedChannelTime !== undefined &&
      cast.wastedChannelTime >= 0
    );

    if (clippedCasts.length === 0) {
      return { avgWastedTime: 0, qualityStatus: 'NORMAL', clipsCount: 0 };
    }

    // Calculate average wasted time
    const totalWastedTime = clippedCasts.reduce((sum, cast) => sum + cast.wastedChannelTime, 0);
    const avgWastedTime = totalWastedTime / clippedCasts.length;

    // Determine quality status based on thresholds
    // <200ms = NORMAL (good)
    // 200-300ms = WARNING (orange)
    // 300ms+ = ERROR (red)
    let qualityStatus;
    if (avgWastedTime < 200) {
      qualityStatus = 'NORMAL';
    } else if (avgWastedTime < 300) {
      qualityStatus = 'WARNING';
    } else {
      qualityStatus = 'ERROR';
    }

    return {
      avgWastedTime,
      qualityStatus,
      clipsCount: clippedCasts.length
    };
  }

  /**
   * Filter casts by spell ID
   */
  filterBySpell(spellId) {
    return this.casts.filter(c => c.spellId === spellId);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CastStatsCalculator };
}
