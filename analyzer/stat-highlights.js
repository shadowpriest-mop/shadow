// MoP Stat Highlights
// Adapted from Wrath analyzer stat-highlights.ts
// Provides red/yellow/green quality scoring for casts

// Status levels
const Status = {
  NORMAL: 'NORMAL',
  NOTICE: 'NOTICE',
  WARNING: 'WARNING'
};

class StatHighlights {
  /**
   * Get overall cast quality status
   */
  overall(cast) {
    // Check for major issues (WARNING)
    if (cast.failed) return Status.WARNING;
    if (cast.clippedTicks >= 2) return Status.WARNING;
    if (cast.timeOffCooldown && cast.timeOffCooldown > 5000) return Status.WARNING;
    if (cast.dotDowntime && cast.dotDowntime > 3000) return Status.WARNING;

    // Check for minor issues (NOTICE)
    if (cast.clippedTicks === 1) return Status.NOTICE;
    if (cast.clippedEarly) return Status.NOTICE;
    if (cast.timeOffCooldown && cast.timeOffCooldown > 2000) return Status.NOTICE;
    if (cast.dotDowntime && cast.dotDowntime > 1000) return Status.NOTICE;
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

    if (cast.nextCastLatency > 500) return Status.WARNING;
    if (cast.nextCastLatency > 300) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Get DoT clipping quality status
   */
  dotClipping(cast) {
    if (!cast.clippedPreviousCast) return Status.NORMAL;

    if (cast.clippedTicks >= 2) return Status.WARNING;
    if (cast.clippedTicks === 1) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Get channel clipping quality status
   */
  channelClipping(cast) {
    if (!cast.clippedEarly) return Status.NORMAL;
    return Status.NOTICE;
  }

  /**
   * Get cooldown usage quality status
   */
  cooldownUsage(cast) {
    if (!cast.timeOffCooldown) return Status.NORMAL;

    if (cast.timeOffCooldown > 5000) return Status.WARNING;
    if (cast.timeOffCooldown > 2000) return Status.NOTICE;
    return Status.NORMAL;
  }

  /**
   * Map status to CSS class for status bar
   */
  getStatusClass(status) {
    const statusMap = {
      [Status.NORMAL]: 'normal',
      [Status.NOTICE]: 'notice',
      [Status.WARNING]: 'warning'
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
      [Status.WARNING]: 'text-warning'
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
