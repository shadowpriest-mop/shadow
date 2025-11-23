# CLAUDE.md

## App Level

### Overview
This is a Shadow Priest MoP (Mists of Pandaria) Classic Helper - a web-based analyzer tool that helps players optimize their Shadow Priest gameplay by analyzing Warcraft Logs combat reports.

### Architecture
- **Frontend-only application**: Pure HTML/CSS/JavaScript with no backend dependencies
- **Single Page Application (SPA)**: Landing page transitions to analysis view
- **External API Integration**: Connects to Warcraft Logs API to fetch combat data

### Project Structure
```
/
├── index.html          # Main entry point with landing page and analysis UI
├── script.js           # Core application logic and WCL API integration
├── style.css           # Application styling and responsive design
└── analyzer/
    └── icons/          # Icon assets including talent icons and favicon
```

### Key Technologies
- Vanilla JavaScript (ES6+)
- CSS3 with custom properties and responsive design
- Warcraft Logs API integration
- Client-side data processing and analysis

### Core Features
1. **Report Loading**: Parse and load Warcraft Logs report URLs or IDs
2. **Player Selection**: Filter and select Shadow Priest players from reports
3. **Encounter Selection**: Choose specific boss encounters to analyze
4. **Combat Analysis**: Analyze rotation, cooldowns, DoT uptime, and performance metrics
5. **Talent System**: Display and manage MoP Shadow Priest talent selections

### Data Flow
1. User inputs WCL report URL/ID
2. Application fetches report data from Warcraft Logs API
3. Filter available Shadow Priest players
4. Select specific encounter
5. Parse combat events and calculate metrics
6. Display analysis results with recommendations

---

## Task Level

### Current Implementation Tasks

#### Talent System
- **Status**: In progress
- **Location**: Talent selection UI in analysis view
- **Key Requirements**:
  - Fixed tier grid positioning (levels 15, 30, 45, 60, 75, 90)
  - Visual talent tree display with icons
  - Interactive talent selection
  - Recent icons added: Twist of Fate, From Darkness Comes Light

#### Combat Log Analysis
- **Purpose**: Parse and analyze Shadow Priest combat events
- **Metrics Tracked**:
  - DoT uptime (Vampiric Touch, Shadow Word: Pain, Devouring Plague)
  - Cooldown usage (Shadowfiend, Mind Blast, Shadow Word: Death)
  - Resource management (Shadow Orbs, Mana)
  - Spell casting patterns and rotation adherence

#### Player and Encounter Selection
- **Purpose**: Filter relevant data from WCL reports
- **Implementation**:
  - Dynamic population of player dropdown (Shadow Priests only)
  - Encounter list filtering based on report data
  - Validation before analysis begins

#### UI/UX Components
- **Landing Page**: Report input and selection interface
- **Analysis View**: Results display with metrics, charts, and recommendations
- **Responsive Design**: Mobile and desktop compatibility
- **Loading States**: Visual feedback during API calls and data processing

### Future Task Considerations
- Advanced rotation analysis
- Comparison with top performers
- Historical performance tracking
- Simulation integration
- Export/share analysis results
