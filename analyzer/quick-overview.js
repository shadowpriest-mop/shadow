// Quick Overview Analyzer
// Extracts key issues and highlights from cast data for summary view

class QuickOverviewAnalyzer {
  constructor(casts, fight) {
    this.casts = casts;
    this.fight = fight;
    this.issues = {
      critical: [],
      wellDone: [],
      couldImprove: []
    };
  }

  analyze() {
    this.analyzeDevoringPlague();
    this.analyzeMindBlast();
    this.analyzeDots();

    return this.issues;
  }

  /**
   * Analyze Devouring Plague for orb mistakes
   */
  analyzeDevoringPlague() {
    const dpCasts = this.casts.filter(c => c.spellId === 2944);
    if (dpCasts.length === 0) return;

    let badOrbCasts = 0;

    dpCasts.forEach(cast => {
      if (cast.shadowOrbs !== undefined && cast.shadowOrbs < 3) {
        badOrbCasts++;
      }
    });

    if (badOrbCasts > 0) {
      this.issues.critical.push({
        type: 'dp-orbs',
        label: 'Devouring Plague',
        message: `${badOrbCasts} casts with <3 Shadow Orbs`,
        count: badOrbCasts,
        severity: 'error'
      });
    } else if (dpCasts.length > 0) {
      this.issues.wellDone.push({
        type: 'dp-orbs',
        label: 'Devouring Plague',
        message: 'All casts used 3 Shadow Orbs',
        severity: 'good'
      });
    }
  }

  /**
   * Analyze Mind Blast cooldown usage
   */
  analyzeMindBlast() {
    const mbCasts = this.casts.filter(c => c.spellId === 8092);
    if (mbCasts.length === 0) return;

    let severeDelays = 0; // >5s
    let minorDelays = 0;  // 2-5s

    mbCasts.forEach(cast => {
      if (cast.timeOffCooldown !== undefined) {
        const delaySeconds = cast.timeOffCooldown / 1000;
        if (delaySeconds > 5) {
          severeDelays++;
        } else if (delaySeconds > 2) {
          minorDelays++;
        }
      }
    });

    // Calculate potential casts (rough estimate)
    const fightDuration = (this.fight.endTime - this.fight.startTime) / 1000; // seconds
    const potentialCasts = Math.floor(fightDuration / 8) + 1; // 8s CD
    const missedCasts = potentialCasts - mbCasts.length;

    if (severeDelays > 0) {
      this.issues.critical.push({
        type: 'mb-delays',
        label: 'Mind Blast',
        message: `${severeDelays} casts delayed >5 seconds`,
        count: severeDelays,
        severity: 'error'
      });
    }

    if (minorDelays > 0) {
      this.issues.couldImprove.push({
        type: 'mb-delays',
        label: 'Mind Blast',
        message: `${minorDelays} casts delayed 2-5 seconds`,
        count: minorDelays,
        severity: 'warning'
      });
    }

    if (missedCasts > 2) {
      this.issues.critical.push({
        type: 'mb-missed',
        label: 'Mind Blast',
        message: `${missedCasts} potential casts missed`,
        count: missedCasts,
        severity: 'error'
      });
    } else if (missedCasts <= 2 && severeDelays === 0) {
      this.issues.wellDone.push({
        type: 'mb-usage',
        label: 'Mind Blast',
        message: 'Good cooldown usage',
        severity: 'good'
      });
    }
  }

  /**
   * Analyze DoT uptime
   */
  analyzeDots() {
    this.analyzeDoT(34914, 'Vampiric Touch');
    this.analyzeDoT(589, 'Shadow Word: Pain');
  }

  analyzeDoT(spellId, spellName) {
    const dotCasts = this.casts.filter(c => c.spellId === spellId);
    if (dotCasts.length === 0) return;

    let totalDowntime = 0;
    let gapCount = 0;
    let severeGaps = 0; // >2s downtime
    let earlyRefreshes = 0;

    dotCasts.forEach(cast => {
      if (cast.dotDowntime !== undefined && cast.dotDowntime > 0) {
        totalDowntime += cast.dotDowntime;
        gapCount++;
        if (cast.dotDowntime > 2000) {
          severeGaps++;
        }
      }

      // Check for early refreshes (>30% remaining = wasted pandemic)
      // This would need to be calculated in casts-analyzer.js
      // For now, we'll check if clippedPreviousCast is true
      if (cast.clippedPreviousCast && cast.clippedTicks > 1) {
        earlyRefreshes++;
      }
    });

    const fightDuration = this.fight.endTime - this.fight.startTime;
    const uptimePercent = ((fightDuration - totalDowntime) / fightDuration) * 100;

    if (severeGaps > 0) {
      this.issues.critical.push({
        type: `${spellId}-uptime`,
        label: spellName,
        message: `DoT fell off ${severeGaps} times (>2s gaps)`,
        count: severeGaps,
        severity: 'error'
      });
    } else if (uptimePercent >= 95) {
      this.issues.wellDone.push({
        type: `${spellId}-uptime`,
        label: spellName,
        message: `${uptimePercent.toFixed(1)}% uptime`,
        severity: 'good'
      });
    }

    if (earlyRefreshes > 0) {
      this.issues.couldImprove.push({
        type: `${spellId}-pandemic`,
        label: spellName,
        message: `${earlyRefreshes} early refreshes (wasted pandemic)`,
        count: earlyRefreshes,
        severity: 'notice'
      });
    }
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.QuickOverviewAnalyzer = QuickOverviewAnalyzer;
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuickOverviewAnalyzer };
}
