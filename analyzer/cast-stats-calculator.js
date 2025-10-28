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
      earlyMfClips: this.calculateEarlyClips(castsToAnalyze),
      earlyMfClipsPercent: this.calculateEarlyClipsPercent(castsToAnalyze),
      clippedMfDps: this.calculateClippedDps(castsToAnalyze),

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
      earlyMfClips: 0,
      earlyMfClipsPercent: 0,
      clippedMfDps: 0,
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

  calculateEarlyClips(casts) {
    return casts.filter(c => c.clippedEarly).length;
  }

  calculateEarlyClipsPercent(casts) {
    const channelCasts = casts.filter(c => [15407, 129197, 48045].includes(c.spellId));
    if (channelCasts.length === 0) return 0;

    const clipped = this.calculateEarlyClips(channelCasts);
    return (clipped / channelCasts.length) * 100;
  }

  calculateClippedDps(casts) {
    // Rough estimate: each early clip loses ~1 tick of damage
    const earlyClips = this.calculateEarlyClips(casts);
    const avgHit = this.calculateAvgHit(casts);
    const activeTime = this.calculateActiveTime(casts);

    if (activeTime === 0) return 0;

    const lostDamage = earlyClips * avgHit;
    return (lostDamage * 1000) / activeTime;
  }

  calculateGcdUsage(casts) {
    if (this.fightDuration === 0) return 0;

    // Rough estimate: 1.5s GCD, calculate how many GCDs were possible
    const GCD_MS = 1500;
    const possibleGcds = this.fightDuration / GCD_MS;

    return (casts.length / possibleGcds) * 100;
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
