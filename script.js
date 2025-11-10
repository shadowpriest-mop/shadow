// MoP Shadow Priest Haste Calculator
console.log('script.js loading...');

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
        console.log('No valid hash route found');
        return;
    }

    console.log('Loading from hash:', route);

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

        reportTitle.textContent = `${currentReportData.title || 'Report'} (${currentReportData.owner || 'Unknown'})`;
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
            window.analyzeLog();
        });
    }

    // Update URL hash
    const reportId = window.wclV2Service.extractReportId(document.getElementById('wcl-report').value);
    const playerName = playerSelect.value;
    const fightId = encounterSelect.value;
    updateHash(reportId, playerName, fightId);

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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded - Initializing WCL analyzer');

    // Add event listeners for WCL analyzer
    const wclInput = document.getElementById('wcl-report');
    if (wclInput) {
        console.log('Adding WCL report event listeners');
        wclInput.addEventListener('blur', function() {
            console.log('Blur event triggered');
            window.loadReport();
        });
        wclInput.addEventListener('keypress', function(e) {
            console.log('Keypress event:', e.key);
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
        console.log('Hash changed:', window.location.hash);
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
        console.log('Found hash on load, attempting to load from URL');
        loadFromHash();
    }

    console.log('DOMContentLoaded complete - all event listeners added');
    console.log('window.loadReport available:', typeof window.loadReport);
    console.log('window.analyzeLog available:', typeof window.analyzeLog);
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

        console.log(`${dotSpells[spellId]} debuff events:`, debuffEvents.length);

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
    console.log('loadReport() called');
    console.log('wclV2Service available?', typeof window.wclV2Service);

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
        console.log('Fetching report:', reportId);
        const reportData = await window.wclV2Service.fetchReport(reportId);
        currentReportData = reportData;

        console.log('Report data:', reportData);

        // Find Priests (spec will be validated when analyzing casts)
        const priests = window.wclV2Service.getShadowPriests(reportData);

        if (priests.length === 0) {
            alert('No Priests found in this report!');
            return;
        }

        // Populate player dropdown
        playerSelect.innerHTML = '<option value="">Select a player</option>' +
            priests.map(player =>
                `<option value="${player.name}">${player.name} (${player.type})</option>`
            ).join('');
        playerSelect.disabled = false;

        // Find boss encounters
        const encounters = window.wclV2Service.getBossEncounters(reportData);

        if (encounters.length === 0) {
            alert('No boss encounters found in this report!');
            return;
        }

        // Populate encounter dropdown
        encounterSelect.innerHTML = '<option value="">Select an encounter</option>' +
            encounters.map(fight =>
                `<option value="${fight.id}">${fight.name} (${Math.round((fight.endTime - fight.startTime) / 1000)}s)</option>`
            ).join('');
        encounterSelect.disabled = false;

        analyzeBtn.disabled = false;

    } catch (error) {
        console.error('Error loading report:', error);
        alert('Error loading report: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Extract unique targets from events and enrich with names from report enemies
function extractTargetsFromEvents(events, reportData) {
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

        // Show count if multiple instances
        const displayName = instanceCount > 1
            ? `${targetName} (${instanceCount})`
            : targetName;

        targets.set(targetID, {
            id: targetID,
            name: targetName,
            displayName: displayName,
            instanceCount: instanceCount,
            instances: Array.from(data.instances),
            totalDamage: data.totalDamage
        });
    });

    return Array.from(targets.values());
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

        console.log('=== ANALYZE STARTING ===');
        console.log('Fetching events for:', { reportId, playerName, fightId, startTime: fight.startTime, endTime: fight.endTime });

        // Fetch events from WCL v2 API
        const eventsData = await window.wclV2Service.fetchEvents(
            reportId,
            fightId,
            playerName,
            fight.startTime,
            fight.endTime
        );

        console.log('=== EVENTS DATA RECEIVED ===');
        console.log('Full eventsData object:', eventsData);
        console.log('Pages fetched:', eventsData.pageCount);
        console.log('eventsData type:', typeof eventsData);
        console.log('eventsData.data exists?', !!eventsData?.data);

        if (!eventsData || !eventsData.data) {
            console.error('NO EVENT DATA - eventsData:', eventsData);
            alert('No event data returned from WCL. Check console for details.');
            return;
        }

        // Fetch buff events (applybuff, removebuff, etc.)
        console.log('=== FETCHING BUFF EVENTS ===');
        const buffEventsData = await window.wclV2Service.fetchBuffEvents(
            reportId,
            fightId,
            playerName,
            fight.startTime,
            fight.endTime
        );

        console.log('=== BUFF EVENTS RECEIVED ===');
        console.log('Buff pages fetched:', buffEventsData.pageCount);
        console.log('Buff events count:', buffEventsData.data?.length || 0);

        const events = eventsData.data;
        const buffEvents = buffEventsData.data || [];

        console.log('Total events:', events.length);
        console.log('Total buff events:', buffEvents.length);

        // Extract targets and populate target filter
        const targets = extractTargetsFromEvents(events, currentReportData);
        window.allTargets = targets; // Store globally

        const targetFilter = document.getElementById('target-filter');
        const targetFilterGroup = document.getElementById('target-filter-group');

        // Populate target filter dropdown
        targetFilter.innerHTML = '<option value="all">All Targets</option>';
        targets.forEach(target => {
            const option = document.createElement('option');
            option.value = target.id;
            option.textContent = target.displayName;
            targetFilter.appendChild(option);
        });

        // Show target filter if there are multiple targets
        if (targets.length > 1) {
            targetFilterGroup.style.display = 'block';
        } else {
            targetFilterGroup.style.display = 'none';
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

        // Analyze casts with quality metrics
        const castsAnalyzer = new CastsAnalyzer(events, buffEvents, {});
        const casts = castsAnalyzer.analyze();

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
        window.currentFight = fight;
        window.statsCalculator = new CastStatsCalculator(casts, fight);

        // Render stats overview (Timeline view by default)
        renderStatsOverview('timeline');

        // Render cast timeline
        renderCastTimeline(casts, fight);

        // Add target filter event listener
        targetFilter.addEventListener('change', () => {
            renderCastTimeline(window.allCasts, window.currentFight);
            renderStatsOverview('timeline');
        });

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

// ============ Cast Timeline Rendering ============

/**
 * Render the cast timeline
 */
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

    console.log(`Rendering ${filteredCasts.length} of ${casts.length} casts (filtered by target: ${selectedTarget})`);

    if (filteredCasts.length === 0) {
        castList.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No casts found for selected target</p>';
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

    // Format hits (like Wrath: "5/5" or "3/3")
    const totalHits = cast.instances ? cast.instances.length : 0;
    const hitsText = `${cast.hits}/${totalHits}`;

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
                        <div class="cast-stat-line"><span class="cast-stat-label">Hits:</span> ${hitsText}</div>
                        <div class="cast-stat-line"><span class="cast-stat-label">Damage:</span> ${damageText}</div>
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
    const isDoT = cast.hastedTickInterval !== undefined;
    const timeLabel = isDoT ? 'Duration:' : 'Cast Time:';
    html += `
        <div class="cast-details-item">
            <span class="cast-details-label">${timeLabel}</span>
            <span class="cast-details-value">${(cast.castTimeMs / 1000).toFixed(2)}s</span>
        </div>
    `;

    // Haste (if available)
    if (cast.haste && cast.haste !== 1.0) {
        const hastePercent = ((cast.haste - 1) * 100).toFixed(1);
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Haste:</span>
                <span class="cast-details-value">${hastePercent}%</span>
            </div>
        `;
    }

    // DoT tick info (if available)
    if (cast.hastedTickInterval) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Tick Interval:</span>
                <span class="cast-details-value">${(cast.hastedTickInterval / 1000).toFixed(2)}s</span>
            </div>
        `;
    }

    if (cast.expectedTicks) {
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Expected Ticks:</span>
                <span class="cast-details-value">${cast.expectedTicks} ticks</span>
            </div>
        `;
    }

    // Delay (if available)
    if (cast.nextCastLatency !== undefined) {
        const status = statHighlights.castLatency(cast);
        const cssClass = statHighlights.getTextClass(status);
        html += `
            <div class="cast-details-item">
                <span class="cast-details-label">Delay:</span>
                <span class="cast-details-value ${cssClass}">${cast.nextCastLatency}ms</span>
            </div>
        `;
    }

    // DoT Refresh Quality (Pandemic-aware for MoP)
    if (cast.dotQuality && [589, 34914, 2944].includes(cast.spellId)) {
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
    } else if ([589, 34914, 2944].includes(cast.spellId)) {
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

            html += `
                <div class="cast-hit-item">
                    <span class="cast-hit-time">${timeText}</span>
                    <span class="cast-hit-target">Target</span>
                    <span class="cast-hit-damage">Damage: ${damageText}</span>
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
        filteredCasts = window.allCasts.filter(c => c.spellId === parseInt(filter));
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
    html += createStatField('Damage', stats.totalDamage.toLocaleString());
    html += createStatField('Active DPS', stats.activeDps.toFixed(1));
    html += createStatField('Active Time', activeTimeStr);

    // Break if showing detailed stats (per-spell view)
    if (filter !== 'timeline') {
        html += '<div class="stat-field-break"></div>';
        html += createStatField('Hits', stats.hits);
        html += createStatField('Avg Hit', stats.avgHit.toFixed(1));
        html += createStatField('Crit Rate', stats.critRate.toFixed(1) + '%');
        html += createStatField('Damage/GCD', stats.damagePerGcd.toFixed(0));
    }

    // DoT stats (if applicable)
    if (filter === 'timeline' || [589, 34914, 2944].includes(parseInt(filter))) {
        html += '<div class="stat-field-break"></div>';
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
        html += '<div class="stat-field-break"></div>';
        if (stats.avgMfDelay > 0) {
            html += createStatField('Avg MF Delay', stats.avgMfDelay.toFixed(0) + 'ms');
        }
        if (stats.earlyMfClips > 0) {
            html += createStatField('Early MF Clips', `${stats.earlyMfClips} (${stats.earlyMfClipsPercent.toFixed(1)}%)`);
        }
        if (stats.clippedMfDps > 0) {
            html += createStatField('Clipped MF DPS', '~' + stats.clippedMfDps.toFixed(1));
        }
    }

    // Encounter stats
    html += '<div class="stat-field-break"></div>';
    html += createStatField('GCD Usage', stats.gcdUsage.toFixed(0) + '%');

    statsOverview.innerHTML = html;
}

/**
 * Create a stat field HTML
 */
function createStatField(label, value) {
    return `
        <div class="stat-field">
            <div class="stat-field-label">${label}:</div>
            <div class="stat-field-value">${value}</div>
        </div>
    `;
}

/**
 * Filter timeline by spell
 */
window.filterBySpell = function(filter) {
    if (!window.allCasts || !window.currentFight) return;

    // Update button states
    document.querySelectorAll('.spell-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-spell="${filter}"]`).classList.add('active');

    // Re-render stats for this filter
    renderStatsOverview(filter);

    // Re-render timeline with filtered casts
    let filteredCasts = window.allCasts;
    if (filter !== 'timeline') {
        filteredCasts = window.allCasts.filter(c => c.spellId === parseInt(filter));
    }

    renderCastTimeline(filteredCasts, window.currentFight);
}
