/**
 * Benchmark Data Loader
 * Loads and caches benchmark data for comparison with user logs
 */

class BenchmarkLoader {
  constructor() {
    this.baseUrl = 'analyzer/benchmarks/';
    this.indexCache = null;
    this.benchmarkCache = new Map();
  }

  /**
   * Load the benchmark index
   * @returns {Promise<Object>} Index with metadata about all benchmarks
   */
  async loadIndex() {
    if (this.indexCache) {
      return this.indexCache;
    }

    try {
      const response = await fetch(this.baseUrl + 'index.json');
      if (!response.ok) {
        throw new Error(`Failed to load benchmark index: ${response.status}`);
      }

      this.indexCache = await response.json();
      return this.indexCache;
    } catch (error) {
      console.error('Error loading benchmark index:', error);
      return { lastUpdated: null, benchmarks: [] };
    }
  }

  /**
   * Load a specific benchmark by encounter, difficulty, and raid size
   * @param {number} encounterID - WCL encounter ID
   * @param {number} difficulty - Difficulty level (3 = Normal, 4 = Heroic)
   * @param {number} size - Raid size (10 or 25)
   * @returns {Promise<Object|null>} Benchmark data or null if not found
   */
  async loadBenchmark(encounterID, difficulty, size) {
    const cacheKey = `${encounterID}-${difficulty}-${size}`;

    // Check cache first
    if (this.benchmarkCache.has(cacheKey)) {
      return this.benchmarkCache.get(cacheKey);
    }

    try {
      const filename = `${encounterID}-${difficulty}-${size}.json`;
      const response = await fetch(this.baseUrl + filename);

      if (!response.ok) {
        // Benchmark doesn't exist - this is expected if not configured
        return null;
      }

      const benchmarkData = await response.json();
      this.benchmarkCache.set(cacheKey, benchmarkData);
      return benchmarkData;
    } catch (error) {
      console.error(`Error loading benchmark ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Unpack WCL encounter ID to get journal encounter ID
   * WCL adds 50000 to the journal encounter ID
   * Example: 51565 = 50000 + 1565 (Tortos journal ID)
   *          51577 = 50000 + 1577 (Jin'rokh journal ID)
   *
   * The journal encounter ID matches:
   * - JournalEncounterID in WoW game data
   * - Boss icon URLs: https://assets.rpglogs.com/img/warcraft/bosses/{journalID}-icon.jpg
   * - Wowpedia/Wago.tools database entries
   *
   * Difficulty and raid size are provided separately in the fight object,
   * NOT encoded in the encounterID.
   */
  unpackEncounterID(packedID) {
    // For packed IDs > 50000, subtract 50000 to get journal ID
    if (packedID > 50000) {
      const journalEncounterID = packedID - 50000;
      return {
        baseEncounterID: journalEncounterID,
        journalEncounterID: journalEncounterID,
        difficulty: null // Provided separately in fight object
      };
    }

    // Already unpacked - return as-is
    return {
      baseEncounterID: packedID,
      journalEncounterID: packedID,
      difficulty: null
    };
  }

  /**
   * Get benchmark for current fight if available
   * @param {Object} fight - Fight object with encounterID, difficulty, and size
   * @returns {Promise<Object|null>} Benchmark data or null
   */
  async getBenchmarkForFight(fight) {
    if (!fight?.encounterID) {
      return null;
    }

    // Unpack the encounter ID if needed
    const { baseEncounterID, difficulty: extractedDifficulty } = this.unpackEncounterID(fight.encounterID);

    // Use difficulty from fight object, or fall back to extracted difficulty
    const difficulty = fight.difficulty || extractedDifficulty;

    if (!difficulty) {
      console.warn('Could not determine difficulty for benchmark lookup', fight);
      return null;
    }

    // Get raid size from fight object (defaults to 25 if not specified)
    const size = fight.size || 25;

    console.log(`Benchmark lookup: encounterID=${baseEncounterID}, difficulty=${difficulty}, size=${size} (original=${fight.encounterID})`);
    return await this.loadBenchmark(baseEncounterID, difficulty, size);
  }

  /**
   * Get benchmark for current fight if available (OLD VERSION - DEPRECATED)
   * @param {Object} fight - Fight object with encounterID and difficulty
   * @returns {Promise<Object|null>} Benchmark data or null
   */
  async getBenchmarkForFight_OLD(fight) {
    if (!fight?.encounterID || !fight?.difficulty) {
      return null;
    }

    return await this.loadBenchmark(fight.encounterID, fight.difficulty);
  }

  /**
   * Get all available benchmarks
   * @returns {Promise<Array>} Array of benchmark metadata
   */
  async getAvailableBenchmarks() {
    const index = await this.loadIndex();
    return index.benchmarks || [];
  }

  /**
   * Check if benchmark exists for encounter/difficulty
   * @param {number} encounterID - WCL encounter ID
   * @param {number} difficulty - Difficulty level
   * @returns {Promise<boolean>} True if benchmark exists
   */
  async hasBenchmark(encounterID, difficulty) {
    const index = await this.loadIndex();
    return index.benchmarks.some(
      b => b.encounterID === encounterID && b.difficulty === difficulty
    );
  }

  /**
   * Clear all caches (useful for testing/refreshing)
   */
  clearCache() {
    this.indexCache = null;
    this.benchmarkCache.clear();
  }

  /**
   * Compare user metrics to benchmark
   * @param {Object} userMetrics - User's metrics from analyzer
   * @param {Object} benchmark - Benchmark data
   * @returns {Object} Comparison results
   */
  compareToBenchmark(userMetrics, benchmark) {
    if (!benchmark || !benchmark.metrics) {
      return null;
    }

    const comparison = {
      mindBlast: this.compareSpell(
        userMetrics.mindBlast,
        benchmark.metrics.mindBlast,
        'Mind Blast'
      ),
      devouringPlague: this.compareSpell(
        userMetrics.devouringPlague,
        benchmark.metrics.devouringPlague,
        'Devouring Plague'
      ),
      vampiricTouch: this.compareSpell(
        userMetrics.vampiricTouch,
        benchmark.metrics.vampiricTouch,
        'Vampiric Touch'
      ),
      shadowWordPain: this.compareSpell(
        userMetrics.shadowWordPain,
        benchmark.metrics.shadowWordPain,
        'Shadow Word: Pain'
      )
    };

    return comparison;
  }

  /**
   * Compare individual spell metrics
   * @private
   */
  compareSpell(userMetric, benchmarkMetric, spellName) {
    if (!userMetric || !benchmarkMetric) {
      return null;
    }

    const result = {
      spellName,
      user: userMetric,
      benchmark: benchmarkMetric,
      differences: {}
    };

    // Compare casts
    if (userMetric.casts !== undefined && benchmarkMetric.casts !== undefined) {
      const diff = userMetric.casts - benchmarkMetric.casts;
      const percentDiff = (diff / benchmarkMetric.casts) * 100;
      result.differences.casts = {
        absolute: diff,
        percent: percentDiff.toFixed(1)
      };
    }

    // Compare casts per minute (if available)
    if (userMetric.castsPerMinute !== undefined && benchmarkMetric.castsPerMinute !== undefined) {
      const diff = parseFloat(userMetric.castsPerMinute) - parseFloat(benchmarkMetric.castsPerMinute);
      const percentDiff = (diff / parseFloat(benchmarkMetric.castsPerMinute)) * 100;
      result.differences.castsPerMinute = {
        absolute: diff.toFixed(2),
        percent: percentDiff.toFixed(1)
      };
    }

    return result;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.BenchmarkLoader = BenchmarkLoader;
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BenchmarkLoader };
}
