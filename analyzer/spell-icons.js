// Spell Icon Mapping
// Maps spell IDs to icon filenames in analyzer/icons/

const SPELL_ICONS = {
  // DoTs
  589: 'swp.jpg',          // Shadow Word: Pain
  34914: 'vt.jpg',         // Vampiric Touch
  2944: 'plague.jpg',      // Devouring Plague

  // Direct Damage
  8092: 'mb.jpg',          // Mind Blast
  73510: 'mindspike.jpg',  // Mind Spike
  32379: 'swd.jpg',        // Shadow Word: Death

  // Channels
  15407: 'flay.jpg',       // Mind Flay
  129197: 'mfinsanity.jpg', // Mind Flay: Insanity
  48045: 'mindsear.jpg',   // Mind Sear
  49821: 'mindsear.jpg',   // Mind Sear (damage tick)

  // AoE Spells
  120517: 'halo.jpg',      // Halo (old cast ID)
  120644: 'halo.jpg',      // Halo (Cast)
  120696: 'halo.jpg',      // Halo (Damage)
  121135: 'cascade.jpg',   // Cascade (old cast ID)
  127632: 'cascade.jpg',   // Cascade (Cast)
  127628: 'cascade.jpg',   // Cascade (Damage)
  127627: 'cascade.jpg',   // Cascade (Heal)
  110744: 'divinestar.jpg', // Divine Star (old cast ID)
  122121: 'divinestar.jpg', // Divine Star (Cast)
  122128: 'divinestar.jpg', // Divine Star (Damage)
  110745: 'divinestar.jpg', // Divine Star (Heal)

  // Pet Abilities
  132603: 'fiend.jpg',     // Shadowfiend (MoP)
  34433: 'fiend.jpg',      // Shadowfiend (Legacy)
  132604: 'mindbender.jpg', // Mindbender
  123040: 'mindbender.jpg', // Mindbender (alt ID)

  // Cooldowns & Buffs
  47585: 'dispersion.jpg', // Dispersion
  15286: 've.jpg',         // Vampiric Embrace
  10060: 'pi.jpg',         // Power Infusion

  // Racial Abilities
  26297: 'berserking.jpg', // Berserking (Troll)
  20572: 'berserking.jpg', // Blood Fury (Orc) - using berserking icon
  28730: 'dispel.jpg',     // Arcane Torrent (Blood Elf)

  // Enchants & Procs
  126734: 'synapsesprings.jpg', // Synapse Springs (Engineering)
  55637: 'lightweave.jpg', // Lightweave Embroidery (Tailoring) - needs icon
  75170: 'lifeblood.jpg',  // Lifeblood (Herbalism) - needs icon

  // Consumables
  105702: 'potionofthejadeserpent.jpg', // Potion of the Jade Serpent
  6262: 'healthstone.jpg', // Healthstone

  // Raid Buffs & Major Cooldowns
  2825: 'bloodlust.jpg',   // Bloodlust
  32182: 'heroism.jpg',    // Heroism
  96228: 'synapsesprings.jpg', // Synapse Springs (correct ID)

  // Buff-specific IDs (for buff tracking)
  123254: 'twistoffate.jpg', // Twist of Fate - needs icon
  104993: 'jadespirit.jpg',  // Jade Spirit - needs icon
  125487: 'lightweave.jpg',  // Lightweave - needs icon
  54861: 'nitroboosts.jpg',  // Nitro Boosts - needs icon
  114206: 'skullbanner.jpg', // Skull Banner - needs icon
  126659: 'quickenedtongues.jpg', // Quickened Tongues - needs icon
  126577: 'innerbrilliance.jpg',   // Inner Brilliance - needs icon

  // Utility
  17: 'shield.jpg',        // Power Word: Shield
  139: 'renew.jpg',        // Renew
  588: 'innerfire.jpg',    // Inner Fire
  2061: 'hope.jpg',        // Flash Heal (using hope icon)
  2060: 'hope.jpg',        // Greater Heal
  2050: 'hope.jpg',        // Heal
  32546: 'hope.jpg',       // Binding Heal
  33076: 'hope.jpg',       // Prayer of Mending
  596: 'hope.jpg',         // Prayer of Healing
  64044: 'mindsear.jpg',   // Psychic Horror
  15487: 'silence.jpg',    // Silence
  8122: 'dispel.jpg',      // Psychic Scream
  73325: 'feather.jpg',    // Leap of Faith
  527: 'dispel.jpg',       // Dispel Magic
  528: 'dispel.jpg',       // Cure Disease
  64843: 'divinehymn.jpg', // Divine Hymn
  132157: 'holynova.jpg',  // Holy Nova
  126389: 'goblinglider.jpg', // Goblin Glider
  124199: 'landshark.jpg',  // G91 Landshark

  // Shadowform
  15473: 'shadowform.jpg', // Shadowform

  // Fade
  586: 'fade.jpg',         // Fade

  // Priest Talents
  121536: 'feather.jpg',   // Angelic Feather
  108945: 'bulwark.jpg',   // Angelic Bulwark
  19236: 'dp.jpg',         // Desperate Prayer
  605: 'dominatemind.jpg', // Dominate Mind
  108921: 'psyfiend.jpg',  // Psyfiend
  112833: 'spectralguise.jpg', // Spectral Guise
  108920: 'voidtendrils.jpg'   // Void Tendrils
};

/**
 * Get icon path for a spell ID
 * @param {number} spellId - The spell ID
 * @returns {string} Path to icon file or null if not found
 */
function getSpellIcon(spellId) {
  const iconFile = SPELL_ICONS[spellId];
  if (iconFile) {
    return `analyzer/icons/${iconFile}`;
  }
  return null;
}

// Export for use in other modules
// Browser globals
if (typeof window !== 'undefined') {
  window.SPELL_ICONS = SPELL_ICONS;
  window.getSpellIcon = getSpellIcon;
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SPELL_ICONS, getSpellIcon };
}
