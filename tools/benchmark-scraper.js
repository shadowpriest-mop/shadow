/**
 * WarcraftLogs Benchmark Scraper
 * Fetches top performer data for encounter-specific benchmarks
 *
 * Usage: node benchmark-scraper.js <encounterID> <difficulty> <rank>
 * Example: node benchmark-scraper.js 1504 4 1
 */

// Use the same credentials as wcl-v2-service.js
const WCL_CLIENT_ID = 'a036e79f-2e07-4588-bc67-d46cd2f907f8';
const WCL_CLIENT_SECRET = '2j26APf8DGSppFDstkqJ8H2hCaC74YWc4GWpapEg';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client';

// Store access token
let accessToken = null;
let tokenExpiry = null;

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
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node benchmark-scraper.js <encounterID> <difficulty> <rank>');
    console.log('');
    console.log('Example: node benchmark-scraper.js 1504 4 1');
    console.log('  1504 = Tortos');
    console.log('  4 = Heroic (3 = Normal)');
    console.log('  1 = Rank #1');
    console.log('');
    console.log('Common Encounter IDs (Throne of Thunder):');
    console.log('  1502 = Jin\'rokh');
    console.log('  1503 = Horridon');
    console.log('  1504 = Tortos');
    console.log('  1505 = Council of Elders');
    process.exit(0);
  }

  const encounterID = parseInt(args[0]);
  const difficulty = parseInt(args[1]);
  const targetRank = parseInt(args[2]);

  console.log(`Fetching rank #${targetRank} for encounter ${encounterID} (difficulty ${difficulty})...`);
  console.log('');

  // Step 1: Fetch rankings
  console.log('Step 1: Fetching rankings...');
  const rankingsData = await fetchRankings(encounterID, difficulty, 1);

  if (!rankingsData?.worldData?.encounter?.characterRankings) {
    console.error('No ranking data found!');
    process.exit(1);
  }

  const rankings = rankingsData.worldData.encounter.characterRankings.rankings;

  if (rankings.length === 0) {
    console.error('No rankings found!');
    process.exit(1);
  }

  // Get the target rank
  const targetLog = rankings[targetRank - 1];

  if (!targetLog) {
    console.error(`Rank #${targetRank} not found!`);
    process.exit(1);
  }

  console.log(`Found: ${targetLog.name} - ${targetLog.amount.toFixed(0)} DPS`);
  console.log(`Report: ${targetLog.report.code}, Fight: ${targetLog.report.fightID}`);
  console.log('');

  // Step 2: Fetch detailed report data
  console.log('Step 2: Fetching report data...');
  const reportData = await fetchReportData(
    targetLog.report.code,
    targetLog.report.fightID,
    targetLog.sourceID
  );

  // Step 3: Extract metrics
  console.log('Step 3: Extracting metrics...');
  const metrics = extractMetrics(reportData);

  console.log('Fight Duration:', metrics.fightDuration.toFixed(1), 'seconds');
  console.log('');
  console.log('Metrics:');
  console.log(JSON.stringify(metrics.metrics, null, 2));
  console.log('');
  console.log('Raw Data Size:');
  console.log(JSON.stringify(metrics.rawDataSize, null, 2));
  console.log('');

  console.log('SUCCESS: Full data fetch complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchRankings, fetchReportData, extractMetrics };
