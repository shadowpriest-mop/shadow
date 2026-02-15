# Shadow Priest MoP Analyzer - Development Documentation

## App Level Overview

### Purpose
A web-based WarcraftLogs analyzer specifically designed for Shadow Priests in Mists of Pandaria (MoP) Classic. Helps players identify and fix gameplay mistakes by analyzing combat logs and providing actionable feedback.

### Architecture
- **Frontend**: Vanilla JavaScript, HTML, CSS (no framework)
- **Data Source**: WarcraftLogs API v2 (GraphQL)
- **Analysis Engine**: Client-side cast analysis with quality scoring
- **Version**: v2.45.6

### Core Components

#### 1. Main Application (`script.js`)
- WCL report fetching and parsing
- UI rendering (cast timeline, stats overview, talents)
- Event handling and filtering
- Cast detail visualization

#### 2. Analysis Engine (`analyzer/casts-analyzer.js`)
- Parses WCL events into structured cast data
- Calculates quality metrics (delays, clipping, cooldown usage)
- Shadow Orb detection via damage coefficient analysis
- DoT/Channel optimization tracking
- Haste calculation from gear/buffs

#### 3. Quality Scoring (`analyzer/stat-highlights.js`)
- 4-level status system: NORMAL, NOTICE, WARNING, ERROR
- Spell-specific quality checks
- Overall cast rating aggregation
- Color-coded feedback (yellow/orange/red/bright red)

#### 4. Stats Calculator (`analyzer/cast-stats-calculator.js`)
- Aggregates cast statistics
- Calculates damage, crit rates, active time
- DoT uptime and clipping metrics
- Mind Flay channel optimization

#### 5. Pre-Pull Checker (`analyzer/prepull-checker.js`)
- Validates pre-pull buffs and cooldowns
- Checks opener sequence
- Visual indicators (green/yellow/red)

### Key Features

#### Shadow Orb Detection
Since WarcraftLogs doesn't track Shadow Orbs (they're "combat points"), we reverse-engineer orb count from Devouring Plague damage using spell power coefficients:
- Initial hit coefficient: 1.416572684916214 per orb
- Tick coefficient: 0.2361049406 per orb
- Compares actual damage vs expected damage for 1/2/3 orbs
- Flags casts with <3 orbs as CRITICAL errors (bright red)

#### Mind Blast Cooldown Tracking
- Tracks 8-second flat cooldown (not affected by haste)
- Cooldown starts when cast FINISHES (castEnd), not starts
- Flags delays >5s as ERROR, >2s as NOTICE
- Shows "MB ready X.Xs ago" in cast details

#### Talent Detection
- Extracts talents from WarcraftLogs combatantInfo
- Fixes incorrect tier mappings from WCL
- Visual talent display with proper icons
- Special handling for talent name mismatches (e.g., "Mind Control" → "Dominate Mind")

#### Status Hierarchy
1. **NORMAL** - No issues
2. **NOTICE** - Minor optimization opportunity (yellow, #f59e0b)
3. **WARNING** - Moderate mistake (orange, #f97316)
4. **ERROR** - Critical mistake with significant damage loss (bright red, #dc2626 with glow)

### Spell IDs Reference
```javascript
const SPELL_IDS = {
  MIND_BLAST: 8092,
  DEVOURING_PLAGUE: 2944,
  VAMPIRIC_TOUCH: 34914,
  SHADOW_WORD_PAIN: 589,
  MIND_FLAY: 15407,
  MIND_FLAY_INSANITY: 129197,
  SHADOW_WORD_DEATH: 32379,
  SHADOWFIEND: 34433,
  MIND_SPIKE: 73510
};
```

### Design Philosophy
- **Only highlight mistakes** - No green highlighting for correct play (except pre-pull check)
- **Actionable feedback** - Only show metrics that help improve gameplay
- **Error severity matters** - Critical errors (orb mistakes, long MB delays) get bright red treatment
- **Clean UI** - Removed fluff stats (Active DPS, Avg Hit, Damage/GCD, GCD Usage, etc.)

### File Structure
```
/home/user/shadow/
├── index.html              # Main HTML with version v2.27.10
├── script.js               # Main application logic
├── style.css               # UI styling
├── analyzer/
│   ├── casts-analyzer.js   # Core analysis engine
│   ├── stat-highlights.js  # Quality scoring system
│   ├── cast-stats-calculator.js
│   ├── spell-data.js       # Spell metadata
│   ├── buff-data.js        # Buff metadata
│   ├── haste.js            # Haste calculations
│   ├── wcl-v2-service.js   # WCL API integration
│   ├── prepull-checker.js  # Pre-pull validation
│   └── icons/
│       ├── talents/        # Talent icons (.jpg)
│       └── *.jpg           # Spell icons
└── CLAUDE.md               # This file
```

### Version Control
- Branch: `claude/shadow-priest-website-01Fzq4UgdUHDyo4mx2CAbHnE`
- Update version in 3 places when making changes:
  1. Footer: `<div class="version-label">v2.45.6</div>`
  2. App bar: `<span class="app-version">v2.45.6</span>`
  3. CSS cache: `<link rel="stylesheet" href="style.css?v=2.45.0">`
- Update script versions when modifying JS files

---

## Task Level: Current Work & Future Improvements

### Recently Completed (v2.26.5 → v2.45.3)

#### Code Cleanup
- ✅ Removed ~36 debug console.log statements across multiple files
- ✅ Preserved essential error logging

#### Shadow Orb Detection (v2.27.0)
- ✅ Implemented damage-based orb inference algorithm
- ✅ Added "Shadow Orbs: X/3" display in cast details
- ✅ Flag <3 orb DP casts as errors

#### Error Severity System (v2.27.1)
- ✅ Added ERROR status level (4th severity)
- ✅ Bright red styling with glow effect
- ✅ "⚠️ CRITICAL:" label for severe errors

#### Mind Blast Cooldown Tracking
- ✅ v2.27.3: Added cooldown delay warnings
- ✅ v2.27.4: Fixed to use castEnd instead of castStart
- ✅ v2.27.5: Fixed to mark delayed MB casts themselves (not just other casts)
- ✅ Show "MB ready X.Xs ago" in cast details
- ✅ Delays >5s = ERROR, >2s = NOTICE

#### UI Improvements
- ✅ v2.27.2: Removed green highlights from cast timeline (only highlight mistakes)
- ✅ v2.27.6: Restored soft green indicators for pre-pull check (#10b981)
- ✅ v2.27.7: Removed non-actionable stats (Active DPS, Hits, Avg Hit, Damage/GCD)
- ✅ v2.27.8: Removed GCD Usage (was showing >100% due to haste)

#### Talent Display Fixes
- ✅ v2.27.9: Fixed Dominate Mind icon mapping (WCL returns "Mind Control")
- ✅ v2.27.10: Fixed tooltip to show "Dominate Mind" instead of "Mind Control"

#### Mind Flay Clipping Analysis (v2.45.0 → v2.45.6)
- ✅ v2.45.0: Initial implementation with tick-based clipping analysis
- ✅ v2.45.1: **Bug fix** - Use actual damage timestamps instead of modulo math
- ✅ v2.45.2: **UI tweak** - Display tick time in milliseconds for consistency
- ✅ v2.45.3: **Critical fix** - Use nextCast.castStart instead of cast.castEnd for wasted time calculation
- ✅ v2.45.4: Add color indicators for Mind Flay clipping quality (200-299ms = warning, 300ms+ = error)
- ✅ v2.45.5: **Bug fix** - Display actual tick interval instead of time to first tick
- ✅ v2.45.6: **Bug fix** - Filter out MF → MF attachment intervals and handle casts with no ticks
- ✅ Calculate wasted channel time when clipping MF → Other spell
- ✅ Display wasted time in individual cast details
- ✅ Show average wasted time in stats panel when filtering Mind Flay
- ✅ Quality thresholds: <200ms = good, 200-300ms = warning, 300ms+ = error
- ✅ Exclude transitions >1000ms gap (movement mechanics)
- ✅ **UI Changes**: Removed "Cast Time" for MF, added "Tick Interval" (average time between ticks)
- ✅ **UI Changes**: Removed "Delay" display for Mind Flay (not useful)

### In Progress

#### Mind Blast Analytics Enhancement
**Goal**: Add spell-specific stats when filtering by Mind Blast

**Implementation Plan**:
1. Calculate potential MB casts:
   - Find first MB cast timestamp (accounts for opener: SW:P > VT > DP > MB)
   - Potential = `1 + floor((fight_end - first_MB_end) / 8000)`
   - MB cooldown is flat 8 seconds (NOT affected by haste)

2. Add to stats panel when filtering MB (spell ID 8092):
   - Casts (actual count)
   - Potential Casts
   - **Missed Casts** (highlight if > 0)
   - Crit Rate
   - **Avg Delay** (average time MB was delayed after CD ready)

3. Implementation location:
   - Add calculation method to `cast-stats-calculator.js`
   - Update `renderStatsOverview()` in `script.js` for spell ID 8092

**Key Mechanics**:
- MB cooldown: 8000ms flat (no haste scaling)
- MB cast time: 1500ms base (affected by haste)
- Opener sequence: Potion > Halo > Mind Spike (pre-pull) → Shadowfiend+CDs → SW:P > VT > DP > MB
- Start fight with 3 orbs (passive out-of-combat generation)
- First MB typically around ~5-6 seconds into fight

### Upcoming Tasks

#### Per-Spell Stats Customization
- [ ] **Devouring Plague** stats:
  - Casts with <3 orbs (error count)
  - Uptime % (instead of avg downtime)
  - Crit rate

- [ ] **VT/SW:P** stats:
  - Uptime %
  - Pandemic efficiency (refreshes with <30% remaining vs >30%)
  - Early refreshes count

- [ ] **Mind Flay** stats:
  - % of time in Insanity window (if Solace & Insanity talent)
  - Active time
  - Clipping stats (keep existing)

- [ ] **Shadow Word: Death** stats:
  - Total casts
  - Execute phase casts (<20% health) vs outside execute
  - Crit rate

#### DoT Uptime Improvements
- [ ] Convert "Avg DoT Downtime" (seconds) to "Uptime %" (more intuitive)
- [ ] Show per-target uptime when multi-dotting
- [ ] Track when DoTs fall off vs when they should be refreshed

#### Code Quality
- [ ] Consider refactoring `calculateCooldownMetrics()` to be more generic
- [ ] Extract magic numbers to constants
- [ ] Add JSDoc comments for complex algorithms (orb detection, pandemic timing)

### Known Issues
None currently tracked.

### Testing Notes
- Always test with real WarcraftLogs after changes
- Hard refresh (Ctrl+Shift+R) to clear cache
- Verify version number updates in console logs
- Check both timeline and per-spell filtered views

### Game Mechanics Reference

#### Shadow Orb System
- Generated by: Mind Blast (1 orb), Shadow Word: Death on targets <20% (1 orb)
- Consumed by: Devouring Plague (1-3 orbs)
- Passive generation: 3 orbs when out of combat
- Max orbs: 3
- **Critical**: Always use DP with 3 orbs (massive damage loss otherwise)

#### Opener Sequence
1. Pre-pull (5s before pull):
   - Use potion
   - Cast Halo
   - Cast Mind Spike (to proc Surge of Darkness for instant Mind Blast later if needed)
2. On pull:
   - Shadowfiend + Berserking + Synapse Springs (all CDs together)
   - SW:P
   - VT
   - DP (with 3 orbs from passive generation)
   - MB (first orb generator in combat)
   - Mind Flay: Insanity (empowered by DP being active)
   - Continue rotation

#### Cooldowns
- Mind Blast: 8s (flat, not affected by haste)
- Shadow Word: Death: 8s (flat)
- Shadowfiend: 3min
- Potion: 1x per fight

#### DoT Mechanics
- Pandemic: Can refresh DoTs with ≤30% duration remaining without losing ticks
- SW:P duration: 18s
- VT duration: 15s
- DP duration: 8s (but varies with mastery?)

#### Solace and Insanity Talent
- Mind Flay deals increased damage while Devouring Plague is active
- Damage bonus is snapshotted when starting MF channel
- Optimal: Clip MF just before DP expires to snapshot one more empowered channel
