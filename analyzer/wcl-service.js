// Warcraft Logs API Service for MoP
// Based on Wrath analyzer architecture, simplified for MVP

const WCL_API_BASE = 'https://www.warcraftlogs.com/v1';
const WCL_API_KEY = '07c25d1094baa9a68f268a1ec73198d3'; // v1 API key

// Tracked spell IDs for MoP Shadow Priest
const TRACKED_SPELLS = [
  589,    // Shadow Word: Pain
  34914,  // Vampiric Touch
  2944,   // Devouring Plague
  8092,   // Mind Blast
  15407,  // Mind Flay
  129197, // Mind Flay: Insanity
  32379,  // Shadow Word: Death
  34433,  // Shadowfiend
  120644, // Halo
  121135, // Cascade
  110744  // Divine Star
];

class WCLService {
  constructor() {
    this.cache = {};
  }

  /**
   * Extract report ID from URL or ID string
   */
  extractReportId(input) {
    if (!input) return null;

    // If it's a full URL, extract the report ID
    const urlMatch = input.match(/reports\/([A-Za-z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Otherwise assume it's already a report ID
    return input.trim();
  }

  /**
   * Fetch report summary (fights, players, etc.)
   */
  async fetchReport(reportId) {
    const cacheKey = `report_${reportId}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    const url = `${WCL_API_BASE}/report/fights/${reportId}?api_key=${WCL_API_KEY}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text();
        console.error('WCL API Error:', text);
        throw new Error(`Failed to fetch report: ${response.statusText}`);
      }

      const data = await response.json();
      this.cache[cacheKey] = data;
      return data;
    } catch (error) {
      console.error('Error fetching report:', error);
      throw error;
    }
  }

  /**
   * Get Shadow Priests from report
   */
  getShadowPriests(reportData) {
    return reportData.friendlies.filter(player => {
      // Check if they're a priest
      if (player.type !== 'Priest') return false;

      // In MoP, spec info might be in combatantInfo
      // For now, we'll include all priests and let user select
      // TODO: Filter by spec when we parse combatantInfo
      return true;
    });
  }

  /**
   * Get boss encounters from report
   */
  getBossEncounters(reportData) {
    return reportData.fights.filter(fight => fight.boss > 0);
  }

  /**
   * Fetch events for a specific encounter and player
   */
  async fetchEvents(reportId, fightId, playerId, eventType) {
    const events = [];
    let hasMore = true;
    let start = 0;

    while (hasMore) {
      const url = `${WCL_API_BASE}/report/events/${eventType}/${reportId}?` +
                  `start=${start}&` +
                  `end=999999999&` +
                  `sourceid=${playerId}&` +
                  `filter=source.id=${playerId}&` +
                  `api_key=${WCL_API_KEY}`;

      try {
        // Add delay between requests to be nice to WCL API
        if (start > 0) {
          await this.delay(50);
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch events: ${response.statusText}`);
        }

        const data = await response.json();
        events.push(...data.events);

        // Check if there are more events
        if (data.nextPageTimestamp) {
          start = data.nextPageTimestamp;
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        throw error;
      }
    }

    return events;
  }

  /**
   * Fetch all relevant events for analysis
   */
  async fetchAllEvents(reportId, fight, player) {
    console.log('Fetching events for:', player.name, 'in fight', fight.id);

    // Fetch different event types in parallel
    const [casts, damage, buffs, debuffs, resources] = await Promise.all([
      this.fetchEvents(reportId, fight.id, player.id, 'casts'),
      this.fetchEvents(reportId, fight.id, player.id, 'damage-done'),
      this.fetchEvents(reportId, fight.id, player.id, 'buffs'),
      this.fetchEvents(reportId, fight.id, player.id, 'debuffs'),
      this.fetchEvents(reportId, fight.id, player.id, 'resources')
    ]);

    // Filter events by fight time window
    const fightStart = fight.start_time;
    const fightEnd = fight.end_time;

    return {
      casts: this.filterByTime(casts, fightStart, fightEnd),
      damage: this.filterByTime(damage, fightStart, fightEnd),
      buffs: this.filterByTime(buffs, fightStart, fightEnd),
      debuffs: this.filterByTime(debuffs, fightStart, fightEnd),
      resources: this.filterByTime(resources, fightStart, fightEnd),
      fight: {
        start: fightStart,
        end: fightEnd,
        duration: fightEnd - fightStart,
        boss: fight.boss,
        name: fight.name
      }
    };
  }

  /**
   * Filter events by time window
   */
  filterByTime(events, start, end) {
    return events.filter(e => e.timestamp >= start && e.timestamp <= end);
  }

  /**
   * Helper to delay between API calls
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get combatant info for player (stats, talents, gear)
   */
  async fetchCombatantInfo(reportId, fight, player) {
    const url = `${WCL_API_BASE}/report/tables/summary/${reportId}?` +
                `start=${fight.start_time}&` +
                `end=${fight.end_time}&` +
                `sourceid=${player.id}&` +
                `api_key=${WCL_API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('Failed to fetch combatant info:', response.statusText);
        return null;
      }

      const data = await response.json();

      // Find player in combatants
      const combatant = data.playerDetails?.tanks?.find(c => c.id === player.id) ||
                       data.playerDetails?.healers?.find(c => c.id === player.id) ||
                       data.playerDetails?.dps?.find(c => c.id === player.id);

      return combatant || null;
    } catch (error) {
      console.warn('Error fetching combatant info:', error);
      return null;
    }
  }
}

// Create global instance
const wclService = new WCLService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WCLService, wclService };
}
