/**
 * WarcraftLogs Benchmark Scraper
 * Fetches top performer data for encounter-specific benchmarks
 *
 * Usage:
 *   node benchmark-scraper.js <encounterID> <difficulty> <rank>  - Fetch single benchmark
 *   node benchmark-scraper.js --auto                             - Fetch all configured benchmarks
 *
 * Example: node benchmark-scraper.js 1525 6 1
 */

const fs = require('fs');
const path = require('path');

// Benchmark configuration - these will be auto-scraped weekly
// Uses median of ranks 51-100 for realistic comparison
// NOTE: Use PACKED encounter IDs (50000 + difficulty*10 + base)
const BENCHMARK_CONFIG = [
  {
    encounterID: 51565,   // Tortos Heroic 25 (packed: 50000 + 60 + 1505)
    encounterName: 'Tortos',
    difficulty: 6,        // Heroic 25
    difficultyName: 'Heroic 25',
    rankStart: 51,
    rankEnd: 100
  }
];

// Use the same credentials as wcl-v2-service.js
const WCL_CLIENT_ID = 'a036e79f-2e07-4588-bc67-d46cd2f907f8';
const WCL_CLIENT_SECRET = '2j26APf8DGSppFDstkqJ8H2hCaC74YWc4GWpapEg';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client';

// Store access token
let accessToken = null;
let tokenExpiry = null;

// Date range for Throne of Thunder Classic content
// Classic ToT released December 11, 2025 - SoO not yet released
const TOT_START_DATE = 1733875200000; // December 11, 2025
const TOT_END_DATE = null;   // No end date yet (SoO not released)

// WCL API v2 GraphQL query to fetch ranking data
// Based on official API: zone → encounters → characterRankings
// Zone 1046 = Throne of Thunder
const RANKING_QUERY = `
query GetRankingData($difficulty: Int!, $page: Int!) {
  worldData {
    zone(id: 1046) {
      encounters {
        id
        characterRankings(
          difficulty: $difficulty
          page: $page
          partition: 1
          className: "Priest"
          specName: "Shadow"
          metric: dps
        )
      }
    }
  }
}
`;

// More detailed query to fetch actual log data once we have the report ID
const REPORT_QUERY = `
query GetReportData($reportID: String!, $fightID: Int!, $sourceID: Int!) {
  reportData {
    report(code: $reportID) {
      startTime
      endTime

      # Get fight info
      fights(fightIDs: [$fightID]) {
        id
        startTime
        endTime
        encounterID
        difficulty
        kill
      }

      # Get cast events for key spells
      events(
        fightIDs: [$fightID]
        sourceID: $sourceID
        dataType: Casts
        limit: 10000
      ) {
        data
        nextPageTimestamp
      }

      # Get damage events for orb tracking
      damageEvents: events(
        fightIDs: [$fightID]
        sourceID: $sourceID
        dataType: DamageDone
        limit: 10000
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}
`;

/**
 * Get access token using OAuth2 client credentials flow
 */
async function getAccessToken() {
  // Return existing token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return accessToken;
  }

  console.log('Fetching new access token...');

  const credentials = Buffer.from(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(WCL_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('✓ Access token obtained');
  return accessToken;
}

/**
 * Fetch rankings from WCL API
 */
async function fetchRankings(encounterID, difficulty, page = 1) {
  const token = await getAccessToken();

  try {
    const response = await fetch(WCL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: RANKING_QUERY,
        variables: {
          difficulty,
          page
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching rankings:', error);
    throw error;
  }
}

/**
 * Fetch detailed report data
 */
async function fetchReportData(reportID, fightID, sourceID) {
  const token = await getAccessToken();

  try {
    const response = await fetch(WCL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: REPORT_QUERY,
        variables: {
          reportID,
          fightID,
          sourceID
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching report data:', error);
    throw error;
  }
}

/**
 * Calculate median value from array of numbers
 */
function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate median metrics from multiple reports
 */
function calculateMedianMetrics(allMetrics) {
  const mbCasts = allMetrics.map(m => m.metrics.mindBlast.casts);
  const dpCasts = allMetrics.map(m => m.metrics.devouringPlague.casts);
  const vtCasts = allMetrics.map(m => m.metrics.vampiricTouch.casts);
  const swpCasts = allMetrics.map(m => m.metrics.shadowWordPain.casts);
  const durations = allMetrics.map(m => m.fightDuration);

  const medianDuration = calculateMedian(durations);

  return {
    fightDuration: medianDuration,
    metrics: {
      mindBlast: {
        casts: Math.round(calculateMedian(mbCasts)),
        castsPerMinute: ((calculateMedian(mbCasts) / medianDuration) * 60).toFixed(2)
      },
      devouringPlague: {
        casts: Math.round(calculateMedian(dpCasts))
      },
      vampiricTouch: {
        casts: Math.round(calculateMedian(vtCasts))
      },
      shadowWordPain: {
        casts: Math.round(calculateMedian(swpCasts))
      }
    },
    sampleSize: allMetrics.length
  };
}

/**
 * Extract key metrics from report data
 */
function extractMetrics(reportData) {
  const fight = reportData.reportData.report.fights[0];
  const castEvents = reportData.reportData.report.events.data;
  const damageEvents = reportData.reportData.report.damageEvents.data;

  const fightDuration = (fight.endTime - fight.startTime) / 1000; // seconds

  // Count key spell casts
  const mbCasts = castEvents.filter(e => e.ability?.guid === 8092).length;
  const dpCasts = castEvents.filter(e => e.ability?.guid === 2944).length;
  const vtCasts = castEvents.filter(e => e.ability?.guid === 34914).length;
  const swpCasts = castEvents.filter(e => e.ability?.guid === 589).length;

  // Calculate casts per minute
  const mbCPM = (mbCasts / fightDuration) * 60;

  // TODO: Calculate DoT uptime (requires tracking buff applications/removals)
  // TODO: Calculate DP orb efficiency (requires damage coefficient analysis)
  // TODO: Calculate active time % (requires tracking GCDs)

  return {
    fightDuration,
    metrics: {
      mindBlast: {
        casts: mbCasts,
        castsPerMinute: mbCPM.toFixed(2)
      },
      devouringPlague: {
        casts: dpCasts
      },
      vampiricTouch: {
        casts: vtCasts
      },
      shadowWordPain: {
        casts: swpCasts
      }
    },
    rawDataSize: {
      castEvents: castEvents.length,
      damageEvents: damageEvents.length,
      estimatedBytes: JSON.stringify(reportData).length
    }
  };
}

/**
 * Unpack encounter ID to get base ID
 * Packed format: 50000 + (difficulty * 10) + baseEncounterID
 */
function unpackEncounterID(packedID) {
  if (packedID > 50000) {
    const offset = packedID - 50000;
    const difficulty = Math.floor(offset / 10);
    const baseID = offset % 10;
    // Actually the formula should be reversed
    // Try each difficulty from 6 down to 3
    for (let diff = 6; diff >= 3; diff--) {
      const candidateBase = offset - (diff * 10);
      if (candidateBase >= 1490 && candidateBase <= 1600) {
        return candidateBase;
      }
    }
  }
  return packedID;
}

/**
 * Save benchmark data to JSON file
 */
function saveBenchmarkData(benchmarkData, encounterID, difficulty) {
  const benchmarksDir = path.join(__dirname, '..', 'analyzer', 'benchmarks');

  // Create directory if it doesn't exist
  if (!fs.existsSync(benchmarksDir)) {
    fs.mkdirSync(benchmarksDir, { recursive: true });
  }

  // Unpack encounter ID if needed (use base ID for filename)
  const baseEncounterID = unpackEncounterID(encounterID);

  // Save individual benchmark file
  const filename = `${baseEncounterID}-${difficulty}.json`;
  const filepath = path.join(benchmarksDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(benchmarkData, null, 2));
  console.log(`✓ Saved to ${filepath}`);

  // Update index file (use base ID)
  updateBenchmarkIndex(benchmarksDir, benchmarkData, baseEncounterID, difficulty);
}

/**
 * Update benchmark index file with metadata
 */
function updateBenchmarkIndex(benchmarksDir, benchmarkData, encounterID, difficulty) {
  const indexPath = path.join(benchmarksDir, 'index.json');

  // Load existing index or create new one
  let index = { lastUpdated: null, benchmarks: [] };
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  // Remove old entry for this encounter/difficulty if it exists
  index.benchmarks = index.benchmarks.filter(
    b => !(b.encounterID === encounterID && b.difficulty === difficulty)
  );

  // Add new entry
  index.benchmarks.push({
    encounterID,
    encounterName: benchmarkData.encounterName,
    difficulty,
    difficultyName: benchmarkData.difficultyName,
    type: benchmarkData.type || 'median',
    rankRange: benchmarkData.rankRange,
    sampleSize: benchmarkData.sampleSize,
    lastUpdated: benchmarkData.lastUpdated,
    filename: `${encounterID}-${difficulty}.json`
  });

  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`✓ Updated index.json`);
}

/**
 * Fetch and save benchmark (median of ranks 51-100)
 */
async function fetchAndSaveBenchmark(encounterID, encounterName, difficulty, difficultyName, rankStart, rankEnd) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fetching: ${encounterName} (${difficultyName})`);
  console.log(`Ranks: ${rankStart}-${rankEnd} (calculating median)`);
  console.log('='.repeat(60));

  // Step 1: Fetch rankings
  console.log('Step 1: Fetching rankings...');

  // Fetch page 1 (WCL returns 100+ rankings per page)
  const rankingsData = await fetchRankings(encounterID, difficulty, 1);

  if (!rankingsData?.worldData?.zone?.encounters) {
    console.error(`❌ No encounter data found!`);
    console.log('DEBUG: Response structure:', JSON.stringify(rankingsData).substring(0, 500));
    return null;
  }

  // Find our specific encounter from the list
  const encounters = rankingsData.worldData.zone.encounters;
  const ourEncounter = encounters.find(enc => enc.id === encounterID);

  if (!ourEncounter || !ourEncounter.characterRankings) {
    console.error(`❌ No rankings found for encounter ${encounterID}!`);
    console.log('DEBUG: Available encounters:', encounters.map(e => e.id));
    return null;
  }

  // characterRankings returns raw JSON, so we parse it
  const rankingsJson = ourEncounter.characterRankings;
  console.log('DEBUG: Type of characterRankings:', typeof rankingsJson);
  console.log('DEBUG: Raw characterRankings (first 500 chars):', JSON.stringify(rankingsJson).substring(0, 500));
  const allRankings = rankingsJson.rankings || [];
  console.log(`✓ Found ${allRankings.length} total rankings`);

  // Extract only the ranks we want (e.g., 51-100)
  // Array is 0-indexed, so rank 51 is at index 50
  const startIndex = rankStart - 1;
  const endIndex = rankEnd;
  const targetRankings = allRankings.slice(startIndex, endIndex);

  if (targetRankings.length === 0) {
    console.error(`❌ No rankings found in range ${rankStart}-${rankEnd}!`);
    return null;
  }

  console.log(`✓ Found ${targetRankings.length} rankings`);

  // Step 2: Fetch detailed report data for each ranking
  console.log('Step 2: Fetching report data for all rankings...');
  const allMetrics = [];
  let fetchedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < targetRankings.length; i++) {
    const ranking = targetRankings[i];
    const currentRank = rankStart + i;

    try {
      process.stdout.write(`  Fetching rank #${currentRank} (${i + 1}/${targetRankings.length})...`);

      const reportData = await fetchReportData(
        ranking.report.code,
        ranking.report.fightID,
        ranking.sourceID
      );

      const metrics = extractMetrics(reportData);
      allMetrics.push(metrics);
      fetchedCount++;
      console.log(' ✓');

      // Small delay between requests to be polite to WCL API
      if (i < targetRankings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.log(` ❌ Failed: ${error.message}`);
      failedCount++;
      // Continue with other rankings even if one fails
    }
  }

  if (allMetrics.length === 0) {
    console.error('❌ Failed to fetch any report data!');
    return null;
  }

  console.log(`✓ Successfully fetched ${fetchedCount} reports (${failedCount} failed)`);

  // Step 3: Calculate median metrics
  console.log('Step 3: Calculating median metrics...');
  const medianMetrics = calculateMedianMetrics(allMetrics);

  // Step 4: Build benchmark data structure
  // Use base encounter ID (unpacked) for consistency with loader
  const baseEncounterID = unpackEncounterID(encounterID);
  const benchmarkData = {
    encounterID: baseEncounterID,
    encounterName,
    difficulty,
    difficultyName,
    rankRange: { start: rankStart, end: rankEnd },
    type: 'median',
    lastUpdated: new Date().toISOString(),
    sampleSize: allMetrics.length,
    fightDuration: medianMetrics.fightDuration,
    metrics: medianMetrics.metrics
  };

  console.log('✓ Median metrics calculated');
  console.log(`  Sample size: ${allMetrics.length} logs`);
  console.log(`  Median fight duration: ${medianMetrics.fightDuration.toFixed(1)}s`);

  return benchmarkData;
}

/**
 * Auto mode - fetch all configured benchmarks
 */
async function autoFetchAll() {
  console.log('🤖 AUTO MODE: Fetching all configured benchmarks');
  console.log(`Found ${BENCHMARK_CONFIG.length} benchmark(s) to fetch\n`);

  const results = [];

  for (const config of BENCHMARK_CONFIG) {
    try {
      const benchmarkData = await fetchAndSaveBenchmark(
        config.encounterID,
        config.encounterName,
        config.difficulty,
        config.difficultyName,
        config.rankStart,
        config.rankEnd
      );

      if (benchmarkData) {
        saveBenchmarkData(benchmarkData, config.encounterID, config.difficulty);
        results.push({ success: true, config });
      } else {
        results.push({ success: false, config, error: 'Failed to fetch data' });
      }

      // Small delay between requests to be polite to WCL API
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Error fetching ${config.encounterName}:`, error.message);
      results.push({ success: false, config, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const successful = results.filter(r => r.success).length;
  console.log(`✓ ${successful}/${results.length} benchmarks fetched successfully`);

  if (successful < results.length) {
    console.log('\n❌ Failed:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.config.encounterName} (${r.config.difficultyName}): ${r.error}`);
    });
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Auto mode - fetch all configured benchmarks
  if (args[0] === '--auto') {
    await autoFetchAll();
    return;
  }

  // Manual mode - fetch rank range
  if (args.length < 4) {
    console.log('Usage:');
    console.log('  node benchmark-scraper.js <encounterID> <difficulty> <rankStart> <rankEnd>  - Manual mode');
    console.log('  node benchmark-scraper.js --auto                                            - Auto fetch all');
    console.log('');
    console.log('Example: node benchmark-scraper.js 1505 6 51 100');
    console.log('  1505 = Tortos (WCL Classic ID)');
    console.log('  6 = Heroic 25 (3 = Normal 10, 4 = Heroic 10, 5 = Normal 25, 6 = Heroic 25)');
    console.log('  51 100 = Ranks 51-100 (for median calculation)');
    console.log('');
    console.log('Throne of Thunder Encounter IDs (WCL Classic):');
    console.log('  1517 = Jin\'rokh the Breaker');
    console.log('  1515 = Horridon');
    console.log('  1510 = Council of Elders');
    console.log('  1505 = Tortos');
    console.log('  1518 = Megaera');
    console.log('  1513 = Ji-Kun');
    console.log('  1512 = Durumu the Forgotten');
    console.log('  1514 = Primordius');
    console.log('  1516 = Dark Animus');
    console.log('  1499 = Iron Qon');
    console.log('  1500 = Twin Empyreans');
    console.log('  1519 = Lei Shen');
    console.log('  1520 = Ra-den');
    process.exit(0);
  }

  const encounterID = parseInt(args[0]);
  const difficulty = parseInt(args[1]);
  const rankStart = parseInt(args[2]);
  const rankEnd = parseInt(args[3]);

  const benchmarkData = await fetchAndSaveBenchmark(
    encounterID,
    'Custom',
    difficulty,
    `Difficulty ${difficulty}`,
    rankStart,
    rankEnd
  );

  if (!benchmarkData) {
    console.error('❌ Failed to fetch benchmark data');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Benchmark Data:');
  console.log('='.repeat(60));
  console.log(JSON.stringify(benchmarkData, null, 2));
  console.log('');

  // Optionally save
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Save this benchmark? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      saveBenchmarkData(benchmarkData, encounterID, difficulty);
      console.log('✓ Saved!');
    } else {
      console.log('Not saved.');
    }
    readline.close();
  });
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchRankings, fetchReportData, extractMetrics };
