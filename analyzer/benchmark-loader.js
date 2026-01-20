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
   * Load a specific benchmark by encounter and difficulty
   * @param {number} encounterID - WCL encounter ID
   * @param {number} difficulty - Difficulty level (3-6)
   * @returns {Promise<Object|null>} Benchmark data or null if not found
   */
  async loadBenchmark(encounterID, difficulty) {
    const cacheKey = `${encounterID}-${difficulty}`;

    // Check cache first
    if (this.benchmarkCache.has(cacheKey)) {
      return this.benchmarkCache.get(cacheKey);
    }

    try {
      const filename = `${encounterID}-${difficulty}.json`;
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
   * Get benchmark for current fight if available
   * @param {Object} fight - Fight object with encounterID and difficulty
   * @returns {Promise<Object|null>} Benchmark data or null
   */
  async getBenchmarkForFight(fight) {
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
