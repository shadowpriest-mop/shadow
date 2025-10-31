// MoP Haste Calculations (Level 90)
// Based on Wrath analyzer architecture, adapted for MoP haste mechanics

const HASTE_RATING_PER_PERCENT = 425.25; // Level 90 conversion factor
const BASE_GCD = 1.5;
const MIN_GCD = 1.0;
const ERROR_THRESHOLD = 0.2; // Ignore haste errors > 20% (likely spell pushback or untracked debuffs)

/**
 * Calculate total haste from base stats and active buffs
 * @param {Object} baseStats - Player's base stats (hasteRating from gear)
 * @param {Array} activeBuffs - Array of active buff objects
 * @returns {Object} Haste stats object
 */
function calculateHaste(baseStats, activeBuffs = []) {
  // Step 1: Calculate haste rating (additive)
  // Combine haste rating from gear + trinket procs + enchants
  const hasteRating = activeBuffs.reduce((total, buff) => {
    return total + (buff.hasteRating || 0);
  }, baseStats.hasteRating || 0);

  // Step 2: Calculate haste percent from buffs (multiplicative)
  // Buffs like Bloodlust, PI, Shadowform stack multiplicatively
  // Only include buffs that aren't suppressed by non-stacking rules
  const hastePercent = activeBuffs.reduce((multiplier, buff) => {
    // Check if this buff should be included (handle non-stacking buffs)
    if (shouldIncludeBuff(buff, activeBuffs)) {
      return multiplier * (1 + (buff.haste || 0));
    }
    return multiplier;
  }, 1);

  // Step 3: Calculate total haste
  // Formula: totalHaste = hastePercent × (1 + hasteRating / RATING_FACTOR / 100)
  const hasteFromRating = 1 + (hasteRating / HASTE_RATING_PER_PERCENT / 100);
  const totalHaste = hastePercent * hasteFromRating;

  // Step 4: Calculate GCD with 1.0s floor
  const gcd = Math.max(BASE_GCD / totalHaste, MIN_GCD);

  return {
    hasteRating,
    hastePercent,
    totalHaste,
    gcd
  };
}

/**
 * Check if a buff should be included in haste calculations
 * Handles non-stacking buffs (Bloodlust vs PI, etc.)
 */
function shouldIncludeBuff(buff, activeBuffs) {
  if (!buff.doesNotStackWith || buff.doesNotStackWith.length === 0) {
    return true;
  }

  // Check if any conflicting buffs are active
  for (const conflictingId of buff.doesNotStackWith) {
    const conflictingBuff = activeBuffs.find(b => b.id === conflictingId);
    if (conflictingBuff && shouldYieldPriority(buff, conflictingBuff, activeBuffs)) {
      return false;
    }
  }

  return true;
}

/**
 * Determine if buff should yield to another buff
 * Yields if other has larger haste, or if equal haste, other came first
 */
function shouldYieldPriority(buff, other, activeBuffs) {
  if (other.haste > buff.haste) {
    return true;
  }

  if (other.haste === buff.haste) {
    return activeBuffs.findIndex(b => b.id === other.id) < activeBuffs.findIndex(b => b.id === buff.id);
  }

  return false;
}

/**
 * Calculate expected cast time for a spell with given haste
 * @param {number} baseCastTime - Base cast time in seconds
 * @param {number} totalHaste - Total haste multiplier (e.g., 1.26 for 26% haste)
 * @returns {number} Expected cast time in seconds
 */
function calculateCastTime(baseCastTime, totalHaste) {
  return baseCastTime / totalHaste;
}

/**
 * Calculate DoT duration with haste snapshotting
 * @param {Object} spellData - Spell data object
 * @param {number} totalHaste - Total haste at cast completion
 * @returns {number} Hasted duration in seconds
 */
function calculateDotDuration(spellData, totalHaste) {
  if (!spellData.dotHaste) {
    return spellData.maxDuration; // Non-hasted DoTs (like SW:P in MoP)
  }

  return spellData.maxDuration / totalHaste;
}

/**
 * Calculate tick interval for DoT with haste
 * @param {Object} spellData - Spell data object
 * @param {number} totalHaste - Total haste at cast completion
 * @returns {number} Tick interval in seconds
 */
function calculateTickInterval(spellData, totalHaste) {
  if (!spellData.dotHaste) {
    return spellData.baseTickTime;
  }

  return spellData.baseTickTime / totalHaste;
}

/**
 * Infer haste rating from actual cast time (for missing combatant data)
 * @param {number} hastePercent - Known haste percent from buffs
 * @param {number} baseCastTime - Expected base cast time
 * @param {number} actualCastTime - Actual cast time from logs
 * @returns {number} Inferred haste rating
 */
function inferHasteRating(hastePercent, baseCastTime, actualCastTime) {
  // Solve for haste from rating
  const hasteFromRating = baseCastTime / (hastePercent * actualCastTime);

  // If answer doesn't make sense, it's probably server variance
  if (hasteFromRating < 0) {
    return 0;
  }

  // Convert from percent to rating
  return (hasteFromRating - 1) * 100 * HASTE_RATING_PER_PERCENT;
}

/**
 * Get haste error between expected and actual cast time
 * Used to detect missing buffs or issues in log data
 * @param {Object} cast - Cast details object
 * @param {Object} spellData - Spell data object
 * @returns {number} Error ratio (0.1 = 10% error)
 */
function getHasteError(cast, spellData) {
  let actualDelta, baseDelta;

  switch (spellData.damageType) {
    case 3: // CHANNEL
      if (cast.instances.length === 0) return 0;
      actualDelta = cast.instances[0].timestamp - cast.castEnd;
      baseDelta = spellData.maxDuration / spellData.maxTicks;
      break;

    case 2: // DOT
      if (cast.instances.length > 1) {
        actualDelta = cast.instances[cast.instances.length - 1].timestamp -
                     cast.instances[cast.instances.length - 2].timestamp;
        baseDelta = spellData.baseTickTime;
        break;
      }
      // Fall through to default for <2 ticks

    default:
      actualDelta = cast.castTimeMs;
      baseDelta = spellData.baseCastTime;
      break;
  }

  const expectedDelta = calculateCastTime(baseDelta * 1000, cast.haste);
  return (expectedDelta - actualDelta) / actualDelta;
}

/**
 * Can haste be inferred from this cast's log data?
 * Requires either a cast time, or DoT/channel with at least one tick
 */
function canInferHaste(cast, spellData) {
  if (cast.castTimeMs > 500) {
    return true;
  }

  if (spellData.damageType === 3 && cast.instances.length > 0) { // CHANNEL
    return true;
  }

  if (spellData.damageType === 2 && spellData.dotHaste && cast.instances.length > 1) { // DOT
    return true;
  }

  return false;
}

// Export for use in other modules
// Browser globals
if (typeof window !== 'undefined') {
  window.HasteUtils = {
    HASTE_RATING_PER_PERCENT,
    BASE_GCD,
    MIN_GCD,
    ERROR_THRESHOLD,
    calculateHaste,
    calculateCastTime,
    calculateDotDuration,
    calculateTickInterval,
    inferHasteRating,
    getHasteError,
    canInferHaste
  };
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HASTE_RATING_PER_PERCENT,
    BASE_GCD,
    MIN_GCD,
    ERROR_THRESHOLD,
    calculateHaste,
    calculateCastTime,
    calculateDotDuration,
    calculateTickInterval,
    inferHasteRating,
    getHasteError,
    canInferHaste
  };
}
