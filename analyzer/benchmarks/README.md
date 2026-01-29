# Benchmark Data

This directory contains automatically scraped benchmark data from WarcraftLogs top performers.

## Automated Updates

Benchmark data is automatically updated weekly via GitHub Actions:
- **Schedule**: Every Wednesday at 3:00 AM CET
- **Source**: Top ranked Shadow Priest logs from WarcraftLogs
- **Scraper**: `/tools/benchmark-scraper.js`

## File Structure

- `index.json` - Index of all available benchmarks with metadata
- `{encounterID}-{difficulty}-{size}.json` - Individual benchmark data files

### Example: `1525-4-25.json`
- Encounter ID: 1525 (Tortos)
- Difficulty: 4 
- Size: 25

## Difficulty Codes

- 3 = Normal 10 & 25
- 4 = Heroic 10 & 25

## Data Format

Each benchmark file contains:
- Player info (name, DPS, report link)
- Fight duration
- Spell cast counts and metrics
- Last updated timestamp

## Configuration

Benchmarks to track are configured in `/tools/benchmark-scraper.js` in the `BENCHMARK_CONFIG` array.
