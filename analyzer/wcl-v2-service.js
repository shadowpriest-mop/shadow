// WCL v2 GraphQL API Service with Client Credentials OAuth2
// For MoP Classic Shadow Priest Analyzer
// Uses client credentials flow - no user login required (like v1 API)

console.log('wcl-v2-service.js loading...');

const WCL_CLIENT_ID = 'a036e79f-2e07-4588-bc67-d46cd2f907f8';
const WCL_CLIENT_SECRET = '2j26APf8DGSppFDstkqJ8H2hCaC74YWc4GWpapEg';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client';

class WCLv2Service {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenPromise = null; // Track ongoing token requests
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

    return data.data;
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
            }
            playerDetails(translate: true)
          }
        }
      }
    `;

    const data = await this.query(query, { code: reportCode });
    return data.reportData.report;
  }

  /**
   * Fetch events for a fight
   */
  async fetchEvents(reportCode, fightID, playerName, startTime, endTime) {
    const query = `
      query($code: String!, $fightIDs: [Int]!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
        reportData {
          report(code: $code) {
            events(
              fightIDs: $fightIDs
              startTime: $startTime
              endTime: $endTime
              filterExpression: $filterExpression
            ) {
              data
              nextPageTimestamp
            }
          }
        }
      }
    `;

    // Filter for player's casts and damage
    const filterExpression = `source.name = "${playerName}"`;

    const variables = {
      code: reportCode,
      fightIDs: [fightID],
      startTime: startTime,
      endTime: endTime,
      filterExpression: filterExpression
    };

    const data = await this.query(query, variables);
    return data.reportData.report.events;
  }

  /**
   * Helper: Get Shadow Priests from report playerDetails
   */
  getShadowPriests(report) {
    if (!report || !report.playerDetails) return [];

    const shadowPriests = [];
    const details = report.playerDetails;

    console.log('playerDetails structure:', details);

    // v2 API playerDetails structure - it's a JSON object
    // Try multiple possible structures
    let allPlayers = [];

    if (details.data?.players) {
      allPlayers = details.data.players;
    } else if (details.tanks || details.healers || details.dps) {
      allPlayers = [
        ...(details.tanks || []),
        ...(details.healers || []),
        ...(details.dps || [])
      ];
    } else if (Array.isArray(details)) {
      allPlayers = details;
    }

    console.log('All players found:', allPlayers);

    for (const player of allPlayers) {
      // Check if player is a Shadow Priest
      const isPriest = player.type === 'Priest' || player.class === 'Priest';
      const isShadow = player.specs?.some(s => s.spec === 'Shadow' || s === 'Shadow') ||
                       player.spec === 'Shadow';

      if (isPriest && isShadow) {
        shadowPriests.push({
          id: player.id,
          name: player.name,
          type: player.type || player.class
        });
      }
    }

    console.log('Shadow Priests found:', shadowPriests);
    return shadowPriests;
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
