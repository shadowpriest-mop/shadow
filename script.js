// MoP Shadow Priest Haste Calculator
console.log('script.js loading...');

// Constants for MoP (Level 90)
const HASTE_RATING_PER_PERCENT = 425.25; // Haste rating needed for 1% haste at level 90
const BASE_GCD = 1.5; // Base GCD in seconds
const MIN_GCD = 1.0; // Minimum GCD in seconds

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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Get all input elements
    const hasteRatingInput = document.getElementById('haste-rating');
    const shadowformCheckbox = document.getElementById('shadowform');
    const racialSelect = document.getElementById('racial');
    const trollBerserkingCheckbox = document.getElementById('troll-berserking');
    const bloodlustCheckbox = document.getElementById('bloodlust');
    const talentTier3Select = document.getElementById('talent-tier3');
    const talentTier5Select = document.getElementById('talent-tier5');
    const talentTier6Select = document.getElementById('talent-tier6');
    const powerInfusionCheckbox = document.getElementById('power-infusion-active');
    const t14_4pcCheckbox = document.getElementById('t14-4pc');

    // Add event listeners for calculator
    hasteRatingInput.addEventListener('input', calculate);
    shadowformCheckbox.addEventListener('change', calculate);
    racialSelect.addEventListener('change', updateRacialOptions);
    trollBerserkingCheckbox.addEventListener('change', calculate);
    bloodlustCheckbox.addEventListener('change', calculate);
    talentTier3Select.addEventListener('change', calculate);
    talentTier5Select.addEventListener('change', updateTalentOptions);
    talentTier6Select.addEventListener('change', calculate);
    powerInfusionCheckbox.addEventListener('change', calculate);
    t14_4pcCheckbox.addEventListener('change', calculate);

    // Initial calculation
    updateRacialOptions();
    updateTalentOptions();
    calculate();

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
                window.loadReport();
            }
        });
    } else {
        console.error('Could not find wcl-report input element!');
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
    let hastePercent = (hasteRating / HASTE_RATING_PER_PERCENT);

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
    const gcd = Math.max(BASE_GCD / hasteMultiplier, MIN_GCD);
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
    const gcd = Math.max(BASE_GCD / hasteMultiplier, MIN_GCD);
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

function toggleInsanityDetails() {
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
            hasteRating: Math.ceil(requiredHastePercent * HASTE_RATING_PER_PERCENT)
        });
    }

    return breakpoints;
}

// Tab switching functionality
function switchTab(tabName) {
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

// Make loadReport available globally
window.loadReport = async function loadReport() {
    console.log('loadReport() called');
    const input = document.getElementById('wcl-report').value.trim();
    const reportId = wclV2Service.extractReportId(input);

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
        const reportData = await wclV2Service.fetchReport(reportId);
        currentReportData = reportData;

        console.log('Report data:', reportData);

        // Find Priests (spec will be validated when analyzing casts)
        const priests = wclV2Service.getShadowPriests(reportData);

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
        const encounters = wclV2Service.getBossEncounters(reportData);

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

// Make analyzeLog available globally
window.analyzeLog = async function analyzeLog() {
    const playerSelect = document.getElementById('player-select');
    const encounterSelect = document.getElementById('encounter-select');

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
    loadingIndicator.style.display = 'block';

    try {
        // Find fight object
        const fight = currentReportData.fights.find(f => f.id === fightId);

        if (!fight) {
            alert('Could not find fight data');
            return;
        }

        // Extract report ID from current data
        const reportId = wclV2Service.extractReportId(document.getElementById('wcl-report').value);

        // TODO: Fetch events and analyze
        console.log('Would analyze:', { reportId, playerName, fight });
        alert('Event fetching and analysis coming soon! For now, v2 authentication is working.');

    } catch (error) {
        console.error('Error analyzing log:', error);
        alert('Error analyzing log: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}
