// MoP Casts Analyzer
// Adapted from Wrath analyzer casts-analyzer.ts
// Calculates cast quality metrics: delays, clipping, downtime

class CastsAnalyzer {
  constructor(events, settings) {
    this.events = events;
    this.settings = settings;
    this.casts = [];
    this.activeDots = new Map(); // Track active DoTs by target
  }

  /**
   * Main analysis function - parse events into CastDetails with quality metrics
   */
  analyze() {
    // Step 1: Parse events into CastDetails objects
    this.parseCasts();

    // Step 2: Calculate quality metrics
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
      const cast = new CastDetails({
        spellId: spellId,
        name: this.getSpellName(spellId),
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
    const isDoT = this.isDoTSpell(spellId);
    const isChannel = this.isChannelSpell(spellId);
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
   * Calculate DoT metrics: downtime before refresh, clipping previous cast
   */
  calculateDotMetrics() {
    const MAX_ACTIVE_DOWNTIME = 10000; // Ignore gaps > 10s

    const dotSpells = [589, 34914, 2944]; // SWP, VT, DP

    for (const cast of this.casts) {
      if (!dotSpells.includes(cast.spellId)) continue;

      // Find previous cast of same DoT on same target
      const previous = this.findPreviousDotCast(cast);

      if (!previous) continue;

      // Calculate downtime (gap between previous DoT expiring and new cast)
      const duration = this.getBaseDotDuration(cast.spellId);
      const previousExpiry = previous.castStart + duration;
      const downtime = cast.castStart - previousExpiry;

      // Only track downtime if reasonable
      if (downtime > 0 && downtime <= MAX_ACTIVE_DOWNTIME) {
        cast.dotDowntime = downtime;
      }

      // Check if we clipped previous DoT (refreshed before it expired)
      if (downtime < 0) {
        cast.clippedPreviousCast = true;

        // Calculate how many ticks were lost
        const tickInterval = this.getTickInterval(cast.spellId);
        const timeRemaining = Math.abs(downtime);
        const ticksLost = Math.floor(timeRemaining / tickInterval);
        cast.clippedTicks = ticksLost;
      }
    }
  }

  /**
   * Calculate channel metrics: early clipping of Mind Flay and other channels
   */
  calculateChannelMetrics() {
    const EARLY_CLIP_THRESHOLD = 0.67; // 67% to next tick

    for (const cast of this.casts) {
      if (!this.isChannelSpell(cast.spellId)) continue;

      // Mind Flay and Mind Flay: Insanity have 3 ticks at 1s intervals (3s total channel)
      // Mind Sear has 5 ticks at 1s intervals (5s total channel)
      let expectedDuration, tickInterval;

      if (cast.spellId === 15407 || cast.spellId === 129197) {
        // Mind Flay / Mind Flay: Insanity
        expectedDuration = 3000;
        tickInterval = 1000;
      } else if (cast.spellId === 48045) {
        // Mind Sear
        expectedDuration = 5000;
        tickInterval = 1000;
      } else {
        continue; // Unknown channel
      }

      const actualDuration = cast.castTimeMs;

      // Check if we stopped early
      if (actualDuration < expectedDuration) {
        const lastTickTime = Math.floor(actualDuration / tickInterval) * tickInterval;
        const timeToNextTick = lastTickTime + tickInterval - actualDuration;

        // If we were close to the next tick, flag as early clip
        if (timeToNextTick < tickInterval * EARLY_CLIP_THRESHOLD) {
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
   * Get base DoT duration (in ms)
   */
  getBaseDotDuration(spellId) {
    const durations = {
      589: 18000,   // Shadow Word: Pain - 18s
      34914: 15000, // Vampiric Touch - 15s
      2944: 6000    // Devouring Plague - 6s
    };
    return durations[spellId] || 0;
  }

  /**
   * Get DoT tick interval (in ms)
   */
  getTickInterval(spellId) {
    const intervals = {
      589: 2000,   // Shadow Word: Pain - 2s per tick
      34914: 3000, // Vampiric Touch - 3s per tick
      2944: 1000   // Devouring Plague - 1s per tick
    };
    return intervals[spellId] || 0;
  }

  /**
   * Check if spell is a DoT
   */
  isDoTSpell(spellId) {
    return [589, 34914, 2944].includes(spellId);
  }

  /**
   * Check if spell is a channel
   */
  isChannelSpell(spellId) {
    return [15407, 129197, 48045].includes(spellId); // Mind Flay, Mind Flay: Insanity, Mind Sear
  }

  /**
   * Get spell name from ID
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
      15473: 'Shadowform'
    };
    return names[spellId] || `Unknown (${spellId})`;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CastsAnalyzer };
}
