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

    // Step 4b: Clean up Mind Flay damage instances to exclude post-refresh ticks
    // Mind Flay has a unique "refresh" mechanic where casting again extends the channel
    this.cleanupMindFlayDamageInstances();

    // Step 5: Calculate quality metrics
    this.calculateCastLatencies();
    this.calculateDotMetrics();
    this.calculateChannelMetrics();
    this.calculateCooldownMetrics();
    this.trackShadowOrbs();
    this.calculateDevouringPlagueMetrics();

    // Extract talents from combatantInfo
    const talents = this.extractTalents();

    return {
      casts: this.casts,
      talents: talents
    };
  }

  /**
   * Extract talents from combatantInfo
   * Returns array of talent objects or null if no talents available
   */
  extractTalents() {
    if (!this.combatantInfo || !this.combatantInfo.talents) {
      return null;
    }

    const rawTalents = this.combatantInfo.talents;

    // Map talent names to correct tiers (WCL data may have wrong tier info)
    const talentTierMap = {
      // Tier 1 (Level 15)
      'Void Tendrils': 1,
      'Psyfiend': 1,
      'Dominate Mind': 1,
      'Mind Control': 1,  // WCL returns this name instead of "Dominate Mind"
      // Tier 2 (Level 30)
      'Body and Soul': 2,
      'Angelic Feather': 2,
      'Phantasm': 2,
      // Tier 3 (Level 45)
      'From Darkness, Comes Light': 3,
      'Surge of Light': 3,  // WCL may return this name instead of "From Darkness, Comes Light"
      'Mindbender': 3,
      'Solace and Insanity': 3,
      // Tier 4 (Level 60)
      'Desperate Prayer': 4,
      'Spectral Guise': 4,
      'Angelic Bulwark': 4,
      // Tier 5 (Level 75)
      'Twist of Fate': 5,
      'Power Infusion': 5,
      'Divine Insight': 5,
      // Tier 6 (Level 90)
      'Cascade': 6,
      'Divine Star': 6,
      'Halo': 6
    };

    // Remap talents to correct tiers
    const correctedTalents = rawTalents.map(talent => {
      const correctTier = talentTierMap[talent.name];
      if (correctTier) {
        return {
          ...talent,
          type: correctTier
        };
      }
      console.warn(`Unknown talent: ${talent.name}, keeping original tier ${talent.type}`);
      return talent;
    });

    return correctedTalents;
  }

  /**
   * Extract combatantInfo from playerDetails
   * This gives us base stats (haste, intellect, etc.) from API
   */
  extractCombatantInfo() {
    if (!this.settings || !this.settings.playerDetails) {
      return;
    }

    const playerDetails = this.settings.playerDetails;

    // New structure: playerList array with each player having combatantInfo inside
    if (playerDetails && playerDetails.playerList && playerDetails.playerList.length > 0) {

      // Find our player using the playerName from settings
      let ourPlayer = null;
      const playerName = this.settings.playerName;

      if (playerName) {
        ourPlayer = playerDetails.playerList.find(p => p.name === playerName);
      }

      // Fallback: use first player if we can't identify
      if (!ourPlayer) {
        ourPlayer = playerDetails.playerList[0];
      }

      // Extract combatantInfo from the player object
      if (ourPlayer && ourPlayer.combatantInfo) {
        const combatant = ourPlayer.combatantInfo;

        // Extract base stats - stats may be objects with min/max or simple numbers
        if (combatant.stats) {
          this.baseStats = {
            hasteRating: combatant.stats.Haste?.max || combatant.stats.Haste?.min || combatant.stats.Haste || 0,
            intellect: combatant.stats.Intellect?.max || combatant.stats.Intellect?.min || combatant.stats.Intellect || 0,
            spellPower: combatant.stats.SpellPower?.max || combatant.stats.SpellPower?.min || combatant.stats.SpellPower || 0,
            critRating: combatant.stats.Crit?.max || combatant.stats.Crit?.min || combatant.stats.Crit || 0,
            mastery: combatant.stats.Mastery?.max || combatant.stats.Mastery?.min || combatant.stats.Mastery || 0
          };
        }

        // Store gear/talents for reference
        this.combatantInfo = combatant;
      }
    }
    // Old structure fallback
    else if (playerDetails && playerDetails.combatantInfo && playerDetails.combatantInfo.length > 0) {
      const combatant = playerDetails.combatantInfo[0];

      if (combatant.stats) {
        this.baseStats = {
          hasteRating: combatant.stats.Haste?.max || combatant.stats.Haste?.min || combatant.stats.Haste || 0,
          intellect: combatant.stats.Intellect?.max || combatant.stats.Intellect?.min || combatant.stats.Intellect || 0,
          spellPower: combatant.stats.SpellPower?.max || combatant.stats.SpellPower?.min || combatant.stats.SpellPower || 0,
          critRating: combatant.stats.Crit?.max || combatant.stats.Crit?.min || combatant.stats.Crit || 0,
          mastery: combatant.stats.Mastery?.max || combatant.stats.Mastery?.min || combatant.stats.Mastery || 0
        };
      }

      this.combatantInfo = combatant;
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
   * Now includes begincast events for accurate cast start timing
   */
  parseCasts() {
    const castEvents = this.events.filter(e => e.type === 'cast');
    const beginCastEvents = this.events.filter(e => e.type === 'begincast');
    const damageEvents = this.events.filter(e => e.type === 'damage');

    console.log(`Found ${beginCastEvents.length} begincast events out of ${this.events.length} total events`);
    console.log(`Cast events: ${castEvents.length}, Damage events: ${damageEvents.length}`);

    // Create a map of begincast events for matching with cast events
    // Key: spellId only (begincast events have targetID: -1, so we can't match by target)
    // Value: array of begincast events (will match and remove as we process)
    const beginCastMap = new Map();
    for (const bc of beginCastEvents) {
      const key = bc.abilityGameID;
      if (!beginCastMap.has(key)) {
        beginCastMap.set(key, []);
      }
      beginCastMap.get(key).push(bc);
    }
    console.log(`Created begincast map with ${beginCastMap.size} unique spells`);

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

        // Try to find matching begincast event
        // Match by spellId only (begincast events have targetID: -1)
        let actualCastStart = event.timestamp; // Default to cast finish time

        if (beginCastMap.has(spellId)) {
          const begincasts = beginCastMap.get(spellId);
          // Find the most recent begincast before this cast event
          let matchingBegincast = null;
          let matchIndex = -1;

          for (let i = begincasts.length - 1; i >= 0; i--) {
            const bc = begincasts[i];
            // Begincast should be before or at the cast event, and within 10s window
            if (bc.timestamp <= event.timestamp && (event.timestamp - bc.timestamp) < 10000) {
              matchingBegincast = bc;
              matchIndex = i;
              break;
            }
          }

          if (matchingBegincast) {
            actualCastStart = matchingBegincast.timestamp;
            // Remove matched begincast so we don't match it again
            begincasts.splice(matchIndex, 1);

            // Debug log for Mind Blast
            if (spellId === 8092) {
              const castTime = event.timestamp - actualCastStart;
              console.log(`MB: matched begincast at ${actualCastStart}, cast at ${event.timestamp}, duration: ${castTime}ms (${(castTime/1000).toFixed(2)}s)`);
            }
          } else if (spellId === 8092) {
            console.log(`MB: no begincast found in array (checked ${begincasts.length} begincasts)`);
          }
        } else if (spellId === 8092) {
          console.log(`MB: no begincasts for this spell`);
        }

        // Snapshot current active buffs
        const activeBuffs = this.getActiveBuffs();

        // Create CastDetails object with active buffs
        const cast = new CastDetails({
          spellId: spellId,
          name: spellData ? spellData.name : `Unknown (${spellId})`,
          rank: 0, // MoP has no spell ranks
          castStart: actualCastStart, // Use begincast timestamp if available
          castEnd: event.timestamp, // Cast finish time
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
          // For spells with cast time (direct damage casts)
          else if (spellData.baseCastTime > 0) {
            // If we don't have begincast (actualCastStart === event.timestamp),
            // calculate castEnd using base cast time
            if (actualCastStart === event.timestamp) {
              cast.castEnd = cast.castStart + (spellData.baseCastTime * 1000);
            }
            // Otherwise, castEnd is already set correctly from event.timestamp
          }
          // For instant direct damage (baseCastTime === 0), castEnd remains = castStart
          // This prevents damage event latency from affecting cast latency calculations

          cast.castTimeMs = cast.castEnd - cast.castStart;

          // Debug log final cast time for Mind Blast
          if (cast.spellId === 8092) {
            console.log(`MB final: castStart=${cast.castStart}, castEnd=${cast.castEnd}, castTimeMs=${cast.castTimeMs} (${(cast.castTimeMs/1000).toFixed(2)}s)`);
          }
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
   * Some spells have different spell IDs for cast vs damage (e.g., Halo, Cascade, Divine Star)
   */
  matchDamageInstances(castEvent, damageEvents) {
    const spellId = castEvent.abilityGameID;
    const castTime = castEvent.timestamp;
    const instances = [];

    // Mapping of cast spell IDs to their damage spell IDs
    const SPELL_DAMAGE_MAPPINGS = {
      120644: 120696, // Halo cast -> Halo damage
      127632: 127628, // Cascade cast -> Cascade damage
      122121: 122128, // Divine Star cast -> Divine Star damage
    };

    // Check if this spell has a different damage spell ID
    const damageSpellId = SPELL_DAMAGE_MAPPINGS[spellId] || spellId;

    // For instant casts and direct damage, match within 100ms window
    // For DoTs and channels, match within duration window
    // For AoE spells, use spell-specific max range windows:
    // - Halo: 30 yards max = 3000ms (1 yard per 100ms)
    // - Cascade: likely similar, use 5000ms for now
    // - Divine Star: likely similar, use 5000ms for now
    const spellData = getSpellData(spellId);
    const isDoT = spellData && spellData.damageType === DamageType.DOT;
    const isChannel = spellData && spellData.damageType === DamageType.CHANNEL;
    const isAoE = SPELL_DAMAGE_MAPPINGS[spellId] !== undefined; // Has separate damage ID = AoE

    let matchWindow;
    if (isDoT) {
      matchWindow = 30000;
    } else if (isChannel) {
      matchWindow = 5000;
    } else if (spellId === 120644) { // Halo
      matchWindow = 10000; // Generous window to catch delayed hits from large boss hitboxes
    } else if (isAoE) {
      matchWindow = 5000; // Cascade, Divine Star
    } else {
      matchWindow = 100; // Direct damage
    }

    for (const dmgEvent of damageEvents) {
      if (dmgEvent.abilityGameID !== damageSpellId) continue;

      // Always filter by source - only match damage from the same player who cast the spell
      if (dmgEvent.sourceID !== castEvent.sourceID) continue;

      // For AoE spells with no specific target, don't filter by target
      // (they hit multiple targets)
      if (!isAoE) {
        if (dmgEvent.targetID !== castEvent.targetID) continue;
        if (dmgEvent.targetInstance !== castEvent.targetInstance) continue;
      }

      const timeDiff = dmgEvent.timestamp - castTime;
      if (timeDiff >= 0 && timeDiff <= matchWindow) {
        // For AoE spells, pass castTime to calculate distance
        instances.push(new DamageInstance(dmgEvent, isAoE ? castTime : null));
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
      // Calculate base haste multiplier from rating
      const baseHastePercent = this.baseStats.hasteRating / HASTE_RATING_PER_PERCENT;
      const baseHasteMultiplier = 1 + (baseHastePercent / 100);

      for (const cast of this.casts) {
        // Start with base haste
        let hasteMultiplier = baseHasteMultiplier;
        let hasteBuffs = [];

        // Multiply haste from buffs active at cast time (haste is multiplicative!)
        if (cast.buffs && cast.buffs.length > 0) {
          for (const buff of cast.buffs) {
            if (buff.haste && buff.haste > 0) {
              // Buff haste is stored as decimal: 0.05 = 5%, 0.30 = 30%
              const oldMultiplier = hasteMultiplier;
              hasteMultiplier *= (1 + buff.haste);
              hasteBuffs.push(`${buff.name || 'Unknown'}: ${(buff.haste * 100).toFixed(1)}% (${oldMultiplier.toFixed(4)} → ${hasteMultiplier.toFixed(4)})`);
            }
            if (buff.hasteRating && buff.hasteRating > 0) {
              // Convert rating to % and multiply
              const buffHastePercent = buff.hasteRating / HASTE_RATING_PER_PERCENT;
              const oldMultiplier = hasteMultiplier;
              hasteMultiplier *= (1 + buffHastePercent / 100);
              hasteBuffs.push(`${buff.name || 'Unknown'}: ${buff.hasteRating} rating (${oldMultiplier.toFixed(4)} → ${hasteMultiplier.toFixed(4)})`);
            }
          }
        }

        cast.haste = hasteMultiplier;
      }
    } else {

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
   * Now also tracks wasted channel time (time since last tick when clipped)
   */
  calculateChannelMetrics() {
    const EARLY_CLIP_THRESHOLD = 0.67; // 67% to next tick
    const MF_INSANITY_ID = 129197;
    const MF_REGULAR_ID = 15407;
    const MOVEMENT_GAP_THRESHOLD = 1000; // 1 second = assume movement

    for (const cast of this.casts) {
      const spellData = getSpellData(cast.spellId);
      if (!spellData || spellData.damageType !== DamageType.CHANNEL) continue;

      // Calculate hasted channel duration and tick interval
      const hastedTickInterval = HasteUtils.calculateTickInterval(spellData, cast.haste) * 1000;
      const expectedDuration = spellData.maxDuration * 1000 / cast.haste; // Channels scale with haste

      const actualDuration = cast.castTimeMs;

      // Store tick interval for display
      cast.tickInterval = hastedTickInterval;

      // Check if this is Mind Flay
      const isMindFlay = (cast.spellId === MF_INSANITY_ID || cast.spellId === MF_REGULAR_ID);

      // For Mind Flay: Calculate tick time and wasted time
      if (isMindFlay && cast.instances && cast.instances.length > 0) {
        // Calculate time from cast start to first tick (for all MF casts)
        const firstTick = cast.instances[0];
        cast.timeToFirstTick = firstTick.timestamp - cast.castStart;
        cast.ticksReceived = cast.instances.length;

        // Calculate actual tick interval from damage events
        // Need at least 2 ticks to calculate interval
        if (cast.instances.length >= 2) {
          // Calculate average interval between consecutive ticks
          let totalInterval = 0;
          let validIntervals = 0;

          for (let i = 1; i < cast.instances.length; i++) {
            const interval = cast.instances[i].timestamp - cast.instances[i - 1].timestamp;
            // Filter out abnormally short intervals (< 100ms)
            // These are likely from MF → MF "attachment" mechanics
            if (interval >= 100) {
              totalInterval += interval;
              validIntervals++;
            }
          }

          // Only set tick interval if we have at least one valid interval
          if (validIntervals > 0) {
            cast.actualTickInterval = totalInterval / validIntervals;
          }
        }

        // Calculate wasted time when clipping to cast something else
        const nextCast = this.getNextCast(cast);

        if (nextCast) {
          // Check if we're transitioning to a non-Mind Flay spell
          const isTransitionToOther = nextCast.spellId !== MF_INSANITY_ID &&
                                       nextCast.spellId !== MF_REGULAR_ID;

          // Calculate gap between MF end and next cast start
          const gapToNextCast = nextCast.castStart - cast.castEnd;

          if (isTransitionToOther && gapToNextCast <= MOVEMENT_GAP_THRESHOLD) {
            // Get last tick timestamp
            const lastTick = cast.instances[cast.instances.length - 1];
            const lastTickTimestamp = lastTick.timestamp;

            // Calculate wasted time: time from last tick until next cast begins
            // (the channel effectively ends when we start the next spell)
            const wastedTime = nextCast.castStart - lastTickTimestamp;

            // Store wasted time
            cast.wastedChannelTime = wastedTime;

            // Set quality status based on wasted time
            // 200-299ms = warning, 300-999ms = error
            if (wastedTime >= 300) {
              cast.mfClipQuality = 'error';
            } else if (wastedTime >= 200) {
              cast.mfClipQuality = 'warning';
            } else {
              cast.mfClipQuality = 'good';
            }

            // Debug log
            console.log(`MF Clip: ${(cast.castStart / 1000).toFixed(1)}s, ticks: ${cast.instances.length}, ` +
                       `first tick: ${cast.timeToFirstTick.toFixed(0)}ms, ` +
                       `wasted: ${wastedTime.toFixed(0)}ms → ${nextCast.name}`);
          }
        }
      }

      // Check if we stopped early (existing logic)
      if (actualDuration < expectedDuration) {
        const lastTickTime = Math.floor(actualDuration / hastedTickInterval) * hastedTickInterval;
        const timeToNextTick = lastTickTime + hastedTickInterval - actualDuration;

        // If we were close to the next tick, flag as early clip
        if (timeToNextTick < hastedTickInterval * EARLY_CLIP_THRESHOLD) {
          // Check if this is an optimal MF clip for Insanity pandemic optimization
          const isInsanityOptimization = isMindFlay && this.isMindFlayInsanityOptimization(cast);

          // Check if we clipped to cast an optimal DoT refresh
          // (pandemic refresh OR Insanity preparation)
          const nextCast = this.getNextCast(cast);
          const isOptimalDotRefresh = nextCast &&
                                      nextCast.dotQuality &&
                                      nextCast.dotQuality.status === 'optimal';

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
   * Important: MB cooldown starts when the cast FINISHES (castEnd), not when it starts!
   */
  calculateCooldownMetrics() {
    const MIND_BLAST_ID = 8092;
    const MIND_BLAST_CD = 8000; // 8 second cooldown

    let lastMindBlastEnd = null;

    for (const cast of this.casts) {
      if (cast.spellId === MIND_BLAST_ID) {
        // Check if THIS Mind Blast was delayed
        if (lastMindBlastEnd !== null) {
          const timeSinceMB = cast.castStart - lastMindBlastEnd;
          const timeOffCooldown = timeSinceMB - MIND_BLAST_CD;

          if (timeOffCooldown > 0) {
            cast.timeOffCooldown = timeOffCooldown;
          }
        }

        // Cooldown starts when MB finishes casting (damage happens)
        lastMindBlastEnd = cast.castEnd;
        continue;
      }

      // For non-Mind Blast casts, check if MB was off cooldown
      if (lastMindBlastEnd !== null) {
        const timeSinceMB = cast.castStart - lastMindBlastEnd;
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

      // Store original castEnd times (when cast bar finished) for latency calculations
      const prevOriginalCastEnd = previous.castEnd;
      const currOriginalCastEnd = cast.castEnd;

      // Calculate when previous cast would have expired (without pandemic carryover)
      const previousDuration = spellData.maxDuration * 1000;
      const previousExpiry = previous.castStart + previousDuration;

      // ALWAYS clean up previous cast: remove ticks after it expired
      // (This applies regardless of pandemic or downtime)
      const prevOriginalCount = previous.instances.length;
      previous.instances = previous.instances.filter(inst => inst.timestamp <= previousExpiry);
      const prevRemovedCount = prevOriginalCount - previous.instances.length;

      // DON'T modify castEnd for DoTs - preserve when cast bar finished
      // (DoT ticks happen AFTER the cast, modifying castEnd breaks latency calculations)

      // Calculate pandemic carryover time
      const carryoverTime = previousExpiry - cast.castStart;

      if (carryoverTime > 0) {
        // This is a pandemic refresh - also clean up current cast

        // Clean up CURRENT cast: remove ticks before previous expiry
        const currentOriginalCount = cast.instances.length;
        cast.instances = cast.instances.filter(inst => inst.timestamp > previousExpiry);
        const currentRemovedCount = currentOriginalCount - cast.instances.length;

        // Store pandemic info for display
        cast.pandemicRefresh = true;
        cast.pandemicCarryover = carryoverTime;

        // DON'T modify castEnd - preserve original cast finish time
      }
    }
  }

  /**
   * Clean up Mind Flay damage instances to handle refresh mechanic
   *
   * Mind Flay has a unique "refresh" mechanic where casting it again
   * extends the channel instead of clipping it. This causes ticks
   * to be attributed to both the old and new casts.
   *
   * Solution: When a Mind Flay is refreshed, only count ticks that
   * happen BEFORE the next MF cast starts.
   */
  cleanupMindFlayDamageInstances() {
    const MF_SPELL_IDS = [15407, 129197]; // Mind Flay, Mind Flay: Insanity

    for (const cast of this.casts) {
      if (!MF_SPELL_IDS.includes(cast.spellId)) continue;

      // Find next Mind Flay cast on same target
      const nextMF = this.findNextMindFlayCast(cast);
      if (!nextMF) continue; // Last MF cast, no cleanup needed

      // Filter instances: only keep ticks that happened BEFORE the next MF started
      const originalCount = cast.instances.length;
      cast.instances = cast.instances.filter(inst => inst.timestamp < nextMF.castStart);
      const removedCount = originalCount - cast.instances.length;

      if (removedCount > 0) {
        // Recalculate castEnd based on filtered instances
        if (cast.instances.length > 0) {
          const lastInstance = cast.instances[cast.instances.length - 1];
          cast.castEnd = lastInstance.timestamp;
          cast.castTimeMs = cast.castEnd - cast.castStart;
        } else {
          // All ticks were after the refresh - use castStart as castEnd
          cast.castEnd = cast.castStart;
          cast.castTimeMs = 0;
        }
      }
    }
  }

  /**
   * Find next Mind Flay cast on same target
   */
  findNextMindFlayCast(cast) {
    const MF_SPELL_IDS = [15407, 129197];

    for (let i = this.casts.indexOf(cast) + 1; i < this.casts.length; i++) {
      const next = this.casts[i];

      if (MF_SPELL_IDS.includes(next.spellId) && next.hasSameTarget(cast)) {
        return next;
      }
    }
    return null;
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
   * Track Shadow Orbs throughout the fight
   * WCL doesn't provide resource events for MoP, so we manually track:
   * - Start: Assume 0 orbs after first DP cast (reset point)
   * - Mind Blast: +1 orb (always)
   * - Shadow Word: Death: +1 orb only if >= 9 seconds since last SW:D orb generation
   * - Devouring Plague: -3 orbs (consumes all)
   */
  trackShadowOrbs() {
    const MIND_BLAST_ID = 8092;
    const SHADOW_WORD_DEATH_ID = 32379;
    const DEVOURING_PLAGUE_ID = 2944;
    const SWD_COOLDOWN = 9000; // 9 second cooldown for orb generation

    let currentOrbs = 0;
    let lastSwdOrbGenTime = null; // Last time SW:D generated an orb
    let firstDpFound = false;
    let timeReached3Orbs = null; // When we reached 3 orbs (for delay tracking)

    console.log('=== TRACKING SHADOW ORBS ===');

    for (const cast of this.casts) {
      // Wait until first DP cast to start tracking
      if (!firstDpFound) {
        if (cast.spellId === DEVOURING_PLAGUE_ID) {
          firstDpFound = true;
          currentOrbs = 0; // Reset to 0 after first DP
          timeReached3Orbs = null;
          console.log(`Found first DP at ${(cast.castStart / 1000).toFixed(1)}s - starting orb tracking at 0`);
        }
        continue;
      }

      // Store orb count BEFORE this cast
      cast.orbsBeforeCast = currentOrbs;

      // Handle orb generation/consumption
      if (cast.spellId === MIND_BLAST_ID) {
        // Mind Blast always generates 1 orb
        currentOrbs = Math.min(3, currentOrbs + 1);
        console.log(`${(cast.castStart / 1000).toFixed(1)}s: Mind Blast +1 orb -> ${currentOrbs} orbs`);

        // Track when we reach 3 orbs
        if (currentOrbs === 3 && timeReached3Orbs === null) {
          timeReached3Orbs = cast.castEnd; // Use castEnd (when cast completes)
          console.log(`  -> Reached 3 orbs at ${(timeReached3Orbs / 1000).toFixed(1)}s`);
        }

      } else if (cast.spellId === SHADOW_WORD_DEATH_ID) {
        // SW:D generates 1 orb only if >= 9s since last orb generation
        const timeSinceLastSwd = lastSwdOrbGenTime ? (cast.castStart - lastSwdOrbGenTime) : Infinity;

        if (timeSinceLastSwd >= SWD_COOLDOWN) {
          // Generate orb
          currentOrbs = Math.min(3, currentOrbs + 1);
          lastSwdOrbGenTime = cast.castStart;
          console.log(`${(cast.castStart / 1000).toFixed(1)}s: SW:D +1 orb -> ${currentOrbs} orbs (${(timeSinceLastSwd / 1000).toFixed(1)}s since last)`);

          // Track when we reach 3 orbs
          if (currentOrbs === 3 && timeReached3Orbs === null) {
            timeReached3Orbs = cast.castEnd;
            console.log(`  -> Reached 3 orbs at ${(timeReached3Orbs / 1000).toFixed(1)}s`);
          }
        } else {
          // No orb generated (cast within 9s window)
          console.log(`${(cast.castStart / 1000).toFixed(1)}s: SW:D no orb (only ${(timeSinceLastSwd / 1000).toFixed(1)}s since last)`);
        }

      } else if (cast.spellId === DEVOURING_PLAGUE_ID) {
        // DP consumes all orbs (should be 3)
        cast.orbsConsumed = currentOrbs;

        // Track delay if we had 3 orbs
        if (currentOrbs === 3 && timeReached3Orbs !== null) {
          cast.delayAfter3Orbs = cast.castStart - timeReached3Orbs;
          console.log(`${(cast.castStart / 1000).toFixed(1)}s: DP cast with ${currentOrbs} orbs, delay: ${(cast.delayAfter3Orbs / 1000).toFixed(2)}s`);
        } else {
          console.log(`${(cast.castStart / 1000).toFixed(1)}s: DP cast with ${currentOrbs} orbs (suboptimal!)`);
        }

        currentOrbs = 0;
        timeReached3Orbs = null; // Reset after DP
      }

      // Store orb count AFTER this cast
      cast.orbsAfterCast = currentOrbs;
    }

    console.log('=== SHADOW ORBS TRACKING COMPLETE ===');
  }

  /**
   * Calculate Devouring Plague quality metrics based on orb count and timing
   * Thresholds:
   * - Cast with < 3 orbs: WARNING (DPS loss)
   * - Cast with 3 orbs, < 1s delay: OPTIMAL
   * - Cast with 3 orbs, 1-5s delay: NOTICE
   * - Cast with 3 orbs, > 5s delay: WARNING
   */
  calculateDevouringPlagueMetrics() {
    const DEVOURING_PLAGUE_ID = 2944;
    const DP_DURATION = 6000; // 6 seconds in milliseconds

    // Get fight end time from settings
    const fightEndTime = this.settings?.fightEndTime;

    for (const cast of this.casts) {
      if (cast.spellId !== DEVOURING_PLAGUE_ID) continue;

      // Skip if we don't have orb tracking data (before first DP)
      if (cast.orbsBeforeCast === undefined) continue;

      const orbCount = cast.orbsBeforeCast;

      // Initialize DP quality metrics
      cast.dpQuality = {
        orbCount: orbCount,
        orbsConsumed: cast.orbsConsumed || 0
      };

      // Check if this cast is near the end of the fight
      // If DP won't run its full duration, don't penalize the player
      const isEndOfFight = fightEndTime && (cast.castStart + DP_DURATION > fightEndTime);

      if (isEndOfFight) {
        // End-of-fight cast - don't apply quality penalties
        cast.dpQuality.status = 'optimal';
        cast.dpQuality.message = `Cast with ${orbCount} orb${orbCount !== 1 ? 's' : ''} (end of fight)`;
        cast.dpQuality.issue = null;
        cast.dpQuality.isEndOfFight = true;

      } else if (orbCount < 3) {
        // Cast with less than 3 orbs - always suboptimal
        cast.dpQuality.status = 'warning';
        cast.dpQuality.message = `Cast with only ${orbCount} orb${orbCount !== 1 ? 's' : ''} (should be 3)`;
        cast.dpQuality.issue = 'insufficient-orbs';

      } else if (orbCount === 3) {
        // Cast with 3 orbs - check delay
        if (cast.delayAfter3Orbs !== undefined) {
          const delaySeconds = cast.delayAfter3Orbs / 1000;

          if (delaySeconds < 1) {
            // Optimal: cast within 1 second
            cast.dpQuality.status = 'optimal';
            cast.dpQuality.message = `Cast with 3 orbs (${delaySeconds.toFixed(2)}s delay)`;
            cast.dpQuality.issue = null;

          } else if (delaySeconds <= 5) {
            // Notice: 1-5 second delay
            cast.dpQuality.status = 'notice';
            cast.dpQuality.message = `${delaySeconds.toFixed(1)}s delay after reaching 3 orbs`;
            cast.dpQuality.issue = 'delayed-cast';

          } else {
            // Warning: > 5 second delay
            cast.dpQuality.status = 'warning';
            cast.dpQuality.message = `${delaySeconds.toFixed(1)}s delay after reaching 3 orbs (too long)`;
            cast.dpQuality.issue = 'major-delay';
          }

          cast.dpQuality.delay = delaySeconds;

        } else {
          // We had 3 orbs but no delay tracking (edge case)
          cast.dpQuality.status = 'optimal';
          cast.dpQuality.message = 'Cast with 3 orbs';
          cast.dpQuality.issue = null;
        }
      }
    }
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
