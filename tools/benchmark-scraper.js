/**
 * WarcraftLogs Benchmark Scraper
 * Fetches Shadow Priest performance benchmarks from top-tier players
 *
 * Usage:
 *   node benchmark-scraper.js --auto                                            - Fetch all configured benchmarks
 *   node benchmark-scraper.js <encounterID> <difficulty> <rankStart> <rankEnd>  - Manual single benchmark
 *
 * Example: node benchmark-scraper.js 51565 4 51 100
 */

const fs = require('fs');
const path = require('path');

// Benchmark configuration - add more bosses here
// Uses median of ranks 51-100 to avoid parse-padding cheese while still representing strong play
const BENCHMARK_CONFIG = [
  {
    encounterID: 51565,   // Tortos
    encounterName: 'Tortos',
    difficulty: 4,        // 3 = Normal, 4 = Heroic
    size: 25,             // Raid size: 10 or 25
    difficultyName: 'Heroic 25',
    rankStart: 51,
    rankEnd: 100
  }
  // Add more bosses here as needed
];

// WarcraftLogs API credentials
const WCL_CLIENT_ID = process.env.WCL_CLIENT_ID || 'a036e79f-2e07-4588-bc67-d46cd2f907f8';
const WCL_CLIENT_SECRET = process.env.WCL_CLIENT_SECRET || '2j26APf8DGSppFDstkqJ8H2hCaC74YWc4GWpapEg';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client';

// Access token cache
let accessToken = null;
let tokenExpiry = null;

// GraphQL query to fetch Shadow Priest rankings
const RANKING_QUERY = `
query GetRankingData($encounterID: Int!, $difficulty: Int!, $size: Int!, $page: Int!) {
  worldData {
    encounter(id: $encounterID) {
      id
      name
      characterRankings(
        difficulty: $difficulty
        size: $size
        page: $page
        partition: 3
        className: "Priest"
        specName: "Shadow"
        metric: dps
      )
    }
  }
}
`;

// GraphQL query to fetch detailed cast events from a report
const REPORT_QUERY = `
query GetReportData($reportID: String!, $fightID: Int!, $sourceID: Int!) {
  reportData {
    report(code: $reportID) {
      startTime
      endTime
      fights(fightIDs: [$fightID]) {
        id
        startTime
        endTime
        encounterID
        difficulty
        kill
      }
      events(
        fightIDs: [$fightID]
        sourceID: $sourceID
        dataType: Casts
        limit: 10000
      ) {
        data
        nextPageTimestamp
      }
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
async function fetchRankings(encounterID, difficulty, size, page = 1) {
  const token = await getAccessToken();

  const response = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: RANKING_QUERY,
      variables: { encounterID, difficulty, size, page }
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
}

/**
 * Get player's sourceID from a report
 */
async function getPlayerSourceID(reportCode, playerName) {
  const token = await getAccessToken();
  
  const query = `
  query GetPlayerID($reportID: String!) {
    reportData {
      report(code: $reportID) {
        masterData {
          actors(type: "Player") {
            id
            name
          }
        }
      }
    }
  }
  `;
  
  const response = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query,
      variables: { reportID: reportCode }
    })
  });
  
  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  
  const actors = data.data.reportData.report.masterData.actors;
  const player = actors.find(a => a.name === playerName);
  
  if (!player) {
    throw new Error(`Player ${playerName} not found in report`);
  }
  
  return player.id;
}

/**
 * Fetch detailed report data
 */
async function fetchReportData(reportID, fightID, sourceID) {
  const token = await getAccessToken();

  const response = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: REPORT_QUERY,
      variables: { reportID, fightID, sourceID }
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
  const mbCpm = allMetrics.map(m => parseFloat(m.metrics.mindBlast.cpm));
  const dpCpm = allMetrics.map(m => parseFloat(m.metrics.devouringPlague.cpm));
  const vtCpm = allMetrics.map(m => parseFloat(m.metrics.vampiricTouch.cpm));
  const swpCpm = allMetrics.map(m => parseFloat(m.metrics.shadowWordPain.cpm));
  const haloCpm = allMetrics.map(m => parseFloat(m.metrics.halo.cpm));
  const mindFlayCpm = allMetrics.map(m => parseFloat(m.metrics.mindFlay.cpm));
  const mindFlayInsanityCpm = allMetrics.map(m => parseFloat(m.metrics.mindFlayInsanity.cpm));
  const mindSearCpm = allMetrics.map(m => parseFloat(m.metrics.mindSear.cpm));
  const mindSpikeCpm = allMetrics.map(m => parseFloat(m.metrics.mindSpike.cpm));
  const swdCpm = allMetrics.map(m => parseFloat(m.metrics.shadowWordDeath.cpm));
  const shadowfiendCpm = allMetrics.map(m => parseFloat(m.metrics.shadowfiend.cpm));
  const durations = allMetrics.map(m => m.fightDuration);

  return {
    fightDuration: calculateMedian(durations),
    metrics: {
      mindBlast: { cpm: calculateMedian(mbCpm).toFixed(2) },
      devouringPlague: { cpm: calculateMedian(dpCpm).toFixed(2) },
      vampiricTouch: { cpm: calculateMedian(vtCpm).toFixed(2) },
      shadowWordPain: { cpm: calculateMedian(swpCpm).toFixed(2) },
      halo: { cpm: calculateMedian(haloCpm).toFixed(2) },
      mindFlay: { cpm: calculateMedian(mindFlayCpm).toFixed(2) },
      mindFlayInsanity: { cpm: calculateMedian(mindFlayInsanityCpm).toFixed(2) },
      mindSear: { cpm: calculateMedian(mindSearCpm).toFixed(2) },
      mindSpike: { cpm: calculateMedian(mindSpikeCpm).toFixed(2) },
      shadowWordDeath: { cpm: calculateMedian(swdCpm).toFixed(2) },
      shadowfiend: { cpm: calculateMedian(shadowfiendCpm).toFixed(2) }
    }
  };
}

/**
 * Extract key metrics from report data
 */
function extractMetrics(reportData) {
  const fight = reportData.reportData.report.fights[0];
  const castEvents = reportData.reportData.report.events.data;
  const damageEvents = reportData.reportData.report.damageEvents.data;

  const fightDuration = (fight.endTime - fight.startTime) / 1000;
  const fightMinutes = fightDuration / 60;

  // Filter to only successful casts (not begincast events)
  const successfulCasts = castEvents.filter(e => e.type === 'cast');

  // Count casts by spell ID
  const mbCasts = successfulCasts.filter(e => e.abilityGameID === 8092).length;
  const dpCasts = successfulCasts.filter(e => e.abilityGameID === 2944).length;
  const vtCasts = successfulCasts.filter(e => e.abilityGameID === 34914).length;
  const swpCasts = successfulCasts.filter(e => e.abilityGameID === 589).length;
  const haloCasts = successfulCasts.filter(e => e.abilityGameID === 120644).length;
  const mindFlayCasts = successfulCasts.filter(e => e.abilityGameID === 15407).length;
  const mindFlayInsanityCasts = successfulCasts.filter(e => e.abilityGameID === 129197).length;
  const mindSearCasts = successfulCasts.filter(e => e.abilityGameID === 48045).length;
  const mindSpikeCasts = successfulCasts.filter(e => e.abilityGameID === 73510).length;
  const swdCasts = successfulCasts.filter(e => e.abilityGameID === 32379).length;
  const shadowfiendCasts = successfulCasts.filter(e => e.abilityGameID === 34433).length;

  return {
    fightDuration,
    metrics: {
      mindBlast: { casts: mbCasts, cpm: (mbCasts / fightMinutes).toFixed(2) },
      devouringPlague: { casts: dpCasts, cpm: (dpCasts / fightMinutes).toFixed(2) },
      vampiricTouch: { casts: vtCasts, cpm: (vtCasts / fightMinutes).toFixed(2) },
      shadowWordPain: { casts: swpCasts, cpm: (swpCasts / fightMinutes).toFixed(2) },
      halo: { casts: haloCasts, cpm: (haloCasts / fightMinutes).toFixed(2) },
      mindFlay: { casts: mindFlayCasts, cpm: (mindFlayCasts / fightMinutes).toFixed(2) },
      mindFlayInsanity: { casts: mindFlayInsanityCasts, cpm: (mindFlayInsanityCasts / fightMinutes).toFixed(2) },
      mindSear: { casts: mindSearCasts, cpm: (mindSearCasts / fightMinutes).toFixed(2) },
      mindSpike: { casts: mindSpikeCasts, cpm: (mindSpikeCasts / fightMinutes).toFixed(2) },
      shadowWordDeath: { casts: swdCasts, cpm: (swdCasts / fightMinutes).toFixed(2) },
      shadowfiend: { casts: shadowfiendCasts, cpm: (shadowfiendCasts / fightMinutes).toFixed(2) }
    }
  };
}

/**
 * Unpack encounter ID to get base ID (remove packed format)
 * Packed format: 50000 + (difficulty * 10) + baseEncounterID
 * Example: 51565 → 1505
 */
function unpackEncounterID(packedID) {
  if (packedID > 50000) {
    const offset = packedID - 50000;
    // Try each difficulty from highest to lowest (6, 5, 4, 3)
    for (let diff = 6; diff >= 3; diff--) {
      const candidateBase = offset - (diff * 10);
      if (candidateBase >= 1490 && candidateBase <= 1600) {
        return candidateBase;
      }
    }
  }
  return packedID; // Already unpacked or unknown format
}

/**
 * Save benchmark data to JSON file
 */
function saveBenchmarkData(benchmarkData, encounterID, difficulty, size) {
  const benchmarksDir = path.join(__dirname, '..', 'analyzer', 'benchmarks');

  if (!fs.existsSync(benchmarksDir)) {
    fs.mkdirSync(benchmarksDir, { recursive: true });
  }

  // Unpack encounter ID to base ID for consistent filename
  const baseEncounterID = unpackEncounterID(encounterID);

  // Save individual benchmark file with format: baseID-difficulty-size.json
  const filename = `${baseEncounterID}-${difficulty}-${size}.json`;
  const filepath = path.join(benchmarksDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(benchmarkData, null, 2));
  console.log(`✓ Saved to ${filepath}`);

  // Update index file (also use base ID)
  updateBenchmarkIndex(benchmarksDir, benchmarkData, baseEncounterID, difficulty, size);
}

/**
 * Update benchmark index file with metadata
 */
function updateBenchmarkIndex(benchmarksDir, benchmarkData, encounterID, difficulty, size) {
  const indexPath = path.join(benchmarksDir, 'index.json');

  let index = { lastUpdated: null, benchmarks: [] };
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  // Remove old entry for this encounter/difficulty/size if it exists
  index.benchmarks = index.benchmarks.filter(
    b => !(b.encounterID === encounterID && b.difficulty === difficulty && b.size === size)
  );

  // Add new entry
  index.benchmarks.push({
    encounterID,
    encounterName: benchmarkData.encounterName,
    difficulty,
    size,
    difficultyName: benchmarkData.difficultyName,
    type: benchmarkData.type,
    rankRange: benchmarkData.rankRange,
    sampleSize: benchmarkData.sampleSize,
    lastUpdated: benchmarkData.lastUpdated,
    filename: `${encounterID}-${difficulty}-${size}.json`
  });

  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`✓ Updated index.json`);
}

/**
 * Fetch and save benchmark (median of ranks 51-100)
 */
async function fetchAndSaveBenchmark(encounterID, encounterName, difficulty, size, difficultyName, rankStart, rankEnd) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fetching: ${encounterName} (${difficultyName})`);
  console.log(`Ranks: ${rankStart}-${rankEnd} (calculating median)`);
  console.log('='.repeat(60));

  // Step 1: Fetch rankings
  console.log('Step 1: Fetching rankings...');
  const rankingsData = await fetchRankings(encounterID, difficulty, size, 1);

  if (!rankingsData?.worldData?.encounter) {
    console.error(`❌ No encounter data found!`);
    return null;
  }

  const encounter = rankingsData.worldData.encounter;
  const rankingsJson = encounter.characterRankings;
  
  if (!rankingsJson || rankingsJson.error) {
    console.error(`❌ No rankings data:`, rankingsJson?.error || 'missing');
    return null;
  }

  const allRankings = rankingsJson.rankings || [];
  console.log(`✓ Found ${allRankings.length} total rankings`);

  // Extract target rank range
  const startIndex = rankStart - 1;
  const endIndex = rankEnd;
  const targetRankings = allRankings.slice(startIndex, endIndex);

  if (targetRankings.length === 0) {
    console.error(`❌ No rankings found in range ${rankStart}-${rankEnd}!`);
    return null;
  }

  console.log(`✓ Extracted ${targetRankings.length} rankings`);

  // Step 2: Fetch detailed report data for each ranking
  console.log('\nStep 2: Fetching report data for all rankings...');
  const allMetrics = [];
  let fetchedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < targetRankings.length; i++) {
    const ranking = targetRankings[i];
    const currentRank = rankStart + i;

    try {
      process.stdout.write(`  Fetching rank #${currentRank} (${i + 1}/${targetRankings.length})...`);

      const sourceID = await getPlayerSourceID(ranking.report.code, ranking.name);
      const reportData = await fetchReportData(ranking.report.code, ranking.report.fightID, sourceID);
      const metrics = extractMetrics(reportData);
      
      allMetrics.push(metrics);
      fetchedCount++;
      console.log(' ✓');

      // Delay between requests to be polite to API
      if (i < targetRankings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.log(` ❌ Failed: ${error.message}`);
      failedCount++;
    }
  }

  if (allMetrics.length === 0) {
    console.error('❌ Failed to fetch any report data!');
    return null;
  }

  console.log(`\n✓ Successfully fetched ${fetchedCount} reports (${failedCount} failed)`);

  // Step 3: Calculate median metrics
  console.log('\nStep 3: Calculating median metrics...');
  const medianMetrics = calculateMedianMetrics(allMetrics);

  // Unpack encounter ID for consistent storage (1505 instead of 51565)
  const baseEncounterID = unpackEncounterID(encounterID);

  const benchmarkData = {
    encounterID: baseEncounterID,
    encounterName,
    difficulty,
    size,
    difficultyName,
    rankRange: { start: rankStart, end: rankEnd },
    type: 'median',
    lastUpdated: new Date().toISOString(),
    sampleSize: allMetrics.length,
    medianFightDuration: medianMetrics.fightDuration,
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
        config.size,
        config.difficultyName,
        config.rankStart,
        config.rankEnd
      );

      if (benchmarkData) {
        saveBenchmarkData(benchmarkData, config.encounterID, config.difficulty, config.size);
        results.push({ success: true, config });
      } else {
        results.push({ success: false, config, error: 'Failed to fetch data' });
      }

      // Delay between benchmarks
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

  if (args[0] !== '--auto') {
    console.log('Usage: node benchmark-scraper.js --auto');
    console.log('');
    console.log('Fetches benchmarks for all configured encounters in BENCHMARK_CONFIG.');
    console.log('Add more bosses to the config array at the top of the file.');
    process.exit(0);
  }

  await autoFetchAll();
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchRankings, fetchReportData, extractMetrics };