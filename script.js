// MoP Shadow Priest Haste Calculator

// Constants for MoP (Level 90)
const HASTE_RATING_PER_PERCENT = 425.25; // Haste rating needed for 1% haste at level 90
const BASE_GCD = 1.5; // Base GCD in seconds
const MIN_GCD = 1.0; // Minimum GCD in seconds

// Base DoT information
const DOTS = {
    swp: {
        name: 'Shadow Word: Pain',
        baseDuration: 18,
        baseTickInterval: 2,
        baseTicks: 9
    },
    vt: {
        name: 'Vampiric Touch',
        baseDuration: 15,
        baseTickInterval: 3,
        baseTicks: 5
    },
    dp: {
        name: 'Devouring Plague',
        baseDuration: 6,
        baseTickInterval: 1,
        baseTicks: 6
    }
};

// Base cast times
const CASTS = {
    mindFlay: {
        name: 'Mind Flay',
        baseDuration: 3,
        baseTicks: 3
    },
    mindBlast: {
        name: 'Mind Blast',
        baseCastTime: 1.5
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Get all input elements
    const hasteRatingInput = document.getElementById('haste-rating');
    const racialSelect = document.getElementById('racial');
    const trollBerserkingCheckbox = document.getElementById('troll-berserking');
    const bloodlustCheckbox = document.getElementById('bloodlust');

    // Add event listeners
    hasteRatingInput.addEventListener('input', calculate);
    racialSelect.addEventListener('change', updateRacialOptions);
    trollBerserkingCheckbox.addEventListener('change', calculate);
    bloodlustCheckbox.addEventListener('change', calculate);

    // Initial calculation
    updateRacialOptions();
    calculate();
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

function calculate() {
    // Get input values
    const hasteRating = parseFloat(document.getElementById('haste-rating').value) || 0;
    const racial = document.getElementById('racial').value;
    const trollBerserking = document.getElementById('troll-berserking').checked;
    const bloodlust = document.getElementById('bloodlust').checked;

    // Calculate haste percentage from rating
    let hastePercent = (hasteRating / HASTE_RATING_PER_PERCENT);

    // Add racial bonuses
    if (racial === 'goblin') {
        hastePercent += 1; // 1% passive
    }

    // Add temporary buffs (multiplicative)
    let hasteMultiplier = 1 + (hastePercent / 100);

    if (trollBerserking && racial === 'troll') {
        hasteMultiplier *= 1.20; // 20% from Berserking
    }

    if (bloodlust) {
        hasteMultiplier *= 1.30; // 30% from Bloodlust/Heroism
    }

    // Calculate final haste percentage
    const finalHastePercent = (hasteMultiplier - 1) * 100;

    // Update display
    updateHasteDisplay(finalHastePercent, hasteMultiplier);
    updateDoTDurations(hasteMultiplier);
    updateCastTimes(hasteMultiplier);
}

function updateHasteDisplay(hastePercent, hasteMultiplier) {
    document.getElementById('total-haste').textContent = hastePercent.toFixed(2) + '%';

    // Calculate GCD
    const gcd = Math.max(BASE_GCD / hasteMultiplier, MIN_GCD);
    document.getElementById('gcd').textContent = gcd.toFixed(2) + 's';
}

function updateDoTDurations(hasteMultiplier) {
    // Shadow Word: Pain
    const swpResult = calculateDoTDuration(DOTS.swp, hasteMultiplier);
    document.getElementById('swp-duration').textContent =
        `${swpResult.duration.toFixed(2)}s (${swpResult.ticks} ticks)`;

    // Vampiric Touch
    const vtResult = calculateDoTDuration(DOTS.vt, hasteMultiplier);
    document.getElementById('vt-duration').textContent =
        `${vtResult.duration.toFixed(2)}s (${vtResult.ticks} ticks)`;

    // Devouring Plague
    const dpResult = calculateDoTDuration(DOTS.dp, hasteMultiplier);
    document.getElementById('dp-duration').textContent =
        `${dpResult.duration.toFixed(2)}s (${dpResult.ticks} ticks)`;
}

function calculateDoTDuration(dot, hasteMultiplier) {
    // In MoP, haste adds extra ticks to DoTs
    // The tick interval is reduced by haste
    const hastedTickInterval = dot.baseTickInterval / hasteMultiplier;

    // Calculate how many ticks fit in the base duration
    const ticksInBaseDuration = Math.floor(dot.baseDuration / hastedTickInterval);

    // The actual number of ticks (minimum is base ticks)
    const totalTicks = Math.max(ticksInBaseDuration, dot.baseTicks);

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
    // Mind Flay (channel)
    const mfDuration = CASTS.mindFlay.baseDuration / hasteMultiplier;
    const mfTicks = CASTS.mindFlay.baseTicks;
    document.getElementById('mf-cast').textContent =
        `${mfDuration.toFixed(2)}s (${mfTicks} ticks)`;

    // Mind Blast
    const mbCast = CASTS.mindBlast.baseCastTime / hasteMultiplier;
    document.getElementById('mb-cast').textContent =
        `${mbCast.toFixed(2)}s`;
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
