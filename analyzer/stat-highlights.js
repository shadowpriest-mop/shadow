// MoP Stat Highlights
// Adapted from Wrath analyzer stat-highlights.ts
// Provides red/yellow/green quality scoring for casts

// Status levels
const Status = {
  NORMAL: 'NORMAL',
  NOTICE: 'NOTICE',
  WARNING: 'WARNING',
  ERROR: 'ERROR'  // Critical errors (red, most severe)
};

class StatHighlights {
  /**
   * Get overall cast quality status (with MoP Pandemic support)
   */
  overall(cast) {
    // Check for major issues (WARNING/ERROR)
    // Check if this spell should be expected to deal damage
    const shouldCheckDamage = this._shouldCheckDamage(cast);

    if (cast.failed && shouldCheckDamage) return Status.WARNING;

    // Missed Insanity optimization (should have clipped MF for 3 extra ticks)
    if (cast.missedInsanityOptimization) return Status.WARNING;

    // Mind Flay clipping quality (wasted channel time)
    if (cast.mfClipQuality) {
      if (cast.mfClipQuality === 'error') return Status.ERROR;  // 300ms+ wasted
      if (cast.mfClipQuality === 'warning') return Status.WARNING;  // 200-299ms wasted
    }

    // Devouring Plague quality check
    // IMPORTANT: Check end-of-fight DP casts first to skip all other penalties
    if (cast.dpQuality && cast.dpQuality.isEndOfFight) {
      return Status.NORMAL;
    }

    if (cast.dpQuality) {
      // Cast with insufficient orbs or major delay
      if (cast.dpQuality.status === 'warning') return Status.WARNING;
    }

    // DoT quality check (Pandemic-aware)
    if (cast.dotQuality) {
      if (cast.dotQuality.status === 'early' && cast.clippedTicks >= 2) return Status.WARNING;
      if (cast.dotQuality.status === 'late' && cast.dotDowntime > 3000) return Status.WARNING;
    }

    if (cast.timeOffCooldown && cast.timeOffCooldown > 5000) return Status.WARNING;

    // Check for minor issues (NOTICE)
    // Devouring Plague minor delay
    if (cast.dpQuality) {
      if (cast.dpQuality.status === 'notice') return Status.NOTICE;
    }

    if (cast.dotQuality) {
      if (cast.dotQuality.status === 'early' && cast.clippedTicks === 1) return Status.NOTICE;
      if (cast.dotQuality.status === 'late' && cast.dotDowntime > 1000) return Status.NOTICE;
      // Optimal refreshes (pandemic) are not flagged
    }

    // clippedEarly removed - clipping MF for higher priority spells (MB, SW:D) is optimal play
    if (cast.timeOffCooldown && cast.timeOffCooldown > 2000) return Status.NOTICE;
    if (cast.nextCastLatency && cast.nextCastLatency > 300) return Status.NOTICE;

    // Otherwise normal
    return Status.NORMAL;
  }

  /**
   * Get hits quality status
   */
  hits(cast) {
    if (cast.failed) return Status.WARNING;
    if (cast.resisted) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Get DoT downtime quality status
   */
  dotDowntime(cast) {
    if (!cast.dotDowntime) return Status.NORMAL;

    if (cast.dotDowntime > 3000) return Status.WARNING;
    if (cast.dotDowntime > 1000) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Get cast latency quality status
   */
  castLatency(cast) {
    if (!cast.nextCastLatency) return Status.NORMAL;

    // Non-GCD instant casts (Shadowfiend, Berserking, Potion, etc.) use higher thresholds
    // These can be stacked quickly at pull, but 200-1000ms gaps are normal
    if (cast.gcd === 0) {
      // For non-GCD instant casts:
      // - > 2000ms gap is unusually high (WARNING)
      // - > 1000ms gap is noticeable but acceptable (NOTICE)
      if (cast.nextCastLatency > 2000) return Status.WARNING;
      if (cast.nextCastLatency > 1000) return Status.NOTICE;
      return Status.NORMAL;
    }

    // Regular casts (with GCD) use stricter thresholds
    if (cast.nextCastLatency > 500) return Status.WARNING;
    if (cast.nextCastLatency > 300) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Get DoT clipping quality status (Pandemic-aware)
   */
  dotClipping(cast) {
    if (!cast.dotQuality) return Status.NORMAL;

    if (cast.dotQuality.status === 'optimal') return Status.NORMAL;
    if (cast.dotQuality.status === 'late') {
      if (cast.dotDowntime > 3000) return Status.WARNING;
      if (cast.dotDowntime > 1000) return Status.NOTICE;
    }
    if (cast.dotQuality.status === 'early') {
      if (cast.clippedTicks >= 2) return Status.WARNING;
      if (cast.clippedTicks === 1) return Status.NOTICE;
    }

    return Status.NORMAL;
  }

  /**
   * Get DoT refresh quality status (MoP-specific)
   */
  dotRefresh(cast) {
    if (!cast.dotQuality) return Status.NORMAL;

    switch (cast.dotQuality.status) {
      case 'optimal':
        return Status.NORMAL;
      case 'late':
        // Downtime: Warning if >3s, Notice if smaller
        return cast.dotDowntime > 3000 ? Status.WARNING : Status.NOTICE;
      case 'major-early':
        // Wasted 2+ ticks
        return Status.WARNING;
      case 'minor-early':
        // Wasted 1 tick
        return Status.NOTICE;
      default:
        return Status.NORMAL;
    }
  }

  /**
   * Get channel clipping quality status
   */
  channelClipping(cast) {
    // Missed Insanity optimization is a major error
    if (cast.missedInsanityOptimization) return Status.WARNING;

    // Optimal clip (Insanity pandemic) is not flagged
    if (cast.optimalClip) return Status.NORMAL;

    // Regular early clip removed - clipping MF for higher priority spells is optimal play
    return Status.NORMAL;
  }

  /**
   * Get cooldown usage quality status
   * Mind Blast delays >5s are critical (missing Shadow Orb generation)
   */
  cooldownUsage(cast) {
    if (!cast.timeOffCooldown) return Status.NORMAL;

    if (cast.timeOffCooldown > 5000) return Status.ERROR;  // Critical: missing orbs
    if (cast.timeOffCooldown > 2000) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Check if a spell should be expected to deal damage
   * Spells that don't deal damage (buffs, pets) shouldn't be flagged as failed
   */
  _shouldCheckDamage(cast) {
    const spellData = getSpellData(cast.spellId);

    // If we don't have spell data, assume it should deal damage
    if (!spellData) return true;

    // Spells with damageType NONE never deal damage (buffs like Berserking, Power Infusion)
    if (spellData.damageType === DamageType.NONE) return false;

    // Pet summons (Shadowfiend, Mindbender) don't deal damage themselves - the pet does
    // These are marked as DIRECT damage but don't have immediate damage events
    const isPetSummon = cast.spellId === SpellId.SHADOWFIEND ||
                        cast.spellId === SpellId.SHADOWFIEND_ALT ||
                        cast.spellId === SpellId.MINDBENDER;
    if (isPetSummon) return false;

    // Spells with travel time (Halo, Cascade, Divine Star) have delayed damage events
    // Don't flag as failed if no immediate damage is found
    if (spellData.hasTravelTime) return false;

    // All other spells should deal damage
    return true;
  }

  /**
   * Map status to CSS class for status bar
   */
  getStatusClass(status) {
    const statusMap = {
      [Status.NORMAL]: 'normal',
      [Status.NOTICE]: 'notice',
      [Status.WARNING]: 'warning',
      [Status.ERROR]: 'error'  // Critical error - bright red
    };
    return statusMap[status] || 'normal';
  }

  /**
   * Map status to CSS class for text highlighting
   */
  getTextClass(status) {
    const textMap = {
      [Status.NORMAL]: 'table-accent',
      [Status.NOTICE]: 'text-notice',
      [Status.WARNING]: 'text-warning',
      [Status.ERROR]: 'text-error'  // Critical error - bright red
    };
    return textMap[status] || 'table-accent';
  }

  /**
   * Get formatted time string with color coding
   */
  formatTime(ms, status) {
    if (ms === undefined || ms === null) return '—';

    const seconds = (ms / 1000).toFixed(2);
    const cssClass = this.getTextClass(status);
    return `<span class="${cssClass}">${seconds}s</span>`;
  }

  /**
   * Get formatted percentage with color coding
   */
  formatPercent(value, status) {
    if (value === undefined || value === null) return '—';

    const percent = Math.round(value * 100);
    const cssClass = this.getTextClass(status);
    return `<span class="${cssClass}">${percent}%</span>`;
  }

  /**
   * Get formatted damage number with color coding
   */
  formatDamage(damage, status) {
    if (damage === undefined || damage === null) return '—';

    const formatted = damage.toLocaleString();
    const cssClass = this.getTextClass(status);
    return `<span class="${cssClass}">${formatted}</span>`;
  }

  /**
   * Get formatted hit count with color coding
   */
  formatHits(cast) {
    const status = this.hits(cast);
    const cssClass = this.getTextClass(status);

    let text = `${cast.hits}`;
    if (cast.crits > 0) {
      text += ` (${cast.crits} crit)`;
    }
    if (cast.resisted) {
      text += ' [RESIST]';
    }
    if (cast.failed) {
      text += ' [MISS]';
    }

    return `<span class="${cssClass}">${text}</span>`;
  }
}

// Create singleton instance
const statHighlights = new StatHighlights();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StatHighlights, statHighlights, Status };
}
