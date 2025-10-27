// WCL v2 GraphQL API Service with PKCE OAuth2
// For MoP Classic Shadow Priest Analyzer

const WCL_CLIENT_ID = 'a036d985-867c-480b-87ca-0e2e5beb4a15';
const WCL_REDIRECT_URI = window.location.origin + window.location.pathname;
const WCL_AUTH_URL = 'https://classic.warcraftlogs.com/oauth/authorize';
const WCL_TOKEN_URL = 'https://classic.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2';

class WCLv2Service {
  constructor() {
    this.accessToken = localStorage.getItem('wcl_access_token');
    this.tokenExpiry = localStorage.getItem('wcl_token_expiry');
  }

  /**
   * Check if we have a valid access token
   */
  isAuthenticated() {
    if (!this.accessToken) return false;
    if (!this.tokenExpiry) return false;

    // Check if token is expired (with 5 minute buffer)
    const expiry = parseInt(this.tokenExpiry);
    const now = Date.now();
    return now < (expiry - 5 * 60 * 1000);
  }

  /**
   * Generate random string for PKCE code verifier
   */
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }

  /**
   * Generate code challenge from verifier
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.base64URLEncode(new Uint8Array(hash));
  }

  /**
   * Base64 URL encoding (without padding)
   */
  base64URLEncode(buffer) {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Start OAuth2 PKCE flow
   */
  async startOAuthFlow() {
    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store verifier for later
    localStorage.setItem('wcl_code_verifier', codeVerifier);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: WCL_CLIENT_ID,
      redirect_uri: WCL_REDIRECT_URI,
      response_type: 'code',
      scope: 'view:reports',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `${WCL_AUTH_URL}?${params.toString()}`;

    // Redirect to WCL
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback (extract code from URL)
   */
  async handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code) {
      return false; // No code in URL, not a callback
    }

    // Get stored verifier
    const codeVerifier = localStorage.getItem('wcl_code_verifier');
    if (!codeVerifier) {
      throw new Error('No code verifier found. Please try logging in again.');
    }

    // Exchange code for access token
    const tokenData = {
      client_id: WCL_CLIENT_ID,
      redirect_uri: WCL_REDIRECT_URI,
      grant_type: 'authorization_code',
      code: code,
      code_verifier: codeVerifier
    };

    try {
      const response = await fetch(WCL_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(tokenData)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${text}`);
      }

      const data = await response.json();

      // Store access token
      this.accessToken = data.access_token;
      localStorage.setItem('wcl_access_token', data.access_token);

      // Calculate expiry time
      const expiryTime = Date.now() + (data.expires_in * 1000);
      this.tokenExpiry = expiryTime.toString();
      localStorage.setItem('wcl_token_expiry', this.tokenExpiry);

      // Clean up
      localStorage.removeItem('wcl_code_verifier');

      // Remove code from URL
      window.history.replaceState({}, document.title, window.location.pathname);

      return true;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw error;
    }
  }

  /**
   * Logout (clear tokens)
   */
  logout() {
    this.accessToken = null;
    this.tokenExpiry = null;
    localStorage.removeItem('wcl_access_token');
    localStorage.removeItem('wcl_token_expiry');
    localStorage.removeItem('wcl_code_verifier');
  }

  /**
   * Execute a GraphQL query
   */
  async query(query, variables = {}) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please log in to WCL first.');
    }

    const response = await fetch(WCL_API_URL + '/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
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
}

// Create global instance
const wclV2Service = new WCLv2Service();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WCLv2Service, wclV2Service };
}
