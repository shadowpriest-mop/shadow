# Benchmark Data

This directory contains automatically scraped benchmark data from WarcraftLogs top performers.

## Automated Updates

Benchmark data is automatically updated weekly via GitHub Actions:
- **Schedule**: Every Wednesday at 3:00 AM CET
- **Source**: Top ranked Shadow Priest logs from WarcraftLogs
- **Scraper**: `/tools/benchmark-scraper.js`

## File Structure

- `index.json` - Index of all available benchmarks with metadata
- `{encounterID}-{difficulty}.json` - Individual benchmark data files

### Example: `1525-6.json`
- Encounter ID: 1525 (Tortos)
- Difficulty: 6 (Heroic 25)

## Difficulty Codes

- 3 = Normal 10
- 4 = Heroic 10
- 5 = Normal 25
- 6 = Heroic 25

## Data Format

Each benchmark file contains:
- Player info (name, DPS, report link)
- Fight duration
- Spell cast counts and metrics
- Last updated timestamp

## Manual Updates

To manually update benchmarks:

```bash
# Update all configured benchmarks
node tools/benchmark-scraper.js --auto

# Update specific encounter
node tools/benchmark-scraper.js <encounterID> <difficulty> <rank>
```

## Configuration

Benchmarks to track are configured in `/tools/benchmark-scraper.js` in the `BENCHMARK_CONFIG` array.
