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
const BENCHMARK_CONFIG = [
  {
    encounterID: 1525,    // Tortos
    encounterName: 'Tortos',
    difficulty: 6,        // Heroic 25
    difficultyName: 'Heroic 25',
    rank: 1
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
// We'll fetch minimal data first to see the payload size
const RANKING_QUERY = `
query GetRankingData($encounterID: Int!, $difficulty: Int!, $page: Int!) {
  worldData {
    encounter(id: $encounterID) {
      characterRankings(
        difficulty: $difficulty
        page: $page
        className: "Priest"
        specName: "Shadow"
        metric: dps
      )
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
          encounterID,
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
 * Save benchmark data to JSON file
 */
function saveBenchmarkData(benchmarkData, encounterID, difficulty) {
  const benchmarksDir = path.join(__dirname, '..', 'analyzer', 'benchmarks');

  // Create directory if it doesn't exist
  if (!fs.existsSync(benchmarksDir)) {
    fs.mkdirSync(benchmarksDir, { recursive: true });
  }

  // Save individual benchmark file
  const filename = `${encounterID}-${difficulty}.json`;
  const filepath = path.join(benchmarksDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(benchmarkData, null, 2));
  console.log(`✓ Saved to ${filepath}`);

  // Update index file
  updateBenchmarkIndex(benchmarksDir, benchmarkData, encounterID, difficulty);
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
    rank: benchmarkData.rank,
    playerName: benchmarkData.playerName,
    dps: benchmarkData.dps,
    reportCode: benchmarkData.reportCode,
    fightID: benchmarkData.fightID,
    lastUpdated: benchmarkData.lastUpdated,
    filename: `${encounterID}-${difficulty}.json`
  });

  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`✓ Updated index.json`);
}

/**
 * Fetch and save a single benchmark
 */
async function fetchAndSaveBenchmark(encounterID, encounterName, difficulty, difficultyName, rank) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fetching: ${encounterName} (${difficultyName}) - Rank #${rank}`);
  console.log('='.repeat(60));

  // Step 1: Fetch rankings
  console.log('Step 1: Fetching rankings...');
  const rankingsData = await fetchRankings(encounterID, difficulty, 1);

  if (!rankingsData?.worldData?.encounter?.characterRankings) {
    console.error('❌ No ranking data found!');
    return null;
  }

  const rankings = rankingsData.worldData.encounter.characterRankings.rankings;
  if (rankings.length === 0) {
    console.error('❌ No rankings found!');
    return null;
  }

  const targetLog = rankings[rank - 1];
  if (!targetLog) {
    console.error(`❌ Rank #${rank} not found!`);
    return null;
  }

  console.log(`✓ Found: ${targetLog.name} - ${targetLog.amount.toFixed(0)} DPS`);
  console.log(`  Report: ${targetLog.report.code}, Fight: ${targetLog.report.fightID}`);

  // Step 2: Fetch detailed report data
  console.log('Step 2: Fetching report data...');
  const reportData = await fetchReportData(
    targetLog.report.code,
    targetLog.report.fightID,
    targetLog.sourceID
  );

  // Verify report is from Classic ToT period
  const reportStartTime = reportData.reportData.report.startTime;
  if (TOT_START_DATE && reportStartTime < TOT_START_DATE) {
    const reportDate = new Date(reportStartTime).toISOString().split('T')[0];
    console.warn(`⚠️  Report from ${reportDate}, before Classic ToT release (2025-12-11)`);
  }

  // Step 3: Extract metrics
  console.log('Step 3: Extracting metrics...');
  const metrics = extractMetrics(reportData);

  // Step 4: Build benchmark data structure
  const benchmarkData = {
    encounterID,
    encounterName,
    difficulty,
    difficultyName,
    rank,
    playerName: targetLog.name,
    dps: targetLog.amount,
    reportCode: targetLog.report.code,
    fightID: targetLog.report.fightID,
    reportStartTime: new Date(reportStartTime).toISOString(),
    lastUpdated: new Date().toISOString(),
    fightDuration: metrics.fightDuration,
    metrics: metrics.metrics,
    dataSize: metrics.rawDataSize
  };

  console.log('✓ Metrics extracted');
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
        config.rank
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

  // Manual mode - fetch single benchmark
  if (args.length < 3) {
    console.log('Usage:');
    console.log('  node benchmark-scraper.js <encounterID> <difficulty> <rank>  - Manual mode');
    console.log('  node benchmark-scraper.js --auto                             - Auto fetch all');
    console.log('');
    console.log('Example: node benchmark-scraper.js 1525 6 1');
    console.log('  1525 = Tortos');
    console.log('  6 = Heroic 25 (3 = Normal 10, 4 = Heroic 10, 5 = Normal 25, 6 = Heroic 25)');
    console.log('  1 = Rank #1');
    console.log('');
    console.log('Throne of Thunder Encounter IDs:');
    console.log('  1522 = Jin\'rokh the Breaker');
    console.log('  1523 = Horridon');
    console.log('  1524 = Council of Elders');
    console.log('  1525 = Tortos');
    console.log('  1526 = Megaera');
    console.log('  1527 = Ji-Kun');
    console.log('  1528 = Durumu the Forgotten');
    console.log('  1529 = Primordius');
    console.log('  1530 = Dark Animus');
    console.log('  1531 = Iron Qon');
    console.log('  1532 = Twin Empyreans');
    console.log('  1533 = Lei Shen');
    console.log('  1534 = Ra-den');
    process.exit(0);
  }

  const encounterID = parseInt(args[0]);
  const difficulty = parseInt(args[1]);
  const rank = parseInt(args[2]);

  const benchmarkData = await fetchAndSaveBenchmark(
    encounterID,
    'Custom',
    difficulty,
    `Difficulty ${difficulty}`,
    rank
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
