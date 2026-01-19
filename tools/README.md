# Benchmark Scraper

Tool for fetching encounter-specific performance benchmarks from WarcraftLogs top performers (ranks 51-100) for **Classic MoP** Throne of Thunder (released December 11, 2025).

## Setup

No setup needed! Uses the same WCL API credentials as the main analyzer (from `wcl-v2-service.js`).

## Testing Phase 1: Single Rank

First, we test with just rank #1 to measure data size:

```bash
node benchmark-scraper.js 1565 4 1
```

This fetches:
- Encounter: 1565 (Tortos)
- Difficulty: 4 (Heroic 10)
- Rank: 1 (Top performer)

### What We're Measuring:
- How many API calls needed?
- How much data per log?
- What metrics can we extract?
- Can we condense it down?

## Encounter IDs (Throne of Thunder)

```
1559 = Iron Qon
1560 = Twin Empyreans
1565 = Tortos
1570 = Council of Elders
1572 = Durumu the Forgotten
1573 = Ji-Kun
1574 = Primordius
1575 = Horridon
1576 = Dark Animus
1577 = Jin'rokh the Breaker
1578 = Megaera
1579 = Lei Shen
1580 = Ra-den (25N)
1581 = Ra-den (25H)
```

## Difficulty Codes

```
3 = Normal (10-player)
4 = Heroic (10-player)
5 = Normal (25-player)
6 = Heroic (25-player)
```

## Next Steps

After testing rank #1:

1. Calculate estimated data size for ranks 51-100 (50 logs)
2. Determine which metrics we can extract vs need to calculate
3. Design condensed benchmark format
4. Build aggregation logic (median, percentiles)
5. Create weekly automation script
6. Store benchmarks in repository

## Metrics We Want

- **Mind Blast**: Casts per minute, avg delay, missed casts
- **DoT Uptime**: VT %, SW:P %, gaps per fight
- **DP Efficiency**: % cast with 3 orbs
- **Active Time**: % of fight spent casting/channeling
- **Movement**: Maybe infer from cast delays?

## Storage Format (Draft)

```json
{
  "encounter": 1504,
  "encounterName": "Tortos",
  "difficulty": 4,
  "difficultyName": "Heroic 10",
  "lastUpdated": "2025-01-18",
  "sampleSize": 50,
  "benchmarks": {
    "mindBlast": {
      "castsPerMinute": { "median": 6.2, "p25": 5.8, "p75": 6.5 },
      "avgDelay": { "median": 1.2, "p25": 0.8, "p75": 1.8 }
    },
    "dotUptime": {
      "vampiricTouch": { "median": 94.5, "p25": 92.0, "p75": 96.0 },
      "shadowWordPain": { "median": 95.2, "p25": 93.5, "p75": 97.0 }
    },
    "devouringPlague": {
      "threeOrbPercent": { "median": 98.5, "p25": 96.0, "p75": 100.0 }
    }
  }
}
```
