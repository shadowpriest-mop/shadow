// MoP Shadow Priest Haste Calculator
// Constants imported from haste.js (loaded via HasteUtils global)
// Use HasteUtils.HASTE_RATING_PER_PERCENT, etc.

// Helper function to round up to 2 decimal places (matches in-game behavior)
// Handles floating point precision issues
function roundUp(value) {
    // First, round to 10 decimal places to eliminate floating point errors
    const cleanedValue = Math.round(value * 10000000000) / 10000000000;

    // Then apply ceiling to 2 decimal places
    return Math.ceil(cleanedValue * 100) / 100;
}

// Get boss icon URL from WCL encounterID
// WCL encounterID format: 50000 + journalEncounterID
// Example: 51565 -> 1565 (Tortos journal ID)
// Icon URL: https://assets.rpglogs.com/img/warcraft/bosses/1565-icon.jpg
function getBossIconUrl(encounterID) {
    if (!encounterID || encounterID <= 50000) {
        return null;
    }
    const journalID = encounterID - 50000;
    return `https://assets.rpglogs.com/img/warcraft/bosses/${journalID}-icon.jpg`;
}

// Placeholder icon as data URL (generic boss skull icon)
const BOSS_ICON_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIHZpZXdCb3g9IjAgMCA1NiA1NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNTYiIGhlaWdodD0iNTYiIGZpbGw9IiMxZTFlMmUiLz4KICA8cGF0aCBkPSJNMjggMTBDMjAgMTAgMTQgMTYgMTQgMjRDMTQgMjggMTYgMzIgMTkgMzVDMjAgMzYgMjEgMzcgMjIgMzhDMjMgNDAgMjQgNDIgMjQgNDRDMjQgNDUgMjUgNDYgMjYgNDZIMzBDMzEgNDYgMzIgNDUgMzIgNDRDMzIgNDIgMzMgNDAgMzQgMzhDMzUgMzcgMzYgMzYgMzcgMzVDNDAgMzIgNDIgMjggNDIgMjRDNDIgMTYgMzYgMTAgMjggMTBaIiBmaWxsPSIjOTMzM2VhIiBvcGFjaXR5PSIwLjMiLz4KICA8Y2lyY2xlIGN4PSIyMiIgY3k9IjI0IiByPSIzIiBmaWxsPSIjOTMzM2VhIi8+CiAgPGNpcmNsZSBjeD0iMzQiIGN5PSIyNCIgcj0iMyIgZmlsbD0iIzkzMzNlYSIvPgogIDx0ZXh0IHg9IjI4IiB5PSI0MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTMzM2VhIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4/PC90ZXh0Pgo8L3N2Zz4=';

// Update boss icon display based on selected encounter
// Parameters allow this to work on both landing page and analysis page
function updateBossIcon(fightId, encounters, iconElementId = 'boss-icon', containerElementId = 'boss-icon-container') {
    const bossIcon = document.getElementById(iconElementId);
    const bossIconContainer = document.getElementById(containerElementId);

    console.log('updateBossIcon called:', { fightId, iconElementId, containerElementId, hasIcon: !!bossIcon, hasContainer: !!bossIconContainer });

    if (!bossIcon || !bossIconContainer || !encounters || !fightId) {
        console.log('updateBossIcon: missing required elements or data');
        if (bossIconContainer) {
            bossIconContainer.style.display = 'none';
        }
        return;
    }

    // Find the selected fight
    const fight = encounters.find(f => f.id === parseInt(fightId));
    if (!fight) {
        console.log('updateBossIcon: fight not found for id', fightId);
        bossIconContainer.style.display = 'none';
        return;
    }

    // Get boss icon URL
    const iconUrl = getBossIconUrl(fight.encounterID);
    console.log('Boss Icon Debug:', {
        fightName: fight.name,
        encounterID: fight.encounterID,
        journalID: fight.encounterID - 50000,
        iconUrl: iconUrl
    });

    if (!iconUrl) {
        // Show placeholder for invalid encounter IDs
        console.log('updateBossIcon: invalid iconUrl, showing placeholder');
        bossIcon.src = BOSS_ICON_PLACEHOLDER;
        bossIcon.alt = `${fight.name} (no icon)`;
        bossIcon.title = `${fight.name} (icon not available)`;
        bossIconContainer.style.display = 'flex';
        return;
    }

    // Show the icon
    bossIcon.src = iconUrl;
    bossIcon.alt = `${fight.name} icon`;
    bossIcon.title = fight.name;
    bossIconContainer.style.display = 'flex';
    console.log('updateBossIcon: icon displayed successfully');

    // Handle image load errors (fallback to placeholder)
    bossIcon.onerror = function() {
        console.warn('Boss icon failed to load:', iconUrl);
        bossIcon.src = BOSS_ICON_PLACEHOLDER;
        bossIcon.alt = `${fight.name} (no icon)`;
        bossIcon.title = `${fight.name} (icon not available)`;
        // Clear onerror to prevent infinite loop if placeholder fails
        bossIcon.onerror = null;
    };
}

// Base DoT information (verified against sim)
const DOTS = {
    swp: {
        name: 'Shadow Word: Pain',
        baseDuration: 18,       // 6 ticks × 3 seconds
        baseTickInterval: 3,    // 3 seconds per tick
        baseTicks: 6            // 6 base ticks
    },
    vt: {
        name: 'Vampiric Touch',
        baseDuration: 15,       // 5 ticks × 3 seconds
        baseTickInterval: 3,    // 3 seconds per tick
        baseTicks: 5            // 5 base ticks
    },
    dp: {
        name: 'Devouring Plague',
        baseDuration: 6,        // 6 ticks × 1 second
        baseTickInterval: 1,    // 1 second per tick
        baseTicks: 6            // 6 base ticks
    }
};

// Base cast times (verified against sim)
const CASTS = {
    mindFlay: {
        name: 'Mind Flay',
        baseDuration: 3,        // 3 second channel
        baseTicks: 3            // 3 ticks
    },
    mindBlast: {
        name: 'Mind Blast',
        baseCastTime: 1.5       // 1.5 second cast
    },
    vampiricTouch: {
        name: 'Vampiric Touch',
        baseCastTime: 1.5       // 1.5 second cast
    }
};

// ====== HASH ROUTING SYSTEM ======

/**
 * Parse hash URL: #/report/DC2WjNJKnzYtMPLG/Kiwiandapple/1
 * Returns { reportId, playerName, fightId } or null
 */
function parseHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#/report/')) {
        return null;
    }

    const parts = hash.substring(9).split('/'); // Remove '#/report/'
    if (parts.length < 3) {
        return null;
    }

    return {
        reportId: parts[0],
        playerName: parts[1],
        fightId: parseInt(parts[2])
    };
}

/**
 * Update URL hash without triggering navigation
 */
function updateHash(reportId, playerName, fightId) {
    const newHash = `#/report/${reportId}/${playerName}/${fightId}`;
    if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash);
    }
}

/**
 * Navigate to landing page (clear hash)
 */
function navigateHome() {
    window.history.pushState(null, '', window.location.pathname);
    window.goHome();
}

/**
 * Load analysis from URL hash
 */
async function loadFromHash() {
    const route = parseHash();
    if (!route) {
        return;
    }

    // Set the WCL input
    const wclInput = document.getElementById('wcl-report');
    if (wclInput) {
        wclInput.value = route.reportId;
    }

    try {
        // Load the report
        await window.loadReport();

        // Wait a bit for report to load
        await new Promise(resolve => setTimeout(resolve, 500));

        // Select player and encounter
        const playerSelect = document.getElementById('player-select');
        const encounterSelect = document.getElementById('encounter-select');

        if (playerSelect && encounterSelect) {
            // Find and select the player
            for (let option of playerSelect.options) {
                if (option.value === route.playerName) {
                    playerSelect.value = route.playerName;
                    break;
                }
            }

            // Find and select the encounter
            encounterSelect.value = route.fightId.toString();

            // Check if selections are valid
            if (playerSelect.value && encounterSelect.value) {
                // Start analysis (which will switch to analysis page)
                await window.startAnalysis();
            } else {
                console.warn('Could not find player or encounter from URL');
            }
        }
    } catch (error) {
        console.error('Error loading from hash:', error);
    }
}

// ====== PAGE NAVIGATION FUNCTIONS ======

/**
 * Switch from landing page to analysis page
 */
window.startAnalysis = function() {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('analysis-page').style.display = 'block';

    // Copy selections from landing page to analysis page
    const playerSelect = document.getElementById('player-select');
    const encounterSelect = document.getElementById('encounter-select');
    const playerSelectAnalysis = document.getElementById('player-select-analysis');
    const encounterSelectAnalysis = document.getElementById('encounter-select-analysis');

    // Copy options
    playerSelectAnalysis.innerHTML = playerSelect.innerHTML;
    encounterSelectAnalysis.innerHTML = encounterSelect.innerHTML;

    // Copy selected values
    playerSelectAnalysis.value = playerSelect.value;
    encounterSelectAnalysis.value = encounterSelect.value;

    // Set up report title bar
    if (currentReportData) {
        const reportTitle = document.getElementById('report-title');
        const wclLink = document.getElementById('wcl-link');

        reportTitle.textContent = `${currentReportData.title || 'Report'}`;
        wclLink.href = `https://www.warcraftlogs.com/reports/${window.wclV2Service.extractReportId(document.getElementById('wcl-report').value)}`;
    }

    // Add change listeners to analysis page selectors (only once)
    if (!playerSelectAnalysis.hasAttribute('data-listener-attached')) {
        playerSelectAnalysis.setAttribute('data-listener-attached', 'true');
        playerSelectAnalysis.addEventListener('change', () => {
            // Update hash when player changes
            const reportId = window.wclV2Service.extractReportId(document.getElementById('wcl-report').value);
            const playerName = playerSelectAnalysis.value;
            const fightId = encounterSelectAnalysis.value;
            updateHash(reportId, playerName, fightId);
            window.analyzeLog();
        });
    }
    if (!encounterSelectAnalysis.hasAttribute('data-listener-attached')) {
        encounterSelectAnalysis.setAttribute('data-listener-attached', 'true');
        encounterSelectAnalysis.addEventListener('change', () => {
            // Update hash when encounter changes
            const reportId = window.wclV2Service.extractReportId(document.getElementById('wcl-report').value);
            const playerName = playerSelectAnalysis.value;
            const fightId = encounterSelectAnalysis.value;
            updateHash(reportId, playerName, fightId);
            // Update boss icon on analysis page
            updateBossIcon(fightId, currentEncounters, 'boss-icon-analysis', 'boss-icon-container-analysis');
            window.analyzeLog();
        });
    }

    // Update URL hash
    const reportId = window.wclV2Service.extractReportId(document.getElementById('wcl-report').value);
    const playerName = playerSelect.value;
    const fightId = encounterSelect.value;
    updateHash(reportId, playerName, fightId);

    // Update boss icon on analysis page with initial selection
    updateBossIcon(fightId, currentEncounters, 'boss-icon-analysis', 'boss-icon-container-analysis');

    // Trigger analysis
    window.analyzeLog();
};

/**
 * Go back to landing page (home)
 */
window.goHome = function() {
    // Clear hash
    window.history.pushState(null, '', window.location.pathname);

    document.getElementById('analysis-page').style.display = 'none';
    document.getElementById('landing-page').style.display = 'flex';

    // Clear analysis results
    document.getElementById('analysis-results').style.display = 'none';
    document.getElementById('target-filter-group').style.display = 'none';
};

/**
 * Show about overlay
 */
window.showAbout = function() {
    document.getElementById('about-overlay').style.display = 'flex';
};

/**
 * Hide about overlay
 */
window.hideAbout = function() {
    document.getElementById('about-overlay').style.display = 'none';
};

/**
 * Show benchmark instructions overlay
 */
window.showBenchmarkInstructions = function() {
    document.getElementById('benchmark-instructions-overlay').style.display = 'flex';
};

/**
 * Hide benchmark instructions overlay
 */
window.hideBenchmarkInstructions = function() {
    document.getElementById('benchmark-instructions-overlay').style.display = 'none';
};

/**
 * Copy text to clipboard
 */
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show temporary success message
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
    });
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for WCL analyzer
    const wclInput = document.getElementById('wcl-report');
    if (wclInput) {
        wclInput.addEventListener('blur', function() {
            window.loadReport();
        });
        wclInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                window.loadReport();
            }
        });
    } else {
        console.error('Could not find wcl-report input element!');
    }

    // Add hashchange listener for browser back/forward
    window.addEventListener('hashchange', function() {
        const route = parseHash();
        if (route) {
            loadFromHash();
        } else {
            // No valid route, go home
            window.goHome();
        }
    });

    // Check if we have a hash route on page load
    if (window.location.hash) {
        loadFromHash();
    }

    // Initialize benchmark toggle state
    initBenchmarkToggle();
});

function updateRacialOptions() {
    const racial = document.getElementById('racial').value;
    const trollBerserkingCheckbox = document.getElementById('troll-berserking');
    const trollBerserkingGroup = trollBerserkingCheckbox.closest('.checkbox-group');

    // Show/hide Troll Berserking option
    if (racial === 'troll') {
        trollBerserkingGroup.style.display = 'block';
    } else {
        trollBerserkingGroup.style.display = 'none';
        trollBerserkingCheckbox.checked = false;
    }

    calculate();
}

function updateTalentOptions() {
    const talentTier5 = document.getElementById('talent-tier5').value;
    const powerInfusionCheckbox = document.getElementById('power-infusion-active');
    const powerInfusionGroup = powerInfusionCheckbox.closest('.checkbox-group');

    // Show/hide Power Infusion Active option
    if (talentTier5 === 'power-infusion') {
        powerInfusionGroup.style.display = 'block';
    } else {
        powerInfusionGroup.style.display = 'none';
        powerInfusionCheckbox.checked = false;
    }

    calculate();
}

function calculate() {
    // Get input values
    const hasteRating = parseFloat(document.getElementById('haste-rating').value) || 0;
    const shadowform = document.getElementById('shadowform').checked;
    const racial = document.getElementById('racial').value;
    const trollBerserking = document.getElementById('troll-berserking').checked;
    const bloodlust = document.getElementById('bloodlust').checked;
    const powerInfusion = document.getElementById('power-infusion-active').checked;
    const t14_4pc = document.getElementById('t14-4pc').checked;

    // Calculate haste percentage from rating
    let hastePercent = (hasteRating / HasteUtils.HASTE_RATING_PER_PERCENT);

    // Add racial bonuses
    if (racial === 'goblin') {
        hastePercent += 1; // 1% passive
    }

    // Add temporary buffs (multiplicative)
    let hasteMultiplier = 1 + (hastePercent / 100);

    // Shadowform (5% haste - multiplicative)
    if (shadowform) {
        hasteMultiplier *= 1.05; // 5% from Shadowform
    }

    if (trollBerserking && racial === 'troll') {
        hasteMultiplier *= 1.20; // 20% from Berserking
    }

    if (bloodlust) {
        hasteMultiplier *= 1.30; // 30% from Bloodlust/Heroism
    }

    if (powerInfusion) {
        hasteMultiplier *= 1.20; // 20% from Power Infusion
    }

    // Calculate final haste percentage
    const finalHastePercent = (hasteMultiplier - 1) * 100;

    // Update display
    updateHasteDisplay(finalHastePercent, hasteMultiplier);
    updateDoTDurations(hasteMultiplier, t14_4pc);
    updateCastTimes(hasteMultiplier);
    updateInsanityWindow(hasteMultiplier, t14_4pc);
}

function updateHasteDisplay(hastePercent, hasteMultiplier) {
    // Round up haste percentage (matches in-game display)
    const displayHaste = roundUp(hastePercent);
    document.getElementById('total-haste').textContent = displayHaste.toFixed(2) + '%';

    // Calculate GCD
    const gcd = Math.max(HasteUtils.BASE_GCD / hasteMultiplier, HasteUtils.MIN_GCD);
    document.getElementById('gcd').textContent = gcd.toFixed(2) + 's';
}

function updateDoTDurations(hasteMultiplier, t14_4pc) {
    // Shadow Word: Pain
    const swpResult = calculateDoTDuration(DOTS.swp, hasteMultiplier, t14_4pc);
    document.getElementById('swp-duration').textContent =
        `${swpResult.duration.toFixed(2)}s (${swpResult.ticks} ticks)`;

    // Vampiric Touch
    const vtResult = calculateDoTDuration(DOTS.vt, hasteMultiplier, t14_4pc);
    document.getElementById('vt-duration').textContent =
        `${vtResult.duration.toFixed(2)}s (${vtResult.ticks} ticks)`;

    // Devouring Plague (not affected by T14 4pc)
    const dpResult = calculateDoTDuration(DOTS.dp, hasteMultiplier, false);
    document.getElementById('dp-duration').textContent =
        `${dpResult.duration.toFixed(2)}s (${dpResult.ticks} ticks)`;
}

function calculateDoTDuration(dot, hasteMultiplier, t14_4pc) {
    // In MoP, haste adds extra ticks to DoTs
    // The tick interval is reduced by haste
    const hastedTickInterval = dot.baseTickInterval / hasteMultiplier;

    // Calculate how many ticks fit in the base duration
    const ticksInBaseDuration = Math.floor(dot.baseDuration / hastedTickInterval);

    // The actual number of ticks (minimum is base ticks)
    let totalTicks = Math.max(ticksInBaseDuration, dot.baseTicks);

    // T14 4-piece adds +1 tick to SWP and VT
    if (t14_4pc) {
        totalTicks += 1;
    }

    // Duration extends to accommodate all ticks
    // In MoP, DoTs would gain extra ticks and duration would extend
    const actualDuration = totalTicks * hastedTickInterval;

    return {
        duration: actualDuration,
        ticks: totalTicks,
        tickInterval: hastedTickInterval
    };
}

function updateCastTimes(hasteMultiplier) {
    // Vampiric Touch
    const vtCast = CASTS.vampiricTouch.baseCastTime / hasteMultiplier;
    document.getElementById('vt-cast').textContent =
        `${vtCast.toFixed(2)}s`;

    // Mind Blast
    const mbCast = CASTS.mindBlast.baseCastTime / hasteMultiplier;
    document.getElementById('mb-cast').textContent =
        `${mbCast.toFixed(2)}s`;

    // Mind Flay (channel)
    const mfDuration = CASTS.mindFlay.baseDuration / hasteMultiplier;
    const mfTicks = CASTS.mindFlay.baseTicks;
    document.getElementById('mf-cast').textContent =
        `${mfDuration.toFixed(2)}s (${mfTicks} ticks)`;
}

function updateInsanityWindow(hasteMultiplier, t14_4pc) {
    // Calculate components of the Insanity Window
    const mbCast = CASTS.mindBlast.baseCastTime / hasteMultiplier;
    const gcd = Math.max(HasteUtils.BASE_GCD / hasteMultiplier, HasteUtils.MIN_GCD);
    const mfDuration = CASTS.mindFlay.baseDuration / hasteMultiplier;

    // Calculate DP duration
    const dpResult = calculateDoTDuration(DOTS.dp, hasteMultiplier, false);

    // Calculate how many full MF casts fit during DP
    const mfCastsCount = Math.floor(dpResult.duration / mfDuration);

    // Calculate when the last MF snapshot should start (just before DP expires)
    // We want to clip and restart MF to get one last Insanity snapshot
    const lastMfStart = dpResult.duration - (mfDuration * 0.3); // Start ~30% through last possible MF

    // Total time from MB cast start to when we can cast MB again
    // MB cast -> DP GCD -> MF casts during DP -> final MF snapshot -> wait for MB CD
    const mbCooldown = 8; // Mind Blast has 8 second cooldown

    // Time from MB cast start to DP application
    const timeToDP = mbCast;

    // Time from DP application to DP expiry
    const dpWindow = dpResult.duration;

    // We need to finish channeling before next MB
    // Last MF finishes at: mbCast + gcd + lastMfStart + mfDuration
    const lastMfEnd = mbCast + gcd + lastMfStart + mfDuration;

    // MB comes off CD at: mbCast + mbCooldown
    const mbReadyAt = mbCast + mbCooldown;

    // We can cast MB when it's off CD AND we're not channeling
    const nextMbStart = Math.max(mbReadyAt, lastMfEnd) + gcd;

    // Total Insanity Window
    const insanityWindow = nextMbStart;

    // If we need to refresh both dots, add VT cast + SW:P GCD
    const vtCast = CASTS.vampiricTouch.baseCastTime / hasteMultiplier;
    const bothDotsWindow = insanityWindow + vtCast + gcd;

    // Update display
    document.getElementById('insanity-window-single').textContent = insanityWindow.toFixed(2) + 's';
    document.getElementById('insanity-window-both').textContent = bothDotsWindow.toFixed(2) + 's';

    // Update details
    document.getElementById('insanity-mb-cast').textContent = mbCast.toFixed(2) + 's';
    document.getElementById('insanity-dp-gcd').textContent = gcd.toFixed(2) + 's';
    document.getElementById('insanity-dp-duration').textContent =
        `${dpResult.duration.toFixed(2)}s (${dpResult.ticks} ticks)`;
    document.getElementById('insanity-mf-count').textContent = mfCastsCount + ' full + 1 clip';
    document.getElementById('insanity-total').textContent = insanityWindow.toFixed(2) + 's';
}

window.toggleInsanityDetails = function toggleInsanityDetails() {
    const details = document.getElementById('insanity-details');
    const button = document.querySelector('.details-toggle');

    if (details.style.display === 'none') {
        details.style.display = 'block';
        button.textContent = 'Hide Details';
    } else {
        details.style.display = 'none';
        button.textContent = 'Show Details';
    }
}

// Helper function to format time
function formatTime(seconds) {
    return seconds.toFixed(2) + 's';
}

// Helper function to calculate haste breakpoints (for future use)
function calculateBreakpoints(dot, targetTicks) {
    const breakpoints = [];

    for (let extraTicks = 1; extraTicks <= targetTicks; extraTicks++) {
        const requiredTicks = dot.baseTicks + extraTicks;
        const requiredTickInterval = dot.baseDuration / requiredTicks;
        const requiredHasteMultiplier = dot.baseTickInterval / requiredTickInterval;
        const requiredHastePercent = (requiredHasteMultiplier - 1) * 100;

        breakpoints.push({
            ticks: requiredTicks,
            hastePercent: requiredHastePercent,
            hasteRating: Math.ceil(requiredHastePercent * HasteUtils.HASTE_RATING_PER_PERCENT)
        });
    }

    return breakpoints;
}

// Tab switching functionality
window.switchTab = function switchTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    // Show selected tab content
    document.getElementById(tabName + '-tab').classList.add('active');

    // Add active class to the button that matches this tab
    tabButtons.forEach(button => {
        if (button.getAttribute('onclick').includes(`'${tabName}'`)) {
            button.classList.add('active');
        }
    });
}

// ====== WARCRAFT LOGS ANALYZER (WCL v2 API) ======
// Uses client credentials - no user login required!

// Store loaded report data globally
let currentReportData = null;
let currentEncounters = null;

// Helper function to calculate DoT uptimes
function calculateDotUptimes(events, fight, fightDuration) {
    // MoP Shadow Priest DoT spell IDs
    const dotSpells = {
        589: 'Shadow Word: Pain',
        34914: 'Vampiric Touch',
        2944: 'Devouring Plague'
    };

    const uptimes = {};

    Object.keys(dotSpells).forEach(spellIdStr => {
        const spellId = parseInt(spellIdStr);

        // Find all debuff events for this spell
        const debuffEvents = events.filter(e =>
            e.abilityGameID === spellId &&
            (e.type === 'applydebuff' || e.type === 'refreshdebuff' || e.type === 'removedebuff')
        );

        let totalUptime = 0;
        let currentStart = null;

        debuffEvents.forEach(event => {
            if (event.type === 'applydebuff' || event.type === 'refreshdebuff') {
                // DoT applied or refreshed
                if (!currentStart) {
                    currentStart = event.timestamp;
                }
            } else if (event.type === 'removedebuff') {
                // DoT fell off
                if (currentStart) {
                    totalUptime += (event.timestamp - currentStart);
                    currentStart = null;
                }
            }
        });

        // If DoT is still active at fight end
        if (currentStart) {
            totalUptime += (fight.endTime - currentStart);
        }

        // Calculate percentage
        const uptimePercent = (totalUptime / fightDuration) * 100;
        uptimes[spellId] = {
            uptime: totalUptime,
            duration: fightDuration,
            percent: Math.round(uptimePercent * 10) / 10 // Round to 1 decimal
        };
    });

    return uptimes;
}

// Make loadReport available globally
window.loadReport = async function loadReport() {
    if (typeof window.wclV2Service === 'undefined') {
        console.error('wclV2Service is not defined! Check if wcl-v2-service.js loaded correctly.');
        alert('Error: WCL service not loaded. Please refresh the page.');
        return;
    }

    const input = document.getElementById('wcl-report').value.trim();
    const reportId = window.wclV2Service.extractReportId(input);

    if (!reportId) {
        alert('Please enter a valid WCL report ID or URL');
        return;
    }

    const loadingIndicator = document.getElementById('loading-indicator');
    const playerSelect = document.getElementById('player-select');
    const encounterSelect = document.getElementById('encounter-select');
    const analyzeBtn = document.getElementById('analyze-btn');

    loadingIndicator.style.display = 'block';
    playerSelect.disabled = true;
    encounterSelect.disabled = true;
    analyzeBtn.disabled = true;

    try {
        // Fetch report data from WCL v2 API (authentication happens automatically)
        const reportData = await window.wclV2Service.fetchReport(reportId);
        currentReportData = reportData;

        // Find Priests (spec will be validated when analyzing casts)
        const priests = window.wclV2Service.getShadowPriests(reportData);

        if (priests.length === 0) {
            alert('No Priests found in this report!');
            return;
        }

        // Populate player dropdown
        playerSelect.innerHTML = '<option value="">Select a player</option>' +
            priests.map(player =>
                `<option value="${player.name}">${player.name}</option>`
            ).join('');
        playerSelect.disabled = false;

        // Find boss encounters
        const encounters = window.wclV2Service.getBossEncounters(reportData);

        if (encounters.length === 0) {
            alert('No boss encounters found in this report!');
            return;
        }

        // Store encounters globally for boss icon updates
        currentEncounters = encounters;

        // Populate encounter dropdown
        encounterSelect.innerHTML = '<option value="">Select an encounter</option>' +
            encounters.map(fight => {
                const duration = Math.round((fight.endTime - fight.startTime) / 1000);
                const killStatus = fight.kill ? '✓' : '✗';
                const statusClass = fight.kill ? 'class="kill-option"' : 'class="wipe-option"';
                return `<option value="${fight.id}" ${statusClass}>${killStatus} ${fight.name} (${duration}s)</option>`;
            }).join('');
        encounterSelect.disabled = false;

        // Add change listener for boss icon (only once)
        if (!encounterSelect.hasAttribute('data-icon-listener-attached')) {
            encounterSelect.setAttribute('data-icon-listener-attached', 'true');
            encounterSelect.addEventListener('change', (e) => {
                updateBossIcon(e.target.value, currentEncounters, 'boss-icon', 'boss-icon-container');
            });
        }

        // Clear boss icon on initial load (no encounter selected yet)
        updateBossIcon(null, null, 'boss-icon', 'boss-icon-container');

        analyzeBtn.disabled = false;

    } catch (error) {
        console.error('Error loading report:', error);
        alert('Error loading report: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Identify if an enemy is a boss based on encounter data
function identifyBoss(enemyName, fight) {
    // Trash pulls (no encounterID) have no bosses
    if (!fight.encounterID || fight.encounterID === 0) {
        return false;
    }

    // Try boss database first (most reliable)
    if (typeof window.isBossNPC === 'function') {
        const inDatabase = window.isBossNPC(enemyName, fight.encounterID);
        if (inDatabase) {
            return true;
        }
        // If encounter is in database but NPC not found, it's an add
        if (window.BOSS_DATABASE && window.BOSS_DATABASE[fight.encounterID]) {
            return false;
        }
    }

    // Fallback to name matching for unknown encounters
    // Simple name matching: does enemy name match fight name?
    if (enemyName === fight.name) {
        return true;
    }

    // Partial matching: does fight name contain enemy name or vice versa?
    if (fight.name.includes(enemyName) || enemyName.includes(fight.name)) {
        return true;
    }

    return false;
}

// Extract unique targets from events and enrich with names from report enemies
function extractTargetsFromEvents(events, reportData, fight) {
    const targets = new Map();

    // Build enemy ID -> name mapping from report data
    const enemyNames = new Map();
    if (reportData && reportData.masterData && reportData.masterData.enemies) {
        reportData.masterData.enemies.forEach(enemy => {
            enemyNames.set(enemy.id, enemy.name);
        });
    }

    // First pass: track damage and instances per target ID (not instance)
    const targetData = new Map();
    events.forEach(event => {
        if (event.type === 'damage' && event.targetID && event.targetID > 0) {
            if (!targetData.has(event.targetID)) {
                targetData.set(event.targetID, {
                    totalDamage: 0,
                    instances: new Set()
                });
            }
            const data = targetData.get(event.targetID);
            data.totalDamage += (event.amount || 0);
            data.instances.add(event.targetInstance || 0);
        }
    });

    // Second pass: build grouped target list (group by ID, not instance)
    targetData.forEach((data, targetID) => {
        // Skip targets we dealt 0 damage to
        if (data.totalDamage === 0) {
            return;
        }

        const targetName = enemyNames.get(targetID) || `Unknown Target`;
        const instanceCount = data.instances.size;

        // Identify if this is a boss
        const isBoss = identifyBoss(targetName, fight);

        // Build display name with boss/add label
        let displayName = targetName;
        if (instanceCount > 1) {
            displayName += ` (${instanceCount})`;
        }

        // Add boss indicator if this is a boss encounter (💀 for boss, nothing for adds)
        if (fight.encounterID > 0 && isBoss) {
            displayName += ' 💀';
        }

        targets.set(targetID, {
            id: targetID,
            name: targetName,
            displayName: displayName,
            instanceCount: instanceCount,
            instances: Array.from(data.instances),
            totalDamage: data.totalDamage,
            isBoss: isBoss
        });
    });

    const targetsList = Array.from(targets.values());

    // Debug logging for boss detection
    console.log('=== BOSS DETECTION RESULTS ===');
    console.log(`Fight: ${fight.name} (encounterID: ${fight.encounterID})`);
    console.log(`Total targets found: ${targetsList.length}`);

    const bosses = targetsList.filter(t => t.isBoss);
    const adds = targetsList.filter(t => !t.isBoss);

    console.log(`Bosses: ${bosses.length}, Adds: ${adds.length}`);
    console.log('');

    if (bosses.length > 0) {
        console.log('👑 BOSSES:');
        bosses.forEach(target => {
            console.log(`  ${target.name} - ${target.totalDamage.toLocaleString()} damage`);
        });
    }

    if (adds.length > 0) {
        console.log('⚔️  ADDS:');
        adds.forEach(target => {
            console.log(`  ${target.name} - ${target.totalDamage.toLocaleString()} damage`);
        });
    }

    if (adds.length === 0) {
        console.log('⚠️  No adds found (pure single target or adds not damaged)');
    }

    console.log('=============================');

    return targetsList;
}

// Make analyzeLog available globally
window.analyzeLog = async function analyzeLog() {
    // Use analysis page selectors if on analysis page, otherwise use landing page
    const onAnalysisPage = document.getElementById('analysis-page').style.display !== 'none';
    const playerSelect = onAnalysisPage
        ? document.getElementById('player-select-analysis')
        : document.getElementById('player-select');
    const encounterSelect = onAnalysisPage
        ? document.getElementById('encounter-select-analysis')
        : document.getElementById('encounter-select');

    if (!playerSelect.value || !encounterSelect.value) {
        alert('Please select both a player and an encounter');
        return;
    }

    if (!currentReportData) {
        alert('Please load a report first');
        return;
    }

    const playerName = playerSelect.value;
    const fightId = parseInt(encounterSelect.value);

    const loadingIndicator = document.getElementById('loading-indicator');
    const analysisLoading = document.getElementById('analysis-loading');
    const resultsSection = document.getElementById('analysis-results');

    // Show loading state (only on analysis page)
    if (onAnalysisPage) {
        analysisLoading.style.display = 'block';
    } else {
        loadingIndicator.style.display = 'block';
    }
    resultsSection.style.display = 'none';

    try {
        // Find fight object
        const fight = currentReportData.fights.find(f => f.id === fightId);

        if (!fight) {
            alert('Could not find fight data');
            return;
        }

        // Extract report ID from current data
        const reportId = window.wclV2Service.extractReportId(document.getElementById('wcl-report').value);

        // Fetch events from WCL v2 API
        const eventsData = await window.wclV2Service.fetchEvents(
            reportId,
            fightId,
            playerName,
            fight.startTime,
            fight.endTime
        );

        if (!eventsData || !eventsData.data) {
            console.error('NO EVENT DATA - eventsData:', eventsData);
            alert('No event data returned from WCL. Check console for details.');
            return;
        }

        // Fetch buff events (applybuff, removebuff, etc.)
        const buffEventsData = await window.wclV2Service.fetchBuffEvents(
            reportId,
            fightId,
            playerName,
            fight.startTime,
            fight.endTime
        );

        const events = eventsData.data;
        const buffEvents = buffEventsData.data || [];

        // Extract targets and populate target filter
        const targets = extractTargetsFromEvents(events, currentReportData, fight);
        window.allTargets = targets; // Store globally

        const targetFilter = document.getElementById('target-filter');

        // Populate target filter dropdown
        targetFilter.innerHTML = '<option value="all">All Targets</option>';
        targets.forEach(target => {
            const option = document.createElement('option');
            option.value = target.id;
            option.textContent = target.displayName;
            targetFilter.appendChild(option);
        });

        // Show/hide target filter based on number of targets
        if (targets.length <= 1) {
            targetFilter.style.display = 'none';
        } else {
            targetFilter.style.display = 'block';
        }

        // Simple analysis - count casts and damage events by spell
        const castCounts = {};
        const damageCounts = {};
        let castEventCount = 0;
        let damageEventCount = 0;

        events.forEach((event) => {
            if (!event.abilityGameID) return;
            const spellId = event.abilityGameID;

            if (event.type === 'cast') {
                castEventCount++;
                if (!castCounts[spellId]) castCounts[spellId] = { name: spellId, count: 0 };
                castCounts[spellId].count++;
            } else if (event.type === 'damage') {
                damageEventCount++;
                if (!damageCounts[spellId]) damageCounts[spellId] = { name: spellId, count: 0 };
                damageCounts[spellId].count++;
            }
        });

        // Calculate DoT uptimes
        const fightDuration = fight.endTime - fight.startTime;
        const dotUptimes = calculateDotUptimes(events, fight, fightDuration);
        window.dotUptimes = dotUptimes; // Store globally

        // Count Mind Flay ticks (damage events for Mind Flay and Mind Flay: Insanity)
        const mfTicks = (damageCounts[15407]?.count || 0) + (damageCounts[129197]?.count || 0);
        window.mfTicks = mfTicks; // Store globally

        // ❌ Removed all UI updates for mfTicks and DoT uptimes

        // Analyze casts with quality metrics (need to get talents first)
        const castsAnalyzer = new CastsAnalyzer(events, buffEvents, {
            playerDetails: eventsData.playerDetails,
            playerName: playerName,
            fightStartTime: fight.startTime,
            fightEndTime: fight.endTime
        });
        const analysisResult = castsAnalyzer.analyze();
        const casts = analysisResult.casts;
        const talents = analysisResult.talents;

        // Run pre-pull checker
        // Get player ID from the first event with a sourceID
        // All events are filtered for this player, so any sourceID is the player's ID
        const playerID = events.find(e => e.sourceID)?.sourceID || null;
        const prePullChecker = new PrePullChecker(events, buffEvents, fight.startTime, playerID, playerName, talents);
        const prePullResults = prePullChecker.analyze();

        // Add target names to casts
        const enemyNames = new Map();
        if (currentReportData && currentReportData.masterData && currentReportData.masterData.enemies) {
            currentReportData.masterData.enemies.forEach(enemy => {
                enemyNames.set(enemy.id, enemy.name);
            });
        }
        casts.forEach(cast => {
            if (cast.targetId && cast.targetId > 0) {
                cast.targetName = enemyNames.get(cast.targetId) || 'Unknown Target';
            }
        });

        // Store globally for filtering
        window.allCasts = casts;
        window.currentTalents = talents;
        window.currentFight = fight;
        window.statsCalculator = new CastStatsCalculator(casts, fight);

        // Render stats overview (Timeline view by default)
        renderStatsOverview('timeline');

        // Render talents display
        renderTalents(talents);

        // Add tier 6 talent filter button (Halo/Cascade/Divine Star)
        addTier6TalentButton(talents);

        // Render pre-pull check
        renderPrePullCheck(prePullResults);

        // Initialize current filter
        window.currentSpellFilter = 'timeline';

        // Render cast timeline
        renderCastTimeline(casts, fight);

        // Render quick overview (default to Summary view)
        renderQuickOverview();

        // Load and display benchmark comparison if enabled
        loadAndDisplayBenchmark();

        // Update API quota display
        updateQuotaDisplay();

        // Add target filter event listener
        targetFilter.addEventListener('change', () => {
            renderCastTimeline(window.allCasts, window.currentFight);

            // Update current view
            const summaryBtn = document.querySelector('[data-view="summary"]');
            if (summaryBtn && summaryBtn.classList.contains('active')) {
                renderQuickOverview();
            } else {
                renderStatsOverview('timeline');
            }
        });

        // Add boss/add filter event listeners
        const filterBoss = document.getElementById('filter-boss');
        const filterAdds = document.getElementById('filter-adds');

        if (filterBoss) {
            filterBoss.addEventListener('change', () => {
                renderCastTimeline(window.allCasts, window.currentFight);

                // Update current view
                const summaryBtn = document.querySelector('[data-view="summary"]');
                if (summaryBtn && summaryBtn.classList.contains('active')) {
                    renderQuickOverview();
                } else {
                    renderStatsOverview('timeline');
                }
            });
        }

        if (filterAdds) {
            filterAdds.addEventListener('change', () => {
                renderCastTimeline(window.allCasts, window.currentFight);

                // Update current view
                const summaryBtn = document.querySelector('[data-view="summary"]');
                if (summaryBtn && summaryBtn.classList.contains('active')) {
                    renderQuickOverview();
                } else {
                    renderStatsOverview('timeline');
                }
            });
        }

        // Hide loading, show results
        analysisLoading.style.display = 'none';
        resultsSection.style.display = 'block';
        document.getElementById('cast-timeline').style.display = 'block';

    } catch (error) {
        console.error('Error analyzing log:', error);
        alert('Error analyzing log: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
        analysisLoading.style.display = 'none';
    }
};

// ============ Pre-Pull Check Rendering ============

/**
 * Render the pre-pull check results
 */
function renderPrePullCheck(results) {
    const prepullCheck = document.getElementById('prepull-check');
    if (!prepullCheck) return;

    let html = '<div class="prepull-check-label">Pre-Pull:</div>';
    html += '<div class="prepull-check-items">';

    // Tier-90 talent check (Halo/Cascade/Divine Star)
    const tier90Status = results.tier90Talent.status;
    const tier90Name = results.tier90TalentName || 'Tier-90';
    html += `<div class="prepull-item">`;
    html += `<span class="prepull-icon ${tier90Status}"></span>`;
    if (results.tier90Talent.found) {
        const spellName = results.tier90Talent.spellName || tier90Name;
        html += `<span class="prepull-item-text ${tier90Status}">${spellName} (+${results.tier90Talent.timing.toFixed(1)}s)</span>`;
    } else {
        html += `<span class="prepull-item-text ${tier90Status}">${tier90Name} (missing)</span>`;
    }
    html += `</div>`;

    // Mind Spike check
    const msStatus = results.mindSpike.status;
    html += `<div class="prepull-item">`;
    html += `<span class="prepull-icon ${msStatus}"></span>`;
    if (results.mindSpike.found) {
        html += `<span class="prepull-item-text ${msStatus}">Mind Spike (+${results.mindSpike.timing.toFixed(1)}s)</span>`;
    } else {
        html += `<span class="prepull-item-text ${msStatus}">Mind Spike (missing)</span>`;
    }
    html += `</div>`;

    // Potion check
    const potionStatus = results.potion.status;
    html += `<div class="prepull-item">`;
    html += `<span class="prepull-icon ${potionStatus}"></span>`;
    if (results.potion.found) {
        const potionTiming = results.potion.timing >= 0 ? `+${results.potion.timing.toFixed(1)}s` : `${results.potion.timing.toFixed(1)}s`;
        html += `<span class="prepull-item-text ${potionStatus}">Potion (${potionTiming})</span>`;
    } else {
        html += `<span class="prepull-item-text ${potionStatus}">Potion (missing)</span>`;
    }
    html += `</div>`;

    html += '</div>';

    prepullCheck.innerHTML = html;
}

// ============ Cast Timeline Rendering ============

/**
 * Render the cast timeline
 */
/**
 * Update boss/add damage stats display
 */
function updateBossAddStats(casts, fight) {
    const statsDiv = document.getElementById('boss-add-stats');
    if (!statsDiv) return;

    // Only show for boss encounters
    if (!fight || !fight.encounterID || fight.encounterID === 0) {
        statsDiv.style.display = 'none';
        return;
    }

    // Calculate boss and add damage
    let bossDamage = 0;
    let addDamage = 0;

    casts.forEach(cast => {
        // AoE spells (Halo, Cascade, Divine Star) hit multiple targets
        // Need to check each damage instance to properly attribute damage
        const isAoESpell = [120644, 127632, 122121].includes(cast.spellId);

        if (isAoESpell && cast.instances && cast.instances.length > 0) {
            // For AoE spells, attribute each damage instance to boss or add
            cast.instances.forEach(instance => {
                const instanceTarget = window.allTargets?.find(t => t.id === instance.targetId);
                const instanceIsBoss = instanceTarget?.isBoss || false;
                const instanceDamage = instance.amount || 0;

                if (instanceIsBoss) {
                    bossDamage += instanceDamage;
                } else {
                    addDamage += instanceDamage;
                }
            });
        } else {
            // Non-AoE spells: use primary target
            const target = window.allTargets?.find(t => t.id === cast.targetId);
            const isBoss = target?.isBoss || false;
            const damage = cast.totalDamage || 0;

            if (isBoss) {
                bossDamage += damage;
            } else {
                addDamage += damage;
            }
        }
    });

    const totalDamage = bossDamage + addDamage;

    if (totalDamage === 0) {
        statsDiv.style.display = 'none';
        return;
    }

    const bossPercent = ((bossDamage / totalDamage) * 100).toFixed(1);
    const addPercent = ((addDamage / totalDamage) * 100).toFixed(1);

    // Format damage numbers with commas
    const formatDamage = (dmg) => dmg.toLocaleString('en-US');

    statsDiv.innerHTML = `
        <div class="stat-group">
            <span class="stat-label">Boss:</span>
            <span class="stat-value boss-value">${formatDamage(bossDamage)} (${bossPercent}%)</span>
        </div>
        <span style="color: #666;">|</span>
        <div class="stat-group">
            <span class="stat-label">Adds:</span>
            <span class="stat-value add-value">${formatDamage(addDamage)} (${addPercent}%)</span>
        </div>
    `;

    statsDiv.style.display = 'flex';
}

function renderCastTimeline(casts, fight) {
    const castList = document.getElementById('cast-list');
    castList.innerHTML = '';

    if (!casts || casts.length === 0) {
        castList.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No casts found</p>';
        return;
    }

    // Apply target filter
    const targetFilter = document.getElementById('target-filter');
    const selectedTarget = targetFilter ? targetFilter.value : 'all';

    let filteredCasts = casts;
    if (selectedTarget && selectedTarget !== 'all') {
        const targetId = Number(selectedTarget);
        filteredCasts = casts.filter(cast => {
            return cast.targetId === targetId;
        });
    }

    // Apply boss/add filter
    const filterBoss = document.getElementById('filter-boss');
    const filterAdds = document.getElementById('filter-adds');
    const showBoss = filterBoss ? filterBoss.checked : true;
    const showAdds = filterAdds ? filterAdds.checked : true;

    // Calculate boss/add damage totals (before boss/add filtering)
    updateBossAddStats(filteredCasts, fight);

    // Filter by boss/add if needed
    if (!showBoss || !showAdds) {
        filteredCasts = filteredCasts.filter(cast => {
            // Always show targetless spells (buffs, cooldowns, self-casts)
            if (!cast.targetId || cast.targetId <= 0) {
                return true;
            }

            // AoE spells (Halo, Cascade, Divine Star) hit multiple targets
            // Check if ANY damage instance hits a target matching the filter
            const isAoESpell = [120644, 127632, 122121].includes(cast.spellId);

            if (isAoESpell && cast.instances && cast.instances.length > 0) {
                // Check each damage instance's target
                for (const instance of cast.instances) {
                    const instanceTarget = window.allTargets?.find(t => t.id === instance.targetId);
                    const instanceIsBoss = instanceTarget?.isBoss || false;

                    // If this instance hit a valid target, show the cast
                    if (showBoss && instanceIsBoss) return true;
                    if (showAdds && !instanceIsBoss) return true;
                }
                // None of the instances hit valid targets
                return false;
            }

            // Non-AoE spells: check primary target
            const target = window.allTargets?.find(t => t.id === cast.targetId);
            const isBoss = target?.isBoss || false;

            if (isBoss && !showBoss) return false;
            if (!isBoss && !showAdds) return false;
            return true;
        });
    }

    console.log(`Rendering ${filteredCasts.length} of ${casts.length} casts (filtered by target: ${selectedTarget}, boss: ${showBoss}, adds: ${showAdds})`);

    if (filteredCasts.length === 0) {
        castList.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No casts found for selected filters</p>';
        return;
    }

    filteredCasts.forEach((cast, index) => {
        const castElement = createCastElement(cast, index, fight);
        castList.appendChild(castElement);
    });

    // Setup filter handlers
    setupCastFilters();
}

/**
 * Create a single cast element (Wrath-style compact layout)
 */
function createCastElement(cast, index, fight) {
    const div = document.createElement('div');
    div.className = 'cast-item';
    div.dataset.castIndex = index;

    // Get quality status
    const overallStatus = statHighlights.overall(cast);
    const statusClass = statHighlights.getStatusClass(overallStatus);
    div.dataset.status = statusClass;

    // Format timestamp (relative to fight start, like Wrath: "00:00.75")
    const relativeSeconds = (cast.castStart - fight.startTime) / 1000;
    const minutes = Math.floor(relativeSeconds / 60);
    const seconds = (relativeSeconds % 60).toFixed(2);
    const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(5, '0')}`;

    // Format damage
    const damageText = cast.totalDamage > 0 ? cast.totalDamage.toLocaleString() : '0';

    // Format hits - just show actual hit count from instances
    // Hide for spells that are always 1 hit (SW:D, Mind Blast) or deal no damage (buffs)
    const totalHits = cast.instances ? cast.instances.length : 0;
    const hitsText = `${totalHits}`;
    const showHits = cast.totalDamage > 0 && ![32379, 8092].includes(cast.spellId); // Hide for SW:D, MB, and non-damaging spells

    // Get target name (if available)
    const targetText = cast.targetName || '';

    // Get icon for this spell
    const iconPath = getSpellIcon(cast.spellId);
    const iconHTML = iconPath
        ? `<img src="${iconPath}" alt="${cast.name}">`
        : '?';

    // Build buff icons HTML (summary buffs in collapsed view)
    // Always render the container to maintain layout, even if empty
    let buffIconsHTML = '<div class="cast-buff-icons">';
    if (cast.summaryBuffs && cast.summaryBuffs.length > 0) {
        console.log(`Cast ${cast.name} at ${timeText} has ${cast.summaryBuffs.length} summary buffs:`, cast.summaryBuffs);
        cast.summaryBuffs.forEach(buff => {
            const buffIconPath = getSpellIcon(buff.id);
            console.log(`  Buff ${buff.name} (${buff.id}): icon path = ${buffIconPath}`);
            if (buffIconPath) {
                buffIconsHTML += `<div class="buff-icon" title="${buff.name}"><img src="${buffIconPath}" alt="${buff.name}"></div>`;
            }
        });
    } else {
        // Debug: log when there are no buffs
        if (index < 3) { // Only log first 3 casts to avoid spam
            console.log(`Cast ${cast.name} at ${timeText} has NO summary buffs. cast.buffs:`, cast.buffs);
        }
    }
    buffIconsHTML += '</div>';

    // Build compact HTML (Wrath-style)
    div.innerHTML = `
        <div class="cast-header" onclick="toggleCastDetails(${index})">
            <span class="cast-status ${statusClass}"></span>
            <div class="cast-time">${timeText}</div>
            <div class="cast-icon-wrapper">
                <div class="cast-icon">${iconHTML}</div>
            </div>
            <div class="cast-main-content">
                <div class="cast-info">
                    <div class="cast-name-row">
                        <span class="cast-spell-name">${cast.name}</span>${targetText ? `<span class="cast-target"> ${targetText}</span>` : ''}
                    </div>
                </div>
                <div class="cast-metrics">
                    ${buffIconsHTML}
                    <div class="cast-stats">
                        ${showHits ? `<div class="cast-stat-line"><span class="cast-stat-label">Hits:</span> ${hitsText}</div>` : ''}
                        ${cast.totalDamage > 0 ? `<div class="cast-stat-line"><span class="cast-stat-label">Damage:</span> ${damageText}</div>` : ''}
                    </div>
                </div>
            </div>
            <span class="cast-expand-icon">▶</span>
        </div>
        <div class="cast-details">
            ${createCastDetailsHTML(cast, fight)}
        </div>
    `;

    return div;
}

/**
 * Create the detailed cast information HTML (Wrath-style)
 */
function createCastDetailsHTML(cast, fight) {
    let html = '<div class="cast-details-section">';
    html += '<div class="cast-details-grid">';

    // Cast Time / Duration
    // For DoTs, this is the duration of the DoT effect (including pandemic)
    // For other spells, this is the cast time
    // Skip Cast Time for Mind Flay - we show Tick Time instead
    const isMindFlay = [15407, 129197].includes(cast.spellId);

    if (!isMindFlay) {
        const isDoT = cast.hastedTickInterval !== undefined;
        const timeLabel = isDoT ? 'Duration:' : 'Cast Time:';
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">${timeLabel}</span>
                <span class="cast-details-value">${(cast.castTimeMs / 1000).toFixed(2)}s</span>
            </div>
        `;
    }

    // Tick Interval for Mind Flay (time between ticks)
    if (isMindFlay && cast.actualTickInterval !== undefined) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Tick Interval:</span>
                <span class="cast-details-value">${cast.actualTickInterval.toFixed(0)}ms</span>
            </div>
        `;
    }

    // Haste removed - not useful for players

    // Tick Interval removed - not useful for players

    if (cast.expectedTicks) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Expected Ticks:</span>
                <span class="cast-details-value">${cast.expectedTicks} ticks</span>
            </div>
        `;
    }

    // Delay (if available) - Skip for Mind Flay
    if (cast.nextCastLatency !== undefined && !isMindFlay) {
        const status = statHighlights.castLatency(cast);
        const cssClass = statHighlights.getTextClass(status);
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Delay:</span>
                <span class="cast-details-value ${cssClass}">${cast.nextCastLatency}ms</span>
            </div>
        `;
    }

    // Mind Blast Cooldown Warning
    if (cast.timeOffCooldown && cast.timeOffCooldown > 0) {
        const status = statHighlights.cooldownUsage(cast);
        const cssClass = statHighlights.getTextClass(status);
        const severity = cast.timeOffCooldown > 5000 ? '⚠️ CRITICAL:' : 'MB Available:';
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">${severity}</span>
                <span class="cast-details-value ${cssClass}">MB ready ${(cast.timeOffCooldown / 1000).toFixed(1)}s ago</span>
            </div>
        `;
    }

    // Devouring Plague Quality (Orb count and timing)
    // Only show when there's an actual issue (< 3 orbs or status is not optimal)
    if (cast.dpQuality && cast.spellId === 2944) {
        const status = cast.dpQuality.status;
        const cssClass = status === 'optimal' ? 'table-accent' :
                        status === 'notice' ? 'text-notice' :
                        'text-warning';

        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Orb Count:</span>
                <span class="cast-details-value ${cssClass}">${cast.dpQuality.orbCount} / 3</span>
            </div>
        `;

        // Only show DP Quality message if there's an issue
        if (cast.dpQuality.orbCount < 3 || status !== 'optimal') {
            html += `
                <div class="cast-details-item">
                    <span class="cast-details-label">DP Quality:</span>
                    <span class="cast-details-value ${cssClass}">${cast.dpQuality.message}</span>
                </div>
            `;
        }
    }

    // DoT Refresh Quality (Pandemic-aware for MoP) - SW:P and VT only
    if (cast.dotQuality && [589, 34914].includes(cast.spellId)) {
        const status = statHighlights.dotRefresh(cast);
        const cssClass = statHighlights.getTextClass(status);

        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Refresh Quality:</span>
                <span class="cast-details-value ${cssClass}">${cast.dotQuality.message}</span>
            </div>
        `;

        // Show DPS lost if applicable
        if (cast.dotQuality.dpsLost > 0) {
            html += `
                <div class="cast-details-item">
                    <span class="cast-details-label">DPS Lost:</span>
                    <span class="cast-details-value text-warning">~${cast.dotQuality.dpsLost.toFixed(1)}</span>
                </div>
            `;
        }
    } else if ([589, 34914].includes(cast.spellId)) {
        // First cast of this DoT
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Refresh Quality:</span>
                <span class="cast-details-value">Initial cast</span>
            </div>
        `;
    }

    // Pandemic indicator (show carryover time)
    if (cast.pandemicRefresh && cast.pandemicCarryover) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Pandemic:</span>
                <span class="cast-details-value table-accent">+${(cast.pandemicCarryover / 1000).toFixed(1)}s carried over</span>
            </div>
        `;
    }

    // Mind Flay wasted channel time
    if (cast.wastedChannelTime !== undefined && [15407, 129197].includes(cast.spellId)) {
        // Determine quality based on wasted time
        let cssClass = 'table-accent'; // green (good)
        if (cast.wastedChannelTime >= 300) {
            cssClass = 'text-error'; // red (bad)
        } else if (cast.wastedChannelTime >= 200) {
            cssClass = 'text-warning'; // orange (warning)
        }

        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Wasted Time:</span>
                <span class="cast-details-value ${cssClass}">${cast.wastedChannelTime.toFixed(0)}ms since last tick</span>
            </div>
        `;
    }

    // Clipped early (for channels)
    if (cast.clippedEarly !== undefined) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Clipped early:</span>
                <span class="cast-details-value ${cast.clippedEarly ? 'text-notice' : 'table-accent'}">${cast.clippedEarly ? 'true' : 'false'}</span>
            </div>
        `;
    } else if ([15407, 129197, 48045].includes(cast.spellId)) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Clipped early:</span>
                <span class="cast-details-value table-accent">false</span>
            </div>
        `;
    }

    // Optimal clip (Insanity pandemic optimization)
    if (cast.optimalClip) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Optimization:</span>
                <span class="cast-details-value table-accent">${cast.clipReason}</span>
            </div>
        `;
    }

    // Missed Insanity optimization error
    if (cast.missedInsanityOptimization) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Error:</span>
                <span class="cast-details-value text-warning">${cast.insanityOptimizationError}</span>
            </div>
        `;
    }

    html += '</div></div>';

    // Buffs section (detailed buffs in expanded view)
    if (cast.detailBuffs && cast.detailBuffs.length > 0) {
        html += '<div class="cast-details-section">';
        html += '<h4>Buffs:</h4>';
        html += '<div class="cast-detail-buffs">';

        cast.detailBuffs.forEach(buff => {
            const buffIconPath = getSpellIcon(buff.id);
            if (buffIconPath) {
                html += `
                    <div class="detail-buff-item">
                        <div class="buff-icon" title="${buff.name}">
                            <img src="${buffIconPath}" alt="${buff.name}">
                        </div>
                        <span class="buff-name">${buff.name}</span>
                    </div>
                `;
            }
        });

        html += '</div></div>';
    }

    // Hits section (like Wrath)
    if (cast.instances && cast.instances.length > 0) {
        html += '<div class="cast-details-section">';
        html += '<h4>Hits:</h4>';
        html += '<div class="cast-hits-list">';

        cast.instances.forEach(instance => {
            // Format timestamp
            const relativeSeconds = (instance.timestamp - fight.startTime) / 1000;
            const minutes = Math.floor(relativeSeconds / 60);
            const seconds = (relativeSeconds % 60).toFixed(2);
            const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(5, '0')}`;

            // Format damage with resist info
            let damageText = instance.amount.toLocaleString();
            if (instance.resisted) {
                damageText = `0 (R: ${instance.amount})`;
            } else if (instance.critical) {
                damageText += ' (Crit)';
            }

            // Add distance info for projectile spells (Halo, Cascade, Divine Star)
            let distanceInfo = '';
            if (instance.distance !== undefined) {
                // Halo optimal range: 22-30 yards (28 is best)
                // >30 yards can happen due to large boss hitboxes (edge hit vs center damage)
                let distanceClass = '';
                if (cast.spellId === 120644) { // Halo
                    if (instance.distance >= 22 && instance.distance <= 30) {
                        distanceClass = ' optimal'; // Green: optimal range
                    } else if (instance.distance >= 17 && instance.distance < 22) {
                        distanceClass = ' suboptimal'; // Orange: poor but acceptable
                    } else if (instance.distance > 30) {
                        distanceClass = ' suboptimal'; // Orange: likely hitbox weirdness
                    } else {
                        distanceClass = ' very-bad'; // Red: very bad (0-17 yards - too close)
                    }
                }
                distanceInfo = ` <span class="cast-hit-distance${distanceClass}">${instance.distance} yards</span>`;
            }

            html += `
                <div class="cast-hit-item">
                    <span class="cast-hit-time">${timeText}</span>
                    <span class="cast-hit-target">Target</span>
                    <span class="cast-hit-damage">Damage: ${damageText}</span>${distanceInfo}
                </div>
            `;
        });

        html += '</div></div>';
    }

    return html;
}

/**
 * Toggle cast details expansion
 */
window.toggleCastDetails = function(index) {
    const castItem = document.querySelector(`[data-cast-index="${index}"]`);
    if (castItem) {
        castItem.classList.toggle('expanded');
    }
}

/**
 * Setup cast filter handlers
 */
function setupCastFilters() {
    const filterWarnings = document.getElementById('filter-warnings');
    const filterNotices = document.getElementById('filter-notices');
    const filterNormal = document.getElementById('filter-normal');

    [filterWarnings, filterNotices, filterNormal].forEach(checkbox => {
        checkbox.addEventListener('change', filterCasts);
    });
}

/**
 * Filter casts based on selected filters
 */
function filterCasts() {
    const showWarnings = document.getElementById('filter-warnings').checked;
    const showNotices = document.getElementById('filter-notices').checked;
    const showNormal = document.getElementById('filter-normal').checked;

    const castItems = document.querySelectorAll('.cast-item');

    castItems.forEach(item => {
        const status = item.dataset.status;
        let show = false;

        if (status === 'warning' && showWarnings) show = true;
        if (status === 'notice' && showNotices) show = true;
        if (status === 'normal' && showNormal) show = true;

        item.style.display = show ? 'block' : 'none';
    });
}

// ============ Stats Overview Panel ============

/**
 * Render stats overview panel
 * @param {string|number} filter - 'timeline' for all casts, or spell ID for specific spell
 */
function renderStatsOverview(filter) {
    const statsOverview = document.getElementById('stats-overview');
    if (!window.statsCalculator || !window.allCasts) {
        statsOverview.innerHTML = '<p style="color: #9ca3af;">No data available</p>';
        return;
    }

    // Get filtered casts
    let filteredCasts = window.allCasts;
    if (filter !== 'timeline') {
        const filterSpellId = parseInt(filter);
        // Mind Flay (15407) should include Mind Flay: Insanity (129197)
        if (filterSpellId === 15407) {
            filteredCasts = window.allCasts.filter(c => c.spellId === 15407 || c.spellId === 129197);
        } else {
            filteredCasts = window.allCasts.filter(c => c.spellId === filterSpellId);
        }
    }

    // Calculate stats
    const stats = window.statsCalculator.calculateStats(filteredCasts);

    // Format active time
    const activeMinutes = Math.floor(stats.activeTime / 60000);
    const activeSeconds = Math.floor((stats.activeTime % 60000) / 1000);
    const activeTimeStr = `${activeMinutes}:${String(activeSeconds).padStart(2, '0')}`;

    // Build HTML
    let html = '';

    // Basic stats
    html += createStatField('Casts', stats.castCount);

    // Crit rate when filtering by specific spell
    if (filter !== 'timeline') {
        html += createStatField('Crit Rate', stats.critRate.toFixed(1) + '%');
    }

    // Mind Blast specific stats
    if (parseInt(filter) === 8092) {
        const mbStats = window.statsCalculator.calculateMindBlastStats(filteredCasts);
        html += createStatField('Potential Casts', mbStats.potentialCasts);

        if (mbStats.avgDelay > 0) {
            html += createStatField('Avg Delay', (mbStats.avgDelay / 1000).toFixed(1) + 's');
        }
    }

    // DoT stats (if applicable)
    if (filter === 'timeline' || [589, 34914, 2944].includes(parseInt(filter))) {
        if (stats.avgDotDowntime > 0) {
            html += createStatField('Avg DoT Downtime', (stats.avgDotDowntime / 1000).toFixed(1) + 's');
        }
        if (stats.clippedDots > 0) {
            html += createStatField('Clipped DoTs', `${stats.clippedDots} (${stats.clippedDotsPercent.toFixed(1)}%)`);
        }
    }

    // Cooldown stats (MB)
    if (filter === 'timeline' && stats.avgOffCooldown > 0) {
        html += createStatField('Avg Off Cooldown', (stats.avgOffCooldown / 1000).toFixed(1) + 's');
    }

    // Channel stats (MF)
    if (filter === 'timeline' || [15407, 129197].includes(parseInt(filter))) {
        if (stats.avgMfDelay > 0) {
            // Color code based on delay: green < 100ms, yellow 101-150ms, red 151ms+
            let delayClass = '';
            if (stats.avgMfDelay < 100) {
                delayClass = 'text-good';
            } else if (stats.avgMfDelay <= 150) {
                delayClass = 'text-notice';
            } else {
                delayClass = 'text-warning';
            }
            html += createStatField('Avg MF Delay', stats.avgMfDelay.toFixed(0) + 'ms', delayClass);
        }
    }

    // Mind Flay wasted time stats (when filtering by MF)
    if ([15407, 129197].includes(parseInt(filter))) {
        const mfClipStats = window.statsCalculator.calculateMindFlayClipStats(filteredCasts);
        if (mfClipStats.clipsCount > 0) {
            // Color code based on quality status
            let wastedClass = 'table-accent'; // green (good)
            if (mfClipStats.qualityStatus === 'ERROR') {
                wastedClass = 'text-error'; // red (bad)
            } else if (mfClipStats.qualityStatus === 'WARNING') {
                wastedClass = 'text-warning'; // orange (warning)
            }

            html += createStatField('Avg Wasted Time', mfClipStats.avgWastedTime.toFixed(0) + 'ms', wastedClass);
        }
    }

    statsOverview.innerHTML = html;
}

/**
 * Create a stat field HTML
 */
function createStatField(label, value, cssClass = '') {
    const classAttr = cssClass ? ` class="${cssClass}"` : '';
    return `
        <div class="stat-field">
            <div class="stat-field-label">${label}:</div>
            <div class="stat-field-value"${classAttr}>${value}</div>
        </div>
    `;
}

// ============ Quick Overview (Summary View) ============

/**
 * Get icon filename for an issue type
 */
function getIssueIcon(issueType) {
    // Map issue types to icon filenames
    const iconMap = {
        'dp-orbs': 'plague.jpg',
        'mb-delays': 'mb.jpg',
        'mb-missed': 'mb.jpg',
        'mb-usage': 'mb.jpg',
        '34914-uptime': 'vt.jpg',
        '34914-pandemic': 'vt.jpg',
        '589-uptime': 'swp.jpg',
        '589-pandemic': 'swp.jpg'
    };

    return iconMap[issueType] || 'default.jpg';
}

/**
 * Toggle between Summary and Detailed view
 */
function toggleView(view) {
    const summaryBtn = document.querySelector('[data-view="summary"]');
    const detailedBtn = document.querySelector('[data-view="detailed"]');
    const quickOverview = document.getElementById('quick-overview');
    const statsOverview = document.getElementById('stats-overview');
    const spellFilters = document.querySelector('.spell-filters');
    const castFilters = document.querySelector('.cast-filters');
    const castList = document.getElementById('cast-list');

    if (view === 'summary') {
        summaryBtn.classList.add('active');
        detailedBtn.classList.remove('active');

        // Show summary elements
        quickOverview.style.display = 'block';

        // Hide detailed elements
        statsOverview.style.display = 'none';
        if (spellFilters) spellFilters.style.display = 'none';
        if (castFilters) castFilters.style.display = 'none';
        if (castList) castList.style.display = 'none';

        // Render quick overview
        renderQuickOverview();
    } else {
        summaryBtn.classList.remove('active');
        detailedBtn.classList.add('active');

        // Hide summary elements
        quickOverview.style.display = 'none';

        // Show detailed elements
        statsOverview.style.display = 'block';
        if (spellFilters) spellFilters.style.display = 'flex';
        if (castFilters) castFilters.style.display = 'flex';
        if (castList) castList.style.display = 'block';

        // Render detailed stats (already rendered, but refresh)
        renderStatsOverview(window.currentSpellFilter || 'timeline');
    }
}

/**
 * Toggle benchmark comparison display
 */
function toggleBenchmarkDisplay() {
    // Get current state from localStorage (default: hidden)
    const isEnabled = localStorage.getItem('benchmarksEnabled') === 'true';
    const newState = !isEnabled;

    // Save new state
    localStorage.setItem('benchmarksEnabled', newState.toString());

    // Update button text and active state
    const landingBtn = document.getElementById('benchmark-toggle-landing');
    const analysisBtn = document.getElementById('benchmark-toggle-analysis');

    const buttonText = newState ? 'Hide Benchmarks' : 'Show Benchmarks';
    if (landingBtn) {
        landingBtn.textContent = buttonText;
        if (newState) {
            landingBtn.classList.add('active');
        } else {
            landingBtn.classList.remove('active');
        }
    }
    if (analysisBtn) {
        analysisBtn.textContent = buttonText;
        if (newState) {
            analysisBtn.classList.add('active');
        } else {
            analysisBtn.classList.remove('active');
        }
    }

    // Show/hide benchmark comparison panel
    const benchmarkPanel = document.getElementById('benchmark-comparison');
    if (benchmarkPanel) {
        benchmarkPanel.style.display = newState ? 'block' : 'none';
    }

    // Reload benchmark data if enabled and we're on analysis page
    if (newState && window.currentFight) {
        loadAndDisplayBenchmark();
    }
}

/**
 * Load and display benchmark comparison for current fight
 */
async function loadAndDisplayBenchmark() {
    const benchmarkPanel = document.getElementById('benchmark-comparison');
    if (!benchmarkPanel || !window.currentFight) return;

    const isEnabled = localStorage.getItem('benchmarksEnabled') === 'true';
    if (!isEnabled) {
        benchmarkPanel.style.display = 'none';
        return;
    }

    benchmarkPanel.style.display = 'block';
    benchmarkPanel.innerHTML = '<div class="benchmark-loading">Loading benchmark data...</div>';

    try {
        // Initialize benchmark loader if not already done
        if (!window.benchmarkLoader) {
            window.benchmarkLoader = new BenchmarkLoader();
        }

        // Load benchmark for current encounter
        const benchmark = await window.benchmarkLoader.getBenchmarkForFight(window.currentFight);

        if (!benchmark) {
            benchmarkPanel.innerHTML = `
                <div class="benchmark-unavailable">
                    <p>No benchmark data available for this encounter/difficulty.</p>
                    <p class="benchmark-note">Benchmarks are updated weekly via GitHub Actions.</p>
                </div>
            `;
            return;
        }

        // Render benchmark comparison
        renderBenchmarkComparison(benchmark);
    } catch (error) {
        console.error('Error loading benchmark:', error);
        benchmarkPanel.innerHTML = `
            <div class="benchmark-error">
                Failed to load benchmark data. Please try again later.
            </div>
        `;
    }
}

/**
 * Calculate player's actual CPM for a specific spell
 */
function calculatePlayerCpm(spellId) {
    if (!window.allCasts || !window.currentFight) return 0;

    const fightDurationMs = window.currentFight.endTime - window.currentFight.startTime;
    const fightDurationMinutes = fightDurationMs / 1000 / 60;

    const castCount = window.allCasts.filter(cast => cast.spellId === spellId).length;

    return (castCount / fightDurationMinutes).toFixed(1);
}

/**
 * Generate comparison HTML for a single spell metric
 */
function renderMetricComparison(label, benchmarkCpm, spellId, iconPath) {
    const playerCpm = parseFloat(calculatePlayerCpm(spellId));
    const benchmark = parseFloat(benchmarkCpm);
    const diff = playerCpm - benchmark;
    const diffPercent = ((diff / benchmark) * 100).toFixed(1);

    // Color code based on performance
    // Green if within 5% or better, yellow if 5-15% behind, red if >15% behind
    let diffClass = 'neutral';
    if (diff >= 0 || Math.abs(diffPercent) <= 5) {
        diffClass = 'good'; // Green
    } else if (Math.abs(diffPercent) <= 15) {
        diffClass = 'medium'; // Yellow
    } else {
        diffClass = 'bad'; // Red
    }

    const diffSign = diff >= 0 ? '+' : '';

    return `
        <div class="benchmark-metric">
            <div class="metric-header">
                <span class="metric-label">${label}</span>
                <img src="${iconPath}" alt="${label}" class="metric-icon">
            </div>
            <div class="metric-comparison">
                <div class="metric-row">
                    <span class="metric-sublabel">Benchmark:</span>
                    <span class="metric-value">${benchmarkCpm} CPM</span>
                </div>
                <div class="metric-row">
                    <span class="metric-sublabel">Your CPM:</span>
                    <span class="metric-value player-value">${playerCpm} CPM</span>
                </div>
                <div class="metric-row">
                    <span class="metric-sublabel">Difference:</span>
                    <span class="metric-diff ${diffClass}">${diffSign}${diff.toFixed(1)} (${diffSign}${diffPercent}%)</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render benchmark comparison UI
 */
function renderBenchmarkComparison(benchmark) {
    const benchmarkPanel = document.getElementById('benchmark-comparison');
    if (!benchmarkPanel) return;

    const { encounterName, difficultyName, rankRange, sampleSize, lastUpdated, metrics } = benchmark;

    // Spell ID mappings
    const SPELL_IDS = {
        mindBlast: 8092,
        devouringPlague: 2944,
        vampiricTouch: 34914,
        shadowWordPain: 589,
        shadowWordDeath: 32379,
        mindFlay: 15407,
        mindFlayInsanity: 129197
    };

    // Check if benchmark should be collapsed (default: expanded)
    const isCollapsed = localStorage.getItem('benchmarkCollapsed') === 'true';
    const collapsedClass = isCollapsed ? 'collapsed' : '';
    const chevron = isCollapsed ? '▶' : '▼';

    let html = `
        <div class="benchmark-header">
            <div class="benchmark-title-row" onclick="toggleBenchmarkCollapse()">
                <h3><span class="benchmark-chevron">${chevron}</span> 📊 Benchmark Comparison</h3>
            </div>
            <div class="benchmark-note ${collapsedClass}">
                This is reference data from similar logs, not an indicator of perfect play.
            </div>
        </div>
        <div class="benchmark-metrics ${collapsedClass}">
            ${renderMetricComparison('Mind Blast', metrics.mindBlast.cpm, SPELL_IDS.mindBlast, 'analyzer/icons/mb.jpg')}
            ${renderMetricComparison('Devouring Plague', metrics.devouringPlague.cpm, SPELL_IDS.devouringPlague, 'analyzer/icons/plague.jpg')}
            ${renderMetricComparison('Vampiric Touch', metrics.vampiricTouch.cpm, SPELL_IDS.vampiricTouch, 'analyzer/icons/vt.jpg')}
            ${renderMetricComparison('Shadow Word: Pain', metrics.shadowWordPain.cpm, SPELL_IDS.shadowWordPain, 'analyzer/icons/swp.jpg')}
            ${renderMetricComparison('Shadow Word: Death', metrics.shadowWordDeath.cpm, SPELL_IDS.shadowWordDeath, 'analyzer/icons/swd.jpg')}
            ${renderMetricComparison('Mind Flay', metrics.mindFlay.cpm, SPELL_IDS.mindFlay, 'analyzer/icons/flay.jpg')}
            ${renderMetricComparison('Mind Flay: Insanity', metrics.mindFlayInsanity.cpm, SPELL_IDS.mindFlayInsanity, 'analyzer/icons/mfinsanity.jpg')}
        </div>
    `;

    benchmarkPanel.innerHTML = html;
}

/**
 * Toggle benchmark comparison collapse state
 */
function toggleBenchmarkCollapse() {
    const benchmarkPanel = document.getElementById('benchmark-comparison');
    if (!benchmarkPanel) return;

    const metrics = benchmarkPanel.querySelector('.benchmark-metrics');
    const note = benchmarkPanel.querySelector('.benchmark-note');
    const chevron = benchmarkPanel.querySelector('.benchmark-chevron');

    if (metrics && note && chevron) {
        const isCurrentlyCollapsed = metrics.classList.contains('collapsed');

        if (isCurrentlyCollapsed) {
            metrics.classList.remove('collapsed');
            note.classList.remove('collapsed');
            chevron.textContent = '▼';
            localStorage.setItem('benchmarkCollapsed', 'false');
        } else {
            metrics.classList.add('collapsed');
            note.classList.add('collapsed');
            chevron.textContent = '▶';
            localStorage.setItem('benchmarkCollapsed', 'true');
        }
    }
}

/**
 * Update API quota display
 */
function updateQuotaDisplay() {
    const quotaDisplay = document.getElementById('api-quota-display');

    if (!quotaDisplay || !window.wclV2Service) {
        return;
    }

    const rateLimit = window.wclV2Service.getRateLimit();

    // Only show if we have rate limit data
    if (rateLimit.limit === null || rateLimit.remaining === null) {
        quotaDisplay.style.display = 'none';
        return;
    }

    const pointsUsed = rateLimit.pointsUsed || 0;
    const remaining = rateLimit.remaining;
    const limit = rateLimit.limit;

    // Calculate percentage remaining
    const percentRemaining = (remaining / limit) * 100;

    // Set color class based on remaining quota
    quotaDisplay.classList.remove('low', 'critical');
    if (percentRemaining < 10) {
        quotaDisplay.classList.add('critical');
    } else if (percentRemaining < 25) {
        quotaDisplay.classList.add('low');
    }

    quotaDisplay.textContent = `API: ${remaining.toFixed(1)}/${limit} points`;
    quotaDisplay.title = `${pointsUsed.toFixed(1)} points used this hour`;
    quotaDisplay.style.display = 'inline-block';
}

/**
 * Clear cached fight data
 */
function clearFightCache() {
    if (!window.wclV2Service) {
        alert('WCL service not available');
        return;
    }

    const count = window.wclV2Service.clearCache();
    alert(`Cleared ${count} cached fight${count !== 1 ? 's' : ''} from local storage.\n\nNext fight analysis will use fresh data from WCL.`);
}

/**
 * Initialize benchmark toggle state on page load
 */
function initBenchmarkToggle() {
    const isEnabled = localStorage.getItem('benchmarksEnabled') === 'true';
    const landingBtn = document.getElementById('benchmark-toggle-landing');
    const analysisBtn = document.getElementById('benchmark-toggle-analysis');

    const buttonText = isEnabled ? 'Hide Benchmarks' : 'Show Benchmarks';
    if (landingBtn) {
        landingBtn.textContent = buttonText;
        if (isEnabled) landingBtn.classList.add('active');
    }
    if (analysisBtn) {
        analysisBtn.textContent = buttonText;
        if (isEnabled) analysisBtn.classList.add('active');
    }
}

/**
 * Render quick overview/summary
 */
function renderQuickOverview() {
    const quickOverview = document.getElementById('quick-overview');

    if (!window.allCasts || !window.currentFight) {
        quickOverview.innerHTML = '<p class="overview-empty">No data available</p>';
        return;
    }

    // Run the QuickOverviewAnalyzer
    if (typeof window.QuickOverviewAnalyzer === 'undefined') {
        quickOverview.innerHTML = '<p class="overview-empty">Quick overview analyzer not loaded</p>';
        return;
    }

    const analyzer = new window.QuickOverviewAnalyzer(window.allCasts, window.currentFight);
    const issues = analyzer.analyze();

    let html = '';

    // Critical Issues Section (Red)
    if (issues.critical.length > 0) {
        html += '<div class="overview-section">';
        html += '<div class="overview-section-title critical">⚠️ Critical Issues</div>';
        html += '<div class="overview-issues">';
        issues.critical.forEach(issue => {
            const icon = getIssueIcon(issue.type);
            html += `
                <div class="overview-issue critical">
                    <img src="analyzer/icons/${icon}" alt="${issue.label}" class="overview-issue-icon">
                    <span class="overview-issue-label">${issue.label}</span>
                    <span class="overview-issue-message">${issue.message}</span>
                </div>
            `;
        });
        html += '</div></div>';
    }

    // Could Improve Section (Orange/Yellow)
    if (issues.couldImprove.length > 0) {
        html += '<div class="overview-section">';
        html += '<div class="overview-section-title could-improve">⚡ Could Improve</div>';
        html += '<div class="overview-issues">';
        issues.couldImprove.forEach(issue => {
            const icon = getIssueIcon(issue.type);
            html += `
                <div class="overview-issue could-improve">
                    <img src="analyzer/icons/${icon}" alt="${issue.label}" class="overview-issue-icon">
                    <span class="overview-issue-label">${issue.label}</span>
                    <span class="overview-issue-message">${issue.message}</span>
                </div>
            `;
        });
        html += '</div></div>';
    }

    // Well Done Section (Green)
    if (issues.wellDone.length > 0) {
        html += '<div class="overview-section">';
        html += '<div class="overview-section-title well-done">✓ Well Done</div>';
        html += '<div class="overview-issues">';
        issues.wellDone.forEach(issue => {
            const icon = getIssueIcon(issue.type);
            html += `
                <div class="overview-issue well-done">
                    <img src="analyzer/icons/${icon}" alt="${issue.label}" class="overview-issue-icon">
                    <span class="overview-issue-label">${issue.label}</span>
                    <span class="overview-issue-message">${issue.message}</span>
                </div>
            `;
        });
        html += '</div></div>';
    }

    // If no issues at all, show empty state
    if (html === '') {
        html = '<p class="overview-empty">No issues detected. Great job!</p>';
    }

    quickOverview.innerHTML = html;
}

/**
 * Normalize talent name to icon filename
 * E.g., "Void Tendrils" -> "voidtendrils"
 */
function normalizeIconName(name) {
    // Special mappings for talents where WCL name differs from icon filename
    const iconNameMap = {
        'mindcontrol': 'dominatemind',  // WCL returns "Mind Control" but icon is dominatemind.jpg
        'surgeoflight': 'fromdarknesscomeslight'  // WCL may return "Surge of Light" but icon is fromdarknesscomeslight.jpg
    };

    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return iconNameMap[normalized] || normalized;
}

/**
 * Get the proper display name for a talent
 * E.g., "Mind Control" -> "Dominate Mind"
 */
function getTalentDisplayName(name) {
    // Special mappings for talents where WCL name differs from proper talent name
    const displayNameMap = {
        'Mind Control': 'Dominate Mind',  // WCL returns "Mind Control" but talent is called "Dominate Mind"
        'Surge of Light': 'From Darkness, Comes Light'  // WCL may return "Surge of Light" but talent is "From Darkness, Comes Light"
    };

    return displayNameMap[name] || name;
}

/**
 * Render talents display with locked tier positions
 */
function renderTalents(talents) {
    const talentsDisplay = document.getElementById('talents-display');

    if (!talents || !Array.isArray(talents) || talents.length === 0) {
        talentsDisplay.style.display = 'none';
        return;
    }

    // Create a map of tier -> talent for quick lookup
    const talentsByTier = {};
    talents.forEach(talent => {
        talentsByTier[talent.type] = talent;
    });

    let html = '<div class="talents-list">';

    // Fixed tier positions: 1=15, 2=30, 3=45, 4=60, 5=75, 6=90
    const tierLevels = [1, 2, 3, 4, 5, 6];

    tierLevels.forEach(tier => {
        const level = tier * 15;
        const talent = talentsByTier[tier];

        html += '<div class="talent-tier">';
        html += `<div class="talent-tier-label">${level}</div>`;

        if (talent) {
            const iconName = normalizeIconName(talent.name);
            const displayName = getTalentDisplayName(talent.name);
            const iconPath = `analyzer/icons/talents/${iconName}.jpg`;

            html += `
                <div class="talent-icon-wrapper" title="${displayName}">
                    <img src="${iconPath}"
                         alt="${displayName}"
                         class="talent-icon"
                         onerror="this.src='analyzer/icons/talents/placeholder.jpg'">
                </div>
            `;
        } else {
            // Empty slot for this tier
            html += '<div class="talent-icon-wrapper" style="opacity: 0.3; border-color: #333;"></div>';
        }

        html += '</div>';
    });

    html += '</div>';

    talentsDisplay.innerHTML = html;
    talentsDisplay.style.display = 'block';
}

/**
 * Add tier 6 talent filter button based on player's talent choice
 */
function addTier6TalentButton(talents) {
    if (!talents || !Array.isArray(talents) || talents.length === 0) {
        return;
    }

    // Find tier 6 talent (Level 90: Halo, Cascade, or Divine Star)
    const tier6Talent = talents.find(t => t.type === 6);

    if (!tier6Talent) {
        return;
    }

    // Map talent names to spell IDs and display info
    const tier6TalentMap = {
        'Halo': { spellId: 120644, icon: 'halo.jpg', label: 'Halo' },
        'Cascade': { spellId: 127632, icon: 'cascade.jpg', label: 'Cascade' },
        'Divine Star': { spellId: 122121, icon: 'divinestar.jpg', label: 'DS' }
    };

    const talentInfo = tier6TalentMap[tier6Talent.name];

    if (!talentInfo) {
        return;
    }

    // Find the spell filters container
    const spellFilters = document.querySelector('.spell-filters');

    if (!spellFilters) {
        return;
    }

    // Remove any existing tier 6 talent buttons (in case of re-analysis)
    const existingButton = spellFilters.querySelector('[data-tier6-talent]');
    if (existingButton) {
        existingButton.remove();
    }

    // Create the button
    const button = document.createElement('button');
    button.className = 'spell-filter-btn';
    button.setAttribute('data-spell', talentInfo.spellId);
    button.setAttribute('data-tier6-talent', 'true');
    button.onclick = () => filterBySpell(talentInfo.spellId);

    button.innerHTML = `
        <img src="analyzer/icons/${talentInfo.icon}" alt="${talentInfo.label}" class="filter-icon">
        <span class="filter-label">${talentInfo.label}</span>
    `;

    // Append to spell filters
    spellFilters.appendChild(button);
}

/**
 * Filter timeline by spell
 */
window.filterBySpell = function(filter) {
    if (!window.allCasts || !window.currentFight) return;

    // Store current filter
    window.currentSpellFilter = filter;

    // Update button states
    document.querySelectorAll('.spell-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-spell="${filter}"]`).classList.add('active');

    // Re-render stats or overview depending on current view
    const summaryBtn = document.querySelector('[data-view="summary"]');
    if (summaryBtn && summaryBtn.classList.contains('active')) {
        // Summary view is active - update quick overview
        renderQuickOverview();
    } else {
        // Detailed view is active - update stats
        renderStatsOverview(filter);
    }

    // Re-render timeline with filtered casts
    let filteredCasts = window.allCasts;
    if (filter !== 'timeline') {
        const filterSpellId = parseInt(filter);
        // Mind Flay (15407) should include Mind Flay: Insanity (129197)
        if (filterSpellId === 15407) {
            filteredCasts = window.allCasts.filter(c => c.spellId === 15407 || c.spellId === 129197);
        } else {
            filteredCasts = window.allCasts.filter(c => c.spellId === filterSpellId);
        }
    }

    renderCastTimeline(filteredCasts, window.currentFight);
}
