// MoP Casts Analyzer
// Adapted from Wrath analyzer casts-analyzer.ts
// Calculates cast quality metrics: delays, clipping, downtime

// Note: Depends on spell-data.js and haste.js being loaded first
// Uses global: getSpellData, DamageType, HasteUtils

class CastsAnalyzer {
  constructor(events, buffEvents, settings) {
    this.events = events;
    this.buffEvents = buffEvents || []; // Buff apply/remove events
    this.settings = settings;
    this.casts = [];
    this.activeDots = new Map(); // Track active DoTs by target
    this.baseStats = { hasteRating: 0 }; // Will be updated from events
    this.activeBuffs = []; // Track currently active buffs
    this.dpPeriods = []; // Track when Devouring Plague is active (Insanity window)
  }

  /**
   * Main analysis function - parse events into CastDetails with quality metrics
   */
  analyze() {
    console.log('=== CastsAnalyzer.analyze() ===');
    console.log('Buff events count:', this.buffEvents.length);
    console.log('Sample buff events:', this.buffEvents.slice(0, 3));

    // Step 0: Extract combatantInfo from playerDetails if available
    this.extractCombatantInfo();

    // Step 1: Parse events into CastDetails objects
    this.parseCasts();

    // Step 2: Track Devouring Plague periods (Insanity windows)
    this.trackDevouringPlaguePeriods();

    // Step 3: Infer haste for each cast
    this.calculateHaste();

    // Step 4: Clean up DoT damage instances to exclude pre-refresh ticks
    // (Must run before channel metrics to detect pandemic-based optimal clips)
    this.cleanupDotDamageInstances();

    // Step 5: Calculate quality metrics
    this.calculateCastLatencies();
    this.calculateDotMetrics();
    this.calculateChannelMetrics();
    this.calculateCooldownMetrics();

    return this.casts;
  }

  /**
   * Extract combatantInfo from playerDetails
   * This gives us base stats (haste, intellect, etc.) from API
   */
  extractCombatantInfo() {
    if (!this.settings || !this.settings.playerDetails) {
      console.log('No playerDetails available, will infer stats from events');
      return;
    }

    const playerDetails = this.settings.playerDetails;
    console.log('=== PLAYER DETAILS ===');
    console.log(JSON.stringify(playerDetails, null, 2));

    // PlayerDetails is an object with combatantInfo for each player
    // Find our player's combatantInfo
    if (playerDetails && playerDetails.data && playerDetails.data.playerDetails) {
      const combatants = playerDetails.data.playerDetails.combatantInfo;
      if (combatants && combatants.length > 0) {
        // Take the first combatant (should be our player)
        const combatant = combatants[0];

        console.log('=== COMBATANT INFO ===');
        console.log(JSON.stringify(combatant, null, 2));

        // Extract base stats
        if (combatant.stats) {
          this.baseStats = {
            hasteRating: combatant.stats.Haste || 0,
            intellect: combatant.stats.Intellect || 0,
            spellPower: combatant.stats.SpellPower || 0,
            critRating: combatant.stats.Crit || 0,
            mastery: combatant.stats.Mastery || 0
          };

          console.log('Base stats extracted:', this.baseStats);
        }

        // Store gear/talents for reference
        this.combatantInfo = combatant;
      }
    }
  }

  /**
   * Apply a buff to active buffs list
   * Similar to Wrath's event-analyzer applyBuff method
   */
  applyBuff(buffEvent) {
    const auraId = buffEvent.abilityGameID;
    const buffData = window.getBuffData ? window.getBuffData(auraId, buffEvent.stack || 1) : null;

    if (!buffData) {
      return; // Unknown buff, skip
    }

    // Check if buff already exists (update stack)
    const existingIndex = this.activeBuffs.findIndex(b => b.id === auraId);

    if (existingIndex >= 0) {
      // Update existing buff with new stack count
      this.activeBuffs[existingIndex] = buffData;
    } else {
      // Add new buff
      this.activeBuffs.push(buffData);
    }
  }

  /**
   * Remove a buff from active buffs list
   */
  removeBuff(buffEvent) {
    const auraId = buffEvent.abilityGameID;

    // For removebuffstack, update the stack count instead of removing
    if (buffEvent.type === 'removebuffstack') {
      const buffData = window.getBuffData ? window.getBuffData(auraId, buffEvent.stack || 0) : null;
      const existingIndex = this.activeBuffs.findIndex(b => b.id === auraId);

      if (existingIndex >= 0 && buffData) {
        this.activeBuffs[existingIndex] = buffData;
      }
    } else {
      // Complete removal
      const index = this.activeBuffs.findIndex(b => b.id === auraId);
      if (index >= 0) {
        this.activeBuffs.splice(index, 1);
      }
    }
  }

  /**
   * Get a snapshot of currently active buffs
   * Returns a copy so modifications don't affect the original
   */
  getActiveBuffs() {
    return [...this.activeBuffs];
  }

  /**
   * Parse cast and damage events into CastDetails objects
   * Now includes buff tracking - merges buff events with cast events
   */
  parseCasts() {
    const castEvents = this.events.filter(e => e.type === 'cast');
    const damageEvents = this.events.filter(e => e.type === 'damage');

    // Merge buff events and cast events into timeline
    const timeline = this.mergeTimeline(castEvents, this.buffEvents);

    // Process timeline in order
    for (const event of timeline) {
      // Handle buff events
      if (event.type === 'applybuff' || event.type === 'applybuffstack') {
        this.applyBuff(event);
        continue;
      }

      if (event.type === 'removebuff' || event.type === 'removebuffstack') {
        this.removeBuff(event);
        continue;
      }

      // Handle cast events
      if (event.type === 'cast') {
        const spellId = event.abilityGameID;
        const spellData = getSpellData(spellId);

        // Snapshot current active buffs
        const activeBuffs = this.getActiveBuffs();

        // Create CastDetails object with active buffs
        const cast = new CastDetails({
          spellId: spellId,
          name: spellData ? spellData.name : `Unknown (${spellId})`,
          rank: 0, // MoP has no spell ranks
          castStart: event.timestamp,
          castEnd: event.timestamp, // Will update with last damage
          sourceId: event.sourceID,
          targetId: event.targetID,
          targetInstance: event.targetInstance || 0,
          buffs: activeBuffs, // Snapshot of active buffs!
          spellPower: 0, // TODO: Calculate from events
          haste: 0, // TODO: Calculate from events
          gcd: 1.0 // TODO: Calculate based on haste
        });

        // Match damage events to this cast
        const instances = this.matchDamageInstances(event, damageEvents);
        cast.setInstances(instances);

        // Update castEnd based on spell type
        if (cast.lastDamageTimestamp && spellData) {
          // For DoTs and Channels, castEnd is the last damage timestamp
          if (spellData.damageType === DamageType.DOT || spellData.damageType === DamageType.CHANNEL) {
            cast.castEnd = cast.lastDamageTimestamp;
          }
          // For spells with cast time (direct damage casts), castEnd is castStart + cast time
          else if (spellData.baseCastTime > 0) {
            // Use base cast time for now (haste adjustment happens later)
            cast.castEnd = cast.castStart + (spellData.baseCastTime * 1000);
          }
          // For instant direct damage (baseCastTime === 0), castEnd remains = castStart
          // This prevents damage event latency from affecting cast latency calculations

          cast.castTimeMs = cast.castEnd - cast.castStart;
        }

        this.casts.push(cast);
      }
    }

    // Sort by timestamp
    this.casts.sort((a, b) => a.castStart - b.castStart);
  }

  /**
   * Merge buff events and cast events into a single timeline sorted by timestamp
   */
  mergeTimeline(castEvents, buffEvents) {
    const combined = [...castEvents, ...buffEvents];
    combined.sort((a, b) => a.timestamp - b.timestamp);
    return combined;
  }

  /**
   * Track when Devouring Plague is active on targets (Insanity windows)
   * This is used to detect when DoT downtime is intentional (during Insanity priority)
   *
   * IMPORTANT: Includes Mind Flay pandemic optimization
   * When MF is clipped near the end of DP, the new MF gets 4 ticks (pandemic).
   * Even though DP expires during the MF, those ticks are still Insanity-buffed.
   * This effectively extends the Insanity window beyond DP's 6s duration.
   */
  trackDevouringPlaguePeriods() {
    const DP_SPELL_ID = 2944;
    const MF_INSANITY_ID = 129197;

    this.dpPeriods = [];

    for (const cast of this.casts) {
      if (cast.spellId !== DP_SPELL_ID) continue;

      const spellData = getSpellData(DP_SPELL_ID);
      if (!spellData) continue;

      // DP duration in ms (fixed 6 seconds in MoP, doesn't scale with haste)
      const duration = spellData.maxDuration * 1000;

      // DP creates an Insanity window from cast time to expiry
      const period = {
        targetId: cast.targetId,
        targetInstance: cast.targetInstance || 0,
        startTime: cast.castStart,
        endTime: cast.castStart + duration,
        dpCast: cast // Reference to DP cast for debugging
      };

      this.dpPeriods.push(period);
    }

    // Extend Insanity windows based on Mind Flay pandemic optimization
    // When MF is clipped near end of DP, the new MF gets 4 ticks that extend Insanity
    this.extendInsanityWindowsForMindFlayPandemic();

    console.log('Tracked DP periods (Insanity windows):', this.dpPeriods.length);
  }

  /**
   * Extend Insanity windows when Mind Flay is clipped near the end of DP
   *
   * Optimization: Clip MF right before DP expires to get 4 pandemic ticks,
   * effectively extending Insanity window by ~3 seconds (those extra MF ticks)
   */
  extendInsanityWindowsForMindFlayPandemic() {
    const MF_INSANITY_ID = 129197;
    const MF_REGULAR_ID = 15407;
    const CLIP_WINDOW = 2000; // Look for MF clips in last 2s of DP

    for (const period of this.dpPeriods) {
      // Find MF: Insanity casts during this DP period
      const mfCasts = this.casts.filter(cast =>
        (cast.spellId === MF_INSANITY_ID || cast.spellId === MF_REGULAR_ID) &&
        cast.targetId === period.targetId &&
        (cast.targetInstance || 0) === period.targetInstance &&
        cast.castStart >= period.startTime &&
        cast.castStart <= period.endTime
      );

      // Look for MF casts that start near the end of DP (optimization window)
      const lateMFCasts = mfCasts.filter(mf => {
        const timeBeforeDPExpiry = period.endTime - mf.castStart;
        return timeBeforeDPExpiry > 0 && timeBeforeDPExpiry <= CLIP_WINDOW;
      });

      if (lateMFCasts.length > 0) {
        // Find the last MF cast before DP expires
        const lastMF = lateMFCasts[lateMFCasts.length - 1];

        // Calculate how long MF continues after DP expires
        const mfEndTime = lastMF.castEnd;

        if (mfEndTime > period.endTime) {
          // MF extends beyond DP expiry - this is the pandemic optimization
          // Mark this as an extended Insanity window
          period.extendedEndTime = mfEndTime;
          period.extendedByMF = true;
          period.extensionCast = lastMF;

          console.log(`Extended Insanity window by ${((mfEndTime - period.endTime) / 1000).toFixed(1)}s (MF pandemic optimization)`);
        } else {
          // MF ended before/at DP expiry - MISSED OPTIMIZATION!
          // Should have clipped MF to get 3 extra Insanity-buffed ticks
          const spellData = getSpellData(lastMF.spellId);
          const expectedDuration = spellData ? (spellData.maxDuration * 1000 / lastMF.haste) : 3000;
          const actualDuration = mfEndTime - lastMF.castStart;

          // Check if MF ran to completion (not clipped for another reason)
          const ranToCompletion = actualDuration >= expectedDuration * 0.95; // 95% threshold

          if (ranToCompletion) {
            // Mark this MF as having missed the optimization
            lastMF.missedInsanityOptimization = true;
            lastMF.insanityOptimizationError = 'Should have clipped for 3 extra Insanity ticks';

            console.log(`Missed Insanity optimization at ${(lastMF.castStart / 1000).toFixed(1)}s - MF not clipped before DP expired`);
          }
        }
      }
    }
  }

  /**
   * Check if Devouring Plague (Insanity) was active during a time period
   * @param {number} targetId - Target ID to check
   * @param {number} targetInstance - Target instance
   * @param {number} startTime - Start of period to check
   * @param {number} endTime - End of period to check
   * @returns {boolean} True if DP was active for any part of this period
   */
  wasInsanityActive(targetId, targetInstance, startTime, endTime) {
    targetInstance = targetInstance || 0;

    return this.dpPeriods.some(period => {
      // Must be same target
      if (period.targetId !== targetId || period.targetInstance !== targetInstance) {
        return false;
      }

      // Use extended end time if MF pandemic optimization was used
      const effectiveEndTime = period.extendedEndTime || period.endTime;

      // Check if periods overlap
      return period.startTime < endTime && effectiveEndTime > startTime;
    });
  }

  /**
   * Check if Insanity recently ended before a given time
   * @param {number} targetId - Target ID to check
   * @param {number} targetInstance - Target instance
   * @param {number} checkTime - Time to check
   * @param {number} maxGapMs - Maximum gap after Insanity ends (default 5000ms)
   * @returns {boolean} True if Insanity ended within maxGapMs before checkTime
   */
  wasInsanityRecentlyActive(targetId, targetInstance, checkTime, maxGapMs = 5000) {
    targetInstance = targetInstance || 0;

    return this.dpPeriods.some(period => {
      // Must be same target
      if (period.targetId !== targetId || period.targetInstance !== targetInstance) {
        return false;
      }

      // Use extended end time if MF pandemic optimization was used
      const effectiveEndTime = period.extendedEndTime || period.endTime;

      // Check if Insanity ended recently before checkTime
      const timeSinceEnd = checkTime - effectiveEndTime;
      return timeSinceEnd >= 0 && timeSinceEnd <= maxGapMs;
    });
  }

  /**
   * Find Mind Blast casts during a time period
   * @param {number} startTime - Start of period
   * @param {number} endTime - End of period
   * @returns {Array} Array of MB casts during this period
   */
  findMindBlastCasts(startTime, endTime) {
    const MIND_BLAST_ID = 8092;

    return this.casts.filter(cast => {
      return cast.spellId === MIND_BLAST_ID &&
             cast.castStart >= startTime &&
             cast.castStart <= endTime;
    });
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
   * Now uses combatantInfo base stats + buff data when available
   * Falls back to inferring from cast times if combatantInfo unavailable
   */
  calculateHaste() {
    const HASTE_RATING_PER_PERCENT = 425.17; // MoP level 90

    // Check if we have base stats from combatantInfo
    const hasBaseStats = this.baseStats && this.baseStats.hasteRating !== undefined;

    if (hasBaseStats) {
      console.log(`=== Using combatantInfo for haste calculation ===`);
      console.log(`Base haste rating: ${this.baseStats.hasteRating}`);

      // Calculate base haste multiplier from rating
      const baseHastePercent = this.baseStats.hasteRating / HASTE_RATING_PER_PERCENT;
      const baseHasteMultiplier = 1 + (baseHastePercent / 100);

      console.log(`Base haste: ${(baseHastePercent).toFixed(2)}% (multiplier: ${baseHasteMultiplier.toFixed(4)})`);

      for (const cast of this.casts) {
        // Start with base haste
        let hasteMultiplier = baseHasteMultiplier;

        // Add haste from buffs active at cast time
        if (cast.buffs && cast.buffs.length > 0) {
          for (const buff of cast.buffs) {
            if (buff.haste && buff.haste > 0) {
              // Buff haste is additive with base haste %
              hasteMultiplier += (buff.haste / 100);
            }
            if (buff.hasteRating && buff.hasteRating > 0) {
              // Convert rating to % and add
              const buffHastePercent = buff.hasteRating / HASTE_RATING_PER_PERCENT;
              hasteMultiplier += (buffHastePercent / 100);
            }
          }
        }

        cast.haste = hasteMultiplier;
      }
    } else {
      console.log('=== No combatantInfo, inferring haste from cast times ===');

      for (const cast of this.casts) {
        const spellData = getSpellData(cast.spellId);
        if (!spellData) {
          cast.haste = 1.0; // No haste data
          continue;
        }

        // Start with base haste (1.0 = no haste)
        cast.haste = 1.0;

        // Try to infer haste from actual cast/tick times
        if (HasteUtils.canInferHaste(cast, spellData)) {
          const error = HasteUtils.getHasteError(cast, spellData);

          // Only update haste if error is within reasonable bounds
          if (Math.abs(error) < HasteUtils.ERROR_THRESHOLD) {
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

        // Cap haste at reasonable values (50% to 200%)
        cast.haste = Math.max(0.5, Math.min(2.0, cast.haste || 1.0));
      }
    }
  }

  /**
   * Calculate delay between consecutive casts (nextCastLatency)
   * For instant casts, accounts for GCD before calculating latency
   */
  calculateCastLatencies() {
    const MAX_LATENCY = 1000; // Ignore gaps > 1s (likely movement)
    const BASE_GCD = 1500; // 1.5s base GCD in ms
    const MIN_GCD = 1000; // 1.0s minimum GCD in ms

    // First pass: Calculate GCD for each cast
    for (const cast of this.casts) {
      const spellData = getSpellData(cast.spellId);

      // Check if spell triggers GCD (some spells like Berserking, Power Infusion have gcd: false)
      const triggersGCD = !spellData || spellData.gcd !== false;

      if (triggersGCD) {
        // Calculate hasted GCD (1.5s base, reduced by haste, floor 1.0s)
        const hastedGCD = Math.max(MIN_GCD, BASE_GCD / cast.haste);
        cast.gcd = hastedGCD;
      } else {
        // No GCD for this spell (e.g., Berserking, Power Infusion, Potion)
        cast.gcd = 0;
      }

      // Determine if this is an instant cast
      // Instant casts have castEnd = castStart (no cast bar)
      const castDuration = cast.castEnd - cast.castStart;
      const isInstantCast = (castDuration === 0) ||
                           (spellData && spellData.baseCastTime === 0);
      cast.isInstantCast = isInstantCast;

      if (isInstantCast) {
        console.log(`Instant cast detected: ${cast.name} (${cast.spellId}), GCD: ${cast.gcd}ms, triggersGCD: ${triggersGCD}, castDuration: ${castDuration}ms`);
      }
    }

    // Second pass: Calculate latency between casts
    for (let i = 0; i < this.casts.length - 1; i++) {
      const current = this.casts[i];
      const next = this.casts[i + 1];

      // Raw time between casts
      const rawGap = next.castStart - current.castEnd;

      // For instant casts, subtract the GCD (expected delay)
      // Only the time BEYOND the GCD is considered latency
      let latency = rawGap;
      if (current.isInstantCast) {
        latency = rawGap - current.gcd;
        console.log(`Adjusted instant cast latency: ${current.name}, rawGap: ${rawGap}ms, GCD: ${current.gcd}ms, latency: ${latency}ms`);
      }

      // Only track latency if it's a reasonable value
      // For instant casts, latency can be negative if cast faster than GCD (impossible, but handle it)
      if (latency < 0) latency = 0;

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
      const hastedTickInterval = HasteUtils.calculateTickInterval(spellData, previous.haste) * 1000; // Convert to ms

      // Duration is fixed (doesn't scale with haste in MoP)
      const duration = spellData.maxDuration * 1000;

      // Calculate expected ticks based on haste
      const expectedTicks = Math.floor(duration / hastedTickInterval);

      const previousExpiry = previous.castStart + duration;

      // PANDEMIC WINDOW = 1 tick interval (not 30%!)
      // Refreshing within last tick interval is optimal - carries over the remaining time
      const pandemicWindow = hastedTickInterval;

      // Time between refresh and when previous would expire
      const timeToExpiry = previousExpiry - cast.castStart;

      // Initialize DoT quality metrics
      cast.dotQuality = {};

      if (timeToExpiry < 0) {
        // ===== REFRESHED TOO LATE (Downtime) =====
        const downtime = Math.abs(timeToExpiry);

        if (downtime <= MAX_ACTIVE_DOWNTIME) {
          cast.dotDowntime = downtime;

          const downtimeStart = previousExpiry;
          const downtimeEnd = cast.castStart;

          // Check if downtime is intentional (SW:P and VT only, not DP)
          const isDotThatCanWait = (cast.spellId === 589 || cast.spellId === 34914);

          // Check if Insanity (DP) was active during the downtime period
          const insanityActive = isDotThatCanWait &&
                                 this.wasInsanityActive(cast.targetId, cast.targetInstance, downtimeStart, downtimeEnd);

          // Check if Mind Blast was cast during downtime after Insanity ended
          // Priority: Insanity > Mind Blast > DoTs
          // So MB right after Insanity is correct and causes intentional downtime
          const mbCastsDuringDowntime = this.findMindBlastCasts(downtimeStart, downtimeEnd);
          const insanityRecentlyEnded = isDotThatCanWait &&
                                        this.wasInsanityRecentlyActive(cast.targetId, cast.targetInstance, downtimeEnd);

          if (insanityActive) {
            // Downtime during Insanity is intentional (Mind Flay: Insanity priority)
            cast.dotQuality.status = 'optimal';
            cast.dotQuality.message = `Expected downtime (Insanity priority)`;
            cast.dotQuality.dpsLost = 0;
          } else if (mbCastsDuringDowntime.length > 0 && insanityRecentlyEnded) {
            // Downtime from MB cast after Insanity is intentional
            // MB generates orbs needed for next DP, so it takes priority
            cast.dotQuality.status = 'optimal';
            cast.dotQuality.message = `Expected downtime (Mind Blast priority)`;
            cast.dotQuality.dpsLost = 0;
          } else if (mbCastsDuringDowntime.length > 0) {
            // MB was cast during downtime, but not right after Insanity
            // Calculate actual downtime excluding MB cast time
            let mbTime = 0;
            mbCastsDuringDowntime.forEach(mb => {
              // MB cast time + GCD (roughly 1.5s baseline, adjusted by haste)
              const mbDuration = mb.castEnd - mb.castStart;
              mbTime += mbDuration;
            });

            const actualDowntime = downtime - mbTime;

            if (actualDowntime <= 500) {
              // Less than 0.5s of real downtime after accounting for MB - acceptable
              cast.dotQuality.status = 'optimal';
              cast.dotQuality.message = `Acceptable (${(actualDowntime / 1000).toFixed(1)}s after MB)`;
              cast.dotQuality.dpsLost = 0;
            } else {
              // Still significant downtime after MB cast
              cast.dotQuality.status = 'late';
              cast.dotQuality.message = `${(actualDowntime / 1000).toFixed(1)}s downtime (after MB)`;

              const ticksLost = actualDowntime / hastedTickInterval;
              const avgTickDamage = this.getAvgTickDamage(cast, previous);
              cast.dotQuality.dpsLost = (ticksLost * avgTickDamage * 1000) / actualDowntime;
            }
          } else {
            // Actual bad downtime - no Insanity, no MB cast
            cast.dotQuality.status = 'late';
            cast.dotQuality.message = `${(downtime / 1000).toFixed(1)}s downtime`;

            // Calculate DPS lost from downtime (use hasted tick interval)
            const ticksLost = downtime / hastedTickInterval;
            const avgTickDamage = this.getAvgTickDamage(cast, previous);
            cast.dotQuality.dpsLost = (ticksLost * avgTickDamage * 1000) / downtime;
          }
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

        // Determine severity based on ticks wasted
        if (ticksLost >= 2) {
          // Major waste: 2+ ticks
          cast.dotQuality.status = 'major-early';
          cast.dotQuality.message = `Wasted ${ticksLost} ticks (refreshed too early)`;
        } else if (ticksLost === 1) {
          // Minor waste: 1 tick
          cast.dotQuality.status = 'minor-early';
          cast.dotQuality.message = `Wasted 1 tick (slightly early)`;
        } else {
          // Edge case: very slight early (less than 1 full tick)
          cast.dotQuality.status = 'optimal';
          cast.dotQuality.message = `Pandemic (${(timeToExpiry / 1000).toFixed(1)}s remaining)`;
        }

        // Calculate DPS lost from wasted ticks (only if ticks were actually lost)
        if (ticksLost > 0) {
          const avgTickDamage = this.getAvgTickDamage(cast, previous);
          const totalDamageWasted = ticksLost * avgTickDamage;

          // Estimate active time (use fight duration as fallback)
          const activeTime = cast.castEnd - previous.castStart;
          cast.dotQuality.dpsLost = activeTime > 0 ? (totalDamageWasted * 1000) / activeTime : 0;
        } else {
          cast.dotQuality.dpsLost = 0;
        }
      }

      // Store haste info for debugging
      // Store CURRENT cast's hasted tick interval (for display)
      const currentHastedTickInterval = HasteUtils.calculateTickInterval(spellData, cast.haste) * 1000;
      cast.hastedTickInterval = currentHastedTickInterval;
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
    const MF_INSANITY_ID = 129197;
    const MF_REGULAR_ID = 15407;

    for (const cast of this.casts) {
      const spellData = getSpellData(cast.spellId);
      if (!spellData || spellData.damageType !== DamageType.CHANNEL) continue;

      // Calculate hasted channel duration and tick interval
      const hastedTickInterval = HasteUtils.calculateTickInterval(spellData, cast.haste) * 1000;
      const expectedDuration = spellData.maxDuration * 1000 / cast.haste; // Channels scale with haste

      const actualDuration = cast.castTimeMs;

      // Check if we stopped early
      if (actualDuration < expectedDuration) {
        const lastTickTime = Math.floor(actualDuration / hastedTickInterval) * hastedTickInterval;
        const timeToNextTick = lastTickTime + hastedTickInterval - actualDuration;

        // If we were close to the next tick, flag as early clip
        if (timeToNextTick < hastedTickInterval * EARLY_CLIP_THRESHOLD) {
          // Check if this is an optimal MF clip for Insanity pandemic optimization
          const isMindFlay = (cast.spellId === MF_INSANITY_ID || cast.spellId === MF_REGULAR_ID);
          const isInsanityOptimization = isMindFlay && this.isMindFlayInsanityOptimization(cast);

          // Check if we clipped to cast an optimal DoT refresh
          // (pandemic refresh OR Insanity preparation)
          const nextCast = this.getNextCast(cast);
          const isOptimalDotRefresh = nextCast &&
                                      nextCast.dotQuality &&
                                      nextCast.dotQuality.status === 'optimal';

          console.log(`Early clip detected for ${cast.name} at ${(cast.castStart / 1000).toFixed(2)}s`);
          console.log(`  Next cast: ${nextCast ? nextCast.name : 'none'}`);
          console.log(`  Next cast dotQuality: ${nextCast && nextCast.dotQuality ? nextCast.dotQuality.status : 'N/A'}`);
          console.log(`  isInsanityOptimization: ${isInsanityOptimization}`);
          console.log(`  isOptimalDotRefresh: ${isOptimalDotRefresh}`);

          if (isInsanityOptimization) {
            // This is an optimal clip for Insanity pandemic - mark it differently
            cast.optimalClip = true;
            cast.clipReason = 'Insanity pandemic optimization';
          } else if (isOptimalDotRefresh) {
            // Clipped to refresh DoT optimally (pandemic OR Insanity prep)
            cast.optimalClip = true;
            cast.clipReason = 'Clipped for optimal DoT refresh';
          } else {
            // Regular early clip (potentially bad)
            cast.clippedEarly = true;
          }
        }
      }
    }
  }

  /**
   * Check if a Mind Flay cast is part of the Insanity pandemic optimization
   * @param {CastDetails} mfCast - The Mind Flay cast to check
   * @returns {boolean} True if this MF is extending an Insanity window
   */
  isMindFlayInsanityOptimization(mfCast) {
    // Check if this MF is marked as extending any DP period
    return this.dpPeriods.some(period => {
      return period.extendedByMF &&
             period.extensionCast === mfCast &&
             period.targetId === mfCast.targetId &&
             (period.targetInstance || 0) === (mfCast.targetInstance || 0);
    });
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
   * Clean up DoT damage instances to exclude ticks from previous cast
   *
   * When a DoT is refreshed with pandemic, the damage instances include ticks
   * from BOTH the old cast (still ticking) and the new cast. This is confusing.
   *
   * This method filters instances:
   * - Previous cast: Only show ticks UP TO when it would expire (without pandemic)
   * - Current cast: Only show ticks AFTER the previous would have expired
   */
  cleanupDotDamageInstances() {
    const dotSpells = [589, 34914, 2944]; // SWP, VT, DP

    for (const cast of this.casts) {
      if (!dotSpells.includes(cast.spellId)) continue;

      const previous = this.findPreviousDotCast(cast);
      if (!previous) continue; // Initial cast, no cleanup needed

      const spellData = getSpellData(cast.spellId);
      if (!spellData) continue;

      // Calculate when previous cast would have expired (without pandemic carryover)
      const previousDuration = spellData.maxDuration * 1000;
      const previousExpiry = previous.castStart + previousDuration;

      // ALWAYS clean up previous cast: remove ticks after it expired
      // (This applies regardless of pandemic or downtime)
      const prevOriginalCount = previous.instances.length;
      previous.instances = previous.instances.filter(inst => inst.timestamp <= previousExpiry);
      const prevRemovedCount = prevOriginalCount - previous.instances.length;

      if (prevRemovedCount > 0) {
        console.log(`Cleaned up ${prevRemovedCount} post-expiry ticks from previous ${previous.name} at ${(previous.castStart / 1000).toFixed(1)}s`);

        // Recalculate previous cast's castEnd
        if (previous.instances.length > 0) {
          const lastInstance = previous.instances[previous.instances.length - 1];
          previous.castEnd = lastInstance.timestamp;
          previous.castTimeMs = previous.castEnd - previous.castStart;
        }
      }

      // Calculate pandemic carryover time
      const carryoverTime = previousExpiry - cast.castStart;

      console.log(`DoT ${cast.name} at ${(cast.castStart / 1000).toFixed(1)}s: previous expiry=${(previousExpiry / 1000).toFixed(1)}s, carryoverTime=${(carryoverTime / 1000).toFixed(2)}s`);

      if (carryoverTime > 0) {
        // This is a pandemic refresh - also clean up current cast

        // Clean up CURRENT cast: remove ticks before previous expiry
        const currentOriginalCount = cast.instances.length;
        cast.instances = cast.instances.filter(inst => inst.timestamp > previousExpiry);
        const currentRemovedCount = currentOriginalCount - cast.instances.length;

        // Store pandemic info for display
        cast.pandemicRefresh = true;
        cast.pandemicCarryover = carryoverTime;

        console.log(`  -> Marked as pandemic refresh with ${(carryoverTime / 1000).toFixed(2)}s carryover`);

        if (currentRemovedCount > 0) {
          console.log(`Cleaned up ${currentRemovedCount} pre-refresh ticks from current ${cast.name} at ${(cast.castStart / 1000).toFixed(1)}s`);
        }

        // Recalculate castEnd based on filtered instances
        if (cast.instances.length > 0) {
          const lastInstance = cast.instances[cast.instances.length - 1];
          cast.castEnd = lastInstance.timestamp;
          cast.castTimeMs = cast.castEnd - cast.castStart;
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
   * Get the next cast after the given cast
   */
  getNextCast(cast) {
    const index = this.casts.indexOf(cast);
    if (index === -1 || index === this.casts.length - 1) {
      return null;
    }
    return this.casts[index + 1];
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
