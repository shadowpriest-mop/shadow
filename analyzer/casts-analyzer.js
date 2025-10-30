// MoP Casts Analyzer
// Adapted from Wrath analyzer casts-analyzer.ts
// Calculates cast quality metrics: delays, clipping, downtime

// Import spell data and haste utilities
const { getSpellData, DamageType } = require('./spell-data.js');
const {
  calculateHaste,
  calculateTickInterval,
  canInferHaste,
  getHasteError,
  inferHasteRating,
  ERROR_THRESHOLD
} = require('./haste.js');

class CastsAnalyzer {
  constructor(events, settings) {
    this.events = events;
    this.settings = settings;
    this.casts = [];
    this.activeDots = new Map(); // Track active DoTs by target
    this.baseStats = { hasteRating: 0 }; // Will be updated from events
  }

  /**
   * Main analysis function - parse events into CastDetails with quality metrics
   */
  analyze() {
    // Step 1: Parse events into CastDetails objects
    this.parseCasts();

    // Step 2: Infer haste for each cast
    this.calculateHaste();

    // Step 3: Calculate quality metrics
    this.calculateCastLatencies();
    this.calculateDotMetrics();
    this.calculateChannelMetrics();
    this.calculateCooldownMetrics();

    return this.casts;
  }

  /**
   * Parse cast and damage events into CastDetails objects
   */
  parseCasts() {
    const castEvents = this.events.filter(e => e.type === 'cast');
    const damageEvents = this.events.filter(e => e.type === 'damage');

    for (const castEvent of castEvents) {
      const spellId = castEvent.abilityGameID;

      // Create CastDetails object
      const spellData = getSpellData(spellId);
      const cast = new CastDetails({
        spellId: spellId,
        name: spellData ? spellData.name : `Unknown (${spellId})`,
        rank: 0, // MoP has no spell ranks
        castStart: castEvent.timestamp,
        castEnd: castEvent.timestamp, // Will update with last damage
        sourceId: castEvent.sourceID,
        targetId: castEvent.targetID,
        targetInstance: castEvent.targetInstance || 0,
        buffs: [], // TODO: Extract buffs from events
        spellPower: 0, // TODO: Calculate from events
        haste: 0, // TODO: Calculate from events
        gcd: 1.0 // TODO: Calculate based on haste
      });

      // Match damage events to this cast
      const instances = this.matchDamageInstances(castEvent, damageEvents);
      cast.setInstances(instances);

      // Update castEnd to last damage timestamp
      if (cast.lastDamageTimestamp) {
        cast.castEnd = cast.lastDamageTimestamp;
        cast.castTimeMs = cast.castEnd - cast.castStart;
      }

      this.casts.push(cast);
    }

    // Sort by timestamp
    this.casts.sort((a, b) => a.castStart - b.castStart);
  }

  /**
   * Match damage events to a cast event
   */
  matchDamageInstances(castEvent, damageEvents) {
    const spellId = castEvent.abilityGameID;
    const castTime = castEvent.timestamp;
    const instances = [];

    // For instant casts and direct damage, match within 100ms window
    // For DoTs and channels, match within duration window
    const spellData = getSpellData(spellId);
    const isDoT = spellData && spellData.damageType === DamageType.DOT;
    const isChannel = spellData && spellData.damageType === DamageType.CHANNEL;
    const matchWindow = isDoT ? 30000 : (isChannel ? 5000 : 100);

    for (const dmgEvent of damageEvents) {
      if (dmgEvent.abilityGameID !== spellId) continue;
      if (dmgEvent.targetID !== castEvent.targetID) continue;
      if (dmgEvent.targetInstance !== castEvent.targetInstance) continue;

      const timeDiff = dmgEvent.timestamp - castTime;
      if (timeDiff >= 0 && timeDiff <= matchWindow) {
        instances.push(new DamageInstance(dmgEvent));
      }
    }

    return instances;
  }

  /**
   * Calculate haste for each cast
   * Uses actual tick intervals and cast times to infer haste when combatant data unavailable
   */
  calculateHaste() {
    // TODO: Extract base haste from combatant info events if available
    // For now, infer from cast times

    for (const cast of this.casts) {
      const spellData = getSpellData(cast.spellId);
      if (!spellData) {
        cast.haste = 1.0; // No haste data
        continue;
      }

      // Start with base haste (1.0 = no haste)
      cast.haste = 1.0;

      // Try to infer haste from actual cast/tick times
      if (canInferHaste(cast, spellData)) {
        const error = getHasteError(cast, spellData);

        // Only update haste if error is within reasonable bounds
        if (Math.abs(error) < ERROR_THRESHOLD) {
          // Calculate inferred haste
          let actualDelta, baseDelta;

          switch (spellData.damageType) {
            case DamageType.CHANNEL:
              if (cast.instances.length > 0) {
                actualDelta = cast.instances[0].timestamp - cast.castEnd;
                baseDelta = (spellData.maxDuration / spellData.maxTicks) * 1000;
                cast.haste = baseDelta / actualDelta;
              }
              break;

            case DamageType.DOT:
              if (cast.instances.length > 1) {
                actualDelta = cast.instances[cast.instances.length - 1].timestamp -
                             cast.instances[cast.instances.length - 2].timestamp;
                baseDelta = spellData.baseTickTime * 1000;
                cast.haste = baseDelta / actualDelta;
              }
              break;

            default:
              if (cast.castTimeMs > 500) {
                actualDelta = cast.castTimeMs;
                baseDelta = spellData.baseCastTime * 1000;
                cast.haste = baseDelta / actualDelta;
              }
              break;
          }
        }
      }

      // Cap haste at reasonable values (10% to 200%)
      cast.haste = Math.max(0.5, Math.min(2.0, cast.haste || 1.0));
    }
  }

  /**
   * Calculate delay between consecutive casts (nextCastLatency)
   */
  calculateCastLatencies() {
    const MAX_LATENCY = 1000; // Ignore gaps > 1s (likely movement)

    for (let i = 0; i < this.casts.length - 1; i++) {
      const current = this.casts[i];
      const next = this.casts[i + 1];

      const latency = next.castStart - current.castEnd;

      // Only track latency if it's a reasonable value
      if (latency >= 0 && latency <= MAX_LATENCY) {
        current.nextCastLatency = latency;
      }
    }
  }

  /**
   * Calculate DoT metrics with MoP Pandemic mechanics
   */
  calculateDotMetrics() {
    const MAX_ACTIVE_DOWNTIME = 10000; // Ignore gaps > 10s
    const PANDEMIC_PERCENT = 0.30; // Can refresh in last 30% without penalty

    const dotSpells = [589, 34914, 2944]; // SWP, VT, DP

    for (const cast of this.casts) {
      if (!dotSpells.includes(cast.spellId)) continue;

      // Find previous cast of same DoT on same target
      const previous = this.findPreviousDotCast(cast);

      if (!previous) continue;

      // Get spell data and calculate haste-adjusted values
      const spellData = getSpellData(cast.spellId);
      if (!spellData) continue;

      // Calculate tick interval using previous cast's haste (DoTs snapshot haste at cast time)
      const hastedTickInterval = calculateTickInterval(spellData, previous.haste) * 1000; // Convert to ms

      // Duration is fixed (doesn't scale with haste in MoP)
      const duration = spellData.maxDuration * 1000;

      // Calculate expected ticks based on haste
      const expectedTicks = Math.floor(duration / hastedTickInterval);

      const previousExpiry = previous.castStart + duration;
      const pandemicWindow = duration * PANDEMIC_PERCENT; // Last 30% of duration

      // Time between refresh and when previous would expire
      const timeToExpiry = previousExpiry - cast.castStart;

      // Initialize DoT quality metrics
      cast.dotQuality = {};

      if (timeToExpiry < 0) {
        // ===== REFRESHED TOO LATE (Downtime) =====
        const downtime = Math.abs(timeToExpiry);

        if (downtime <= MAX_ACTIVE_DOWNTIME) {
          cast.dotDowntime = downtime;
          cast.dotQuality.status = 'late';
          cast.dotQuality.message = `${(downtime / 1000).toFixed(1)}s downtime`;

          // Calculate DPS lost from downtime (use hasted tick interval)
          const ticksLost = downtime / hastedTickInterval;
          const avgTickDamage = this.getAvgTickDamage(cast, previous);
          cast.dotQuality.dpsLost = (ticksLost * avgTickDamage * 1000) / downtime;
        }

      } else if (timeToExpiry <= pandemicWindow) {
        // ===== REFRESHED IN PANDEMIC WINDOW (Optimal) =====
        cast.dotQuality.status = 'optimal';
        cast.dotQuality.message = `Pandemic (${(timeToExpiry / 1000).toFixed(1)}s remaining)`;
        cast.dotQuality.dpsLost = 0;

      } else {
        // ===== REFRESHED TOO EARLY (Lost Ticks) =====
        cast.clippedPreviousCast = true;

        // Calculate ticks lost (time outside pandemic window / hasted tick interval)
        const timeWasted = timeToExpiry - pandemicWindow;
        const ticksLost = Math.floor(timeWasted / hastedTickInterval);
        cast.clippedTicks = ticksLost;

        cast.dotQuality.status = 'early';
        cast.dotQuality.message = `Clipped ${ticksLost} tick${ticksLost !== 1 ? 's' : ''} early`;

        // Calculate DPS lost from wasted ticks
        const avgTickDamage = this.getAvgTickDamage(cast, previous);
        const totalDamageWasted = ticksLost * avgTickDamage;

        // Estimate active time (use fight duration as fallback)
        const activeTime = cast.castEnd - previous.castStart;
        cast.dotQuality.dpsLost = activeTime > 0 ? (totalDamageWasted * 1000) / activeTime : 0;
      }

      // Store haste info for debugging
      cast.hastedTickInterval = hastedTickInterval;
      cast.expectedTicks = expectedTicks;
    }
  }

  /**
   * Get average tick damage for a DoT cast
   * Uses actual damage from instances if available, otherwise estimates
   */
  getAvgTickDamage(cast, previousCast) {
    // Try to use actual damage from previous cast
    if (previousCast && previousCast.instances && previousCast.instances.length > 0) {
      const totalDamage = previousCast.instances.reduce((sum, inst) => sum + inst.amount, 0);
      return totalDamage / previousCast.instances.length;
    }

    // Try current cast
    if (cast.instances && cast.instances.length > 0) {
      const totalDamage = cast.instances.reduce((sum, inst) => sum + inst.amount, 0);
      return totalDamage / cast.instances.length;
    }

    // Fallback: estimate from total damage / expected ticks
    if (previousCast && previousCast.totalDamage > 0) {
      const spellData = getSpellData(cast.spellId);
      if (spellData && previousCast.hastedTickInterval) {
        const expectedTicks = Math.floor((spellData.maxDuration * 1000) / previousCast.hastedTickInterval);
        return previousCast.totalDamage / expectedTicks;
      }
    }

    return 0;
  }

  /**
   * Calculate channel metrics: early clipping of Mind Flay and other channels
   */
  calculateChannelMetrics() {
    const EARLY_CLIP_THRESHOLD = 0.67; // 67% to next tick

    for (const cast of this.casts) {
      const spellData = getSpellData(cast.spellId);
      if (!spellData || spellData.damageType !== DamageType.CHANNEL) continue;

      // Calculate hasted channel duration and tick interval
      const hastedTickInterval = calculateTickInterval(spellData, cast.haste) * 1000;
      const expectedDuration = spellData.maxDuration * 1000 / cast.haste; // Channels scale with haste

      const actualDuration = cast.castTimeMs;

      // Check if we stopped early
      if (actualDuration < expectedDuration) {
        const lastTickTime = Math.floor(actualDuration / hastedTickInterval) * hastedTickInterval;
        const timeToNextTick = lastTickTime + hastedTickInterval - actualDuration;

        // If we were close to the next tick, flag as early clip
        if (timeToNextTick < hastedTickInterval * EARLY_CLIP_THRESHOLD) {
          cast.clippedEarly = true;
        }
      }
    }
  }

  /**
   * Calculate cooldown metrics: time Mind Blast was ready but not used
   */
  calculateCooldownMetrics() {
    const MIND_BLAST_ID = 8092;
    const MIND_BLAST_CD = 8000; // 8 second cooldown

    let lastMindBlastTime = null;

    for (const cast of this.casts) {
      if (cast.spellId === MIND_BLAST_ID) {
        lastMindBlastTime = cast.castStart;
        continue;
      }

      // For non-Mind Blast casts, check if MB was off cooldown
      if (lastMindBlastTime !== null) {
        const timeSinceMB = cast.castStart - lastMindBlastTime;
        const timeOffCooldown = timeSinceMB - MIND_BLAST_CD;

        if (timeOffCooldown > 0) {
          cast.timeOffCooldown = timeOffCooldown;
        }
      }
    }
  }

  /**
   * Find previous DoT cast of same spell on same target
   */
  findPreviousDotCast(cast) {
    for (let i = this.casts.indexOf(cast) - 1; i >= 0; i--) {
      const previous = this.casts[i];

      if (previous.spellId === cast.spellId && previous.hasSameTarget(cast)) {
        return previous;
      }
    }
    return null;
  }

  /**
   * Get spell name from ID (deprecated - kept for backwards compatibility)
   * Use getSpellData(spellId).name instead
   */
  getSpellName(spellId) {
    const names = {
      // DoTs
      589: 'Shadow Word: Pain',
      34914: 'Vampiric Touch',
      2944: 'Devouring Plague',

      // Direct Damage
      8092: 'Mind Blast',
      73510: 'Mind Spike',
      32379: 'Shadow Word: Death',

      // Channels
      15407: 'Mind Flay',
      129197: 'Mind Flay: Insanity',
      48045: 'Mind Sear',

      // AoE Spells
      120517: 'Halo', // Cast
      120644: 'Halo', // Damage component
      120696: 'Halo', // Heal component
      121135: 'Cascade', // Cast
      127628: 'Cascade', // Damage component
      127627: 'Cascade', // Heal component
      110744: 'Divine Star', // Cast
      122128: 'Divine Star', // Damage component
      110745: 'Divine Star', // Heal component

      // Pet Abilities
      132603: 'Shadowfiend', // MoP Shadowfiend cast
      34433: 'Shadowfiend', // Legacy spell ID
      123040: 'Mindbender',

      // Cooldowns & Buffs
      47585: 'Dispersion',
      15286: 'Vampiric Embrace',
      10060: 'Power Infusion',

      // Racial Abilities
      26297: 'Berserking', // Troll racial
      20572: 'Blood Fury', // Orc racial
      28730: 'Arcane Torrent', // Blood Elf racial

      // Enchants & Procs
      126734: 'Synapse Springs', // Engineering enchant
      55637: 'Lightweave Embroidery', // Tailoring proc
      96230: 'Swordguard Embroidery', // Tailoring proc
      75170: 'Lifeblood', // Herbalism

      // Potions & Consumables
      105702: 'Potion of the Jade Serpent',
      105706: 'Potion of the Mogu',

      // Common Buffs & Procs
      87160: 'Mind Melt', // Mind Spike debuff
      81292: 'Shadow Orb', // Shadow Orb visual

      // Utility
      17: 'Power Word: Shield',
      2061: 'Flash Heal',
      2060: 'Greater Heal',
      2050: 'Heal',
      32546: 'Binding Heal',
      33076: 'Prayer of Mending',
      596: 'Prayer of Healing',
      64044: 'Psychic Horror',
      15487: 'Silence',
      8122: 'Psychic Scream',
      73325: 'Leap of Faith',
      527: 'Dispel Magic',
      528: 'Cure Disease',

      // Shadowform
      15473: 'Shadowform',

      // Priest Talents
      121536: 'Angelic Feather',
      108945: 'Angelic Bulwark',
      19236: 'Desperate Prayer',
      605: 'Dominate Mind',
      108921: 'Psyfiend',
      112833: 'Spectral Guise',
      108920: 'Void Tendrils'
    };
    return names[spellId] || `Unknown (${spellId})`;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CastsAnalyzer };
}
