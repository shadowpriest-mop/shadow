// WCL v2 GraphQL API Service with Client Credentials OAuth2
// For MoP Classic Shadow Priest Analyzer
// Uses client credentials flow - no user login required (like v1 API)

console.log('===  WCL-V2-SERVICE.JS LOADING (v2.42.0) ===');

// Note: BUFF_DATA is loaded from buff-data.js and available as window.BUFF_DATA

const WCL_CLIENT_ID = 'a036e79f-2e07-4588-bc67-d46cd2f907f8';
const WCL_CLIENT_SECRET = '2j26APf8DGSppFDstkqJ8H2hCaC74YWc4GWpapEg';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client';

class WCLv2Service {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenPromise = null; // Track ongoing token requests

    // Rate limit tracking
    this.rateLimit = {
      limit: null,
      remaining: null,
      reset: null,
      lastUpdated: null
    };

    // Cache settings
    this.cachePrefix = 'wcl_cache_';
    this.maxCacheItems = 30; // Keep last 30 fights
  }

  /**
   * Check if we have a valid access token
   */
  isAuthenticated() {
    if (!this.accessToken) return false;
    if (!this.tokenExpiry) return false;

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    return now < (this.tokenExpiry - 5 * 60 * 1000);
  }

  /**
   * Get access token using client credentials flow
   * This happens automatically in the background - no user interaction needed
   */
  async getAccessToken() {
    // If we already have a valid token, return it
    if (this.isAuthenticated()) {
      return this.accessToken;
    }

    // If a token request is already in progress, wait for it
    if (this.tokenPromise) {
      await this.tokenPromise;
      return this.accessToken;
    }

    // Start new token request
    this.tokenPromise = this._fetchNewToken();

    try {
      await this.tokenPromise;
      return this.accessToken;
    } finally {
      this.tokenPromise = null;
    }
  }

  /**
   * Fetch a new access token from WCL
   */
  async _fetchNewToken() {
    const tokenData = {
      grant_type: 'client_credentials'
    };

    try {
      // Use Basic Auth (client_id as username, client_secret as password)
      const credentials = btoa(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`);

      const response = await fetch(WCL_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams(tokenData)
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Token fetch failed:', text);
        throw new Error(`Failed to get access token: ${response.status} ${text}`);
      }

      const data = await response.json();

      // Store access token
      this.accessToken = data.access_token;

      // Calculate expiry time
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);

      console.log('WCL access token obtained successfully');

    } catch (error) {
      console.error('Error fetching access token:', error);
      throw error;
    }
  }

  /**
   * Extract report code from URL or ID
   */
  extractReportId(input) {
    const urlMatch = input.match(/reports?\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    // Already just an ID
    if (/^[a-zA-Z0-9]+$/.test(input.trim())) {
      return input.trim();
    }
    return null;
  }

  /**
   * Execute a GraphQL query
   * Automatically handles authentication in the background
   */
  async query(query, variables = {}) {
    // Get access token (automatically fetches if needed)
    const token = await this.getAccessToken();

    const response = await fetch(WCL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GraphQL error:', text);
      throw new Error(`GraphQL query failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join(', ')}`);
    }

    // Extract rate limit data from GraphQL response
    if (data.data && data.data.rateLimitData) {
      this.updateRateLimitFromGraphQL(data.data.rateLimitData);
    }

    return data.data;
  }

  /**
   * Update rate limit info from GraphQL response
   */
  updateRateLimitFromGraphQL(rateLimitData) {
    try {
      console.log('=== Rate Limit Data from GraphQL ===');
      console.log('rateLimitData:', rateLimitData);

      if (rateLimitData.limitPerHour !== undefined) {
        this.rateLimit.limit = rateLimitData.limitPerHour;
      }
      if (rateLimitData.pointsSpentThisHour !== undefined) {
        // Calculate remaining from spent
        this.rateLimit.remaining = this.rateLimit.limit - rateLimitData.pointsSpentThisHour;
      }
      if (rateLimitData.pointsResetIn !== undefined) {
        // pointsResetIn is in seconds, convert to timestamp
        this.rateLimit.reset = Math.floor(Date.now() / 1000) + rateLimitData.pointsResetIn;
      }
      this.rateLimit.lastUpdated = Date.now();

      console.log('Rate limit state after update:', this.rateLimit);
    } catch (error) {
      console.error('Could not parse rate limit data:', error);
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimit() {
    return {
      ...this.rateLimit,
      pointsUsed: this.rateLimit.limit && this.rateLimit.remaining !== null
        ? this.rateLimit.limit - this.rateLimit.remaining
        : null
    };
  }

  /**
   * Generate cache key for a fight
   */
  getCacheKey(reportCode, fightID, playerName) {
    return `${this.cachePrefix}${reportCode}_${fightID}_${playerName}`;
  }

  /**
   * Get fight data from cache
   */
  getFromCache(reportCode, fightID, playerName) {
    try {
      const key = this.getCacheKey(reportCode, fightID, playerName);
      const cached = localStorage.getItem(key);

      if (!cached) return null;

      const data = JSON.parse(cached);

      // Check if cache is still valid (optional: could add expiry here)
      console.log(`Cache HIT for ${reportCode}:${fightID}:${playerName}`);
      return data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  }

  /**
   * Store fight data in cache
   */
  storeInCache(reportCode, fightID, playerName, data) {
    try {
      const key = this.getCacheKey(reportCode, fightID, playerName);
      const cacheData = {
        timestamp: Date.now(),
        data: data
      };

      localStorage.setItem(key, JSON.stringify(cacheData));
      console.log(`Cached fight data: ${reportCode}:${fightID}:${playerName}`);

      // Manage cache size
      this.manageCacheSize();
    } catch (error) {
      // localStorage might be full or disabled
      console.warn('Could not cache fight data:', error);
    }
  }

  /**
   * Manage cache size - remove oldest items if we have too many
   */
  manageCacheSize() {
    try {
      // Get all cache keys
      const cacheKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.cachePrefix)) {
          cacheKeys.push(key);
        }
      }

      // If we're over the limit, remove oldest items
      if (cacheKeys.length > this.maxCacheItems) {
        // Get items with timestamps
        const items = cacheKeys.map(key => {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            return { key, timestamp: data.timestamp || 0 };
          } catch {
            return { key, timestamp: 0 };
          }
        });

        // Sort by timestamp (oldest first)
        items.sort((a, b) => a.timestamp - b.timestamp);

        // Remove oldest items until we're under the limit
        const toRemove = items.length - this.maxCacheItems;
        for (let i = 0; i < toRemove; i++) {
          localStorage.removeItem(items[i].key);
          console.log(`Removed old cache entry: ${items[i].key}`);
        }
      }
    } catch (error) {
      console.error('Error managing cache size:', error);
    }
  }

  /**
   * Clear all cached fight data
   */
  clearCache() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.cachePrefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`Cleared ${keysToRemove.length} cached fights`);
      return keysToRemove.length;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return 0;
    }
  }

  /**
   * Fetch report summary
   */
  async fetchReport(reportCode) {
    const query = `
      query($code: String!) {
        reportData {
          report(code: $code) {
            code
            title
            startTime
            endTime
            fights {
              id
              name
              startTime
              endTime
              encounterID
              difficulty
              size
              kill
            }
            masterData {
              players: actors(type: "Player") {
                id
                name
                gameID
                type
                subType
              }
              enemies: actors(type: "NPC") {
                id
                name
                gameID
                type
                subType
                petOwner
              }
            }
            rankings
          }
        }
      }
    `;

    const data = await this.query(query, { code: reportCode });

    console.log('=== RAW API RESPONSE ===');
    console.log('Full response:', JSON.stringify(data, null, 2));
    console.log('Fights count:', data.reportData.report.fights?.length || 0);
    console.log('Players count:', data.reportData.report.masterData?.players?.length || 0);
    console.log('Enemies count:', data.reportData.report.masterData?.enemies?.length || 0);

    // Log sample enemies to see what fields are available (filter out Environment)
    if (data.reportData.report.masterData?.enemies?.length > 0) {
      const realEnemies = data.reportData.report.masterData.enemies.filter(e => e.id > 0);
      console.log('Real enemies count (excluding Environment):', realEnemies.length);
      if (realEnemies.length > 0) {
        console.log('First 3 enemy samples:', realEnemies.slice(0, 3));
      }
    }

    // Get player specs from rankings data if available
    if (data.reportData.report.rankings) {
      console.log('Rankings data available:', data.reportData.report.rankings);
    }

    return data.reportData.report;
  }

  /**
   * Fetch events for a fight (with pagination support)
   * Now also fetches playerDetails for combatantInfo
   * Uses client-side caching to reduce API quota usage
   */
  async fetchEvents(reportCode, fightID, playerName, startTime, endTime) {
    // Check cache first
    const cached = this.getFromCache(reportCode, fightID, playerName);
    if (cached && cached.data) {
      console.log('Using cached fight data - no API points used!');
      return cached.data;
    }

    console.log('No cache found - fetching from WCL API');

    const query = `
      query($code: String!, $fightIDs: [Int]!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: $fightIDs
              startTime: $startTime
              endTime: $endTime
              filterExpression: $filterExpression
              includeResources: true
            ) {
              data
              nextPageTimestamp
            }
            table(fightIDs: $fightIDs, dataType: Summary, startTime: $startTime, endTime: $endTime)
          }
        }
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
      }
    `;

    // Filter for player's casts and damage
    const filterExpression = `source.name = "${playerName}"`;

    let allEvents = [];
    let playerDetails = null;
    let currentStartTime = startTime;
    let pageCount = 0;
    const maxPages = 100; // Safety limit to prevent infinite loops

    // Fetch all pages
    while (pageCount < maxPages) {
      pageCount++;
      console.log(`Fetching events page ${pageCount}, startTime: ${currentStartTime}`);

      const variables = {
        code: reportCode,
        fightIDs: [fightID],
        startTime: currentStartTime,
        endTime: endTime,
        filterExpression: filterExpression
      };

      const data = await this.query(query, variables);
      const eventsPage = data.reportData.report.events;

      // Capture table data with combatantInfo from first page only
      if (pageCount === 1) {
        if (data.reportData.report.table) {
          console.log('Table data captured:', data.reportData.report.table);
          // Parse the table JSON data
          try {
            const tableData = typeof data.reportData.report.table === 'string'
              ? JSON.parse(data.reportData.report.table)
              : data.reportData.report.table;

            console.log('Parsed table data:', tableData);

            // Check playerDetails.dps/healers/tanks for our player's stats
            if (tableData && tableData.data && tableData.data.playerDetails) {
              console.log('PlayerDetails from table:', tableData.data.playerDetails);

              // Find our player in dps/healers/tanks arrays
              const allPlayers = [
                ...(tableData.data.playerDetails.dps || []),
                ...(tableData.data.playerDetails.healers || []),
                ...(tableData.data.playerDetails.tanks || [])
              ];

              console.log(`Found ${allPlayers.length} players in playerDetails`);
              console.log('First player sample:', allPlayers[0]);

              playerDetails = { playerList: allPlayers };
            } else if (tableData && tableData.combatantInfo) {
              playerDetails = { combatantInfo: tableData.combatantInfo };
              console.log(`Found ${tableData.combatantInfo.length} combatants in table data`);
            } else if (tableData && tableData.data && tableData.data.composition) {
              // Alternative: combatantInfo might be in composition
              playerDetails = { combatantInfo: tableData.data.composition };
              console.log(`Found ${tableData.data.composition.length} combatants in composition`);
            }
          } catch (e) {
            console.error('Error parsing table data:', e);
          }
        }
      }

      if (!eventsPage || !eventsPage.data) {
        console.log('No more events data');
        break;
      }

      console.log(`Page ${pageCount}: ${eventsPage.data.length} events`);
      allEvents = allEvents.concat(eventsPage.data);

      // Check if there are more pages
      if (!eventsPage.nextPageTimestamp) {
        console.log('No more pages (no nextPageTimestamp)');
        break;
      }

      // Move to next page
      currentStartTime = eventsPage.nextPageTimestamp;
    }

    console.log(`Total events fetched: ${allEvents.length} across ${pageCount} pages`);

    const result = {
      data: allEvents,
      playerDetails: playerDetails,
      pageCount: pageCount
    };

    // Store in cache for future use
    this.storeInCache(reportCode, fightID, playerName, result);

    return result;
  }

  /**
   * Fetch buff/debuff events (applybuff, removebuff, etc.)
   * Separate from main events to allow different filtering
   */
  async fetchBuffEvents(reportCode, fightID, playerName, startTime, endTime) {
    const query = `
      query($code: String!, $fightIDs: [Int]!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: $fightIDs
              startTime: $startTime
              endTime: $endTime
              filterExpression: $filterExpression
              dataType: Buffs
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `;

    // Get tracked buff IDs from buff-data.js (window.BUFF_DATA)
    const buffData = window.BUFF_DATA || {};
    const trackedBuffIds = Object.keys(buffData).map(id => parseInt(id)).join(',');

    // Filter for buffs applied TO the player (target) with tracked IDs
    const filterExpression = `target.name = "${playerName}" AND ability.id IN (${trackedBuffIds})`;

    let allEvents = [];
    let currentStartTime = startTime;
    let pageCount = 0;
    const maxPages = 100;

    while (pageCount < maxPages) {
      pageCount++;
      console.log(`Fetching buff events page ${pageCount}, startTime: ${currentStartTime}`);

      const variables = {
        code: reportCode,
        fightIDs: [fightID],
        startTime: currentStartTime,
        endTime: endTime,
        filterExpression: filterExpression
      };

      const data = await this.query(query, variables);
      const eventsPage = data.reportData.report.events;

      if (!eventsPage || !eventsPage.data) {
        console.log('No more buff events');
        break;
      }

      console.log(`Buff page ${pageCount}: ${eventsPage.data.length} events`);
      allEvents = allEvents.concat(eventsPage.data);

      if (!eventsPage.nextPageTimestamp) {
        console.log('No more buff pages');
        break;
      }

      currentStartTime = eventsPage.nextPageTimestamp;
    }

    console.log(`Total buff events fetched: ${allEvents.length} across ${pageCount} pages`);

    return {
      data: allEvents,
      pageCount: pageCount
    };
  }

  /**
   * Fetch buff/debuff events (applybuff, removebuff, etc.)
   * Separate from main events to allow different filtering
   */
  async fetchBuffEvents(reportCode, fightID, playerName, startTime, endTime) {
    const query = `
      query($code: String!, $fightIDs: [Int]!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: $fightIDs
              startTime: $startTime
              endTime: $endTime
              filterExpression: $filterExpression
              dataType: Buffs
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `;

    // Get tracked buff IDs from buff-data.js (window.BUFF_DATA)
    const buffData = window.BUFF_DATA || {};
    const trackedBuffIds = Object.keys(buffData).map(id => parseInt(id)).join(',');

    // Filter for buffs applied TO the player (target) with tracked IDs
    const filterExpression = `target.name = "${playerName}" AND ability.id IN (${trackedBuffIds})`;

    let allEvents = [];
    let currentStartTime = startTime;
    let pageCount = 0;
    const maxPages = 100;

    while (pageCount < maxPages) {
      pageCount++;
      console.log(`Fetching buff events page ${pageCount}, startTime: ${currentStartTime}`);

      const variables = {
        code: reportCode,
        fightIDs: [fightID],
        startTime: currentStartTime,
        endTime: endTime,
        filterExpression: filterExpression
      };

      const data = await this.query(query, variables);
      const eventsPage = data.reportData.report.events;

      if (!eventsPage || !eventsPage.data) {
        console.log('No more buff events');
        break;
      }

      console.log(`Buff page ${pageCount}: ${eventsPage.data.length} events`);
      allEvents = allEvents.concat(eventsPage.data);

      if (!eventsPage.nextPageTimestamp) {
        console.log('No more buff pages');
        break;
      }

      currentStartTime = eventsPage.nextPageTimestamp;
    }

    console.log(`Total buff events fetched: ${allEvents.length} across ${pageCount} pages`);

    return {
      data: allEvents,
      pageCount: pageCount
    };
  }

  /**
   * Helper: Get Priests from report masterData
   * Note: WCL v2 masterData doesn't include spec, so we return all Priests
   * Spec will be determined later from cast analysis
   */
  getShadowPriests(report) {
    console.log('=== getShadowPriests v2.3+ CALLED ===');

    if (!report || !report.masterData || !report.masterData.players) {
      console.error('Missing report data:', { report: !!report, masterData: !!report?.masterData, players: !!report?.masterData?.players });
      return [];
    }

    const priests = [];
    const actors = report.masterData.players;

    console.log('Total actors in report:', actors.length);
    console.log('First actor example:', actors[0]);

    for (const actor of actors) {
      // In WCL v2 masterData: type = "Player", subType = class name (e.g., "Priest")
      console.log(`Checking: ${actor.name} - subType: "${actor.subType}"`);

      if (actor.subType === 'Priest') {
        priests.push({
          id: actor.id,
          name: actor.name,
          type: 'Priest' // Use class name for display
        });
        console.log('✓ Found Priest:', actor.name);
      }
    }

    console.log('=== Total Priests found:', priests.length, '===');
    console.log('Priests array:', priests);

    if (priests.length === 0) {
      console.warn('No Priests found in report. All actors:', actors.map(a => `${a.name} (${a.subType})`));
    }

    return priests;
  }

  /**
   * Helper: Get boss encounters from report fights
   */
  getBossEncounters(report) {
    if (!report || !report.fights) return [];

    // Filter for boss encounters (encounterID > 0 means it's a boss)
    return report.fights.filter(fight => fight.encounterID > 0);
  }
}

// Create global instance
const wclV2Service = new WCLv2Service();
console.log('wclV2Service initialized:', wclV2Service);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WCLv2Service, wclV2Service };
}

// Export to window for browser use
if (typeof window !== 'undefined') {
  console.log('=== EXPORTING wclV2Service to window ===');
  window.wclV2Service = wclV2Service;
  window.WCLv2Service = WCLv2Service;
  console.log('=== window.wclV2Service =', window.wclV2Service);
}
