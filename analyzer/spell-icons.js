// Spell Icon Mapping
// Maps spell IDs to icon filenames in analyzer/icons/

const SPELL_ICONS = {
  // DoTs
  589: 'swp.jpg',          // Shadow Word: Pain
  34914: 'vt.jpg',         // Vampiric Touch
  2944: 'plague.jpg',      // Devouring Plague

  // Direct Damage
  8092: 'mb.jpg',          // Mind Blast
  73510: 'mb.jpg',         // Mind Spike (using MB icon for now)
  32379: 'swd.jpg',        // Shadow Word: Death

  // Channels
  15407: 'flay.jpg',       // Mind Flay
  129197: 'mfinsanity.jpg', // Mind Flay: Insanity
  48045: 'mindsear.jpg',   // Mind Sear

  // AoE Spells
  120517: 'halo.jpg',      // Halo (Cast)
  120644: 'halo.jpg',      // Halo (Damage)
  120696: 'halo.jpg',      // Halo (Heal)
  121135: 'cascade.jpg',   // Cascade (Cast)
  127628: 'cascade.jpg',   // Cascade (Damage)
  127627: 'cascade.jpg',   // Cascade (Heal)
  110744: 'divinestar.jpg', // Divine Star (Cast)
  122128: 'divinestar.jpg', // Divine Star (Damage)
  110745: 'divinestar.jpg', // Divine Star (Heal)

  // Pet Abilities
  132603: 'fiend.jpg',     // Shadowfiend (MoP)
  34433: 'fiend.jpg',      // Shadowfiend (Legacy)
  123040: 'mindbender.jpg', // Mindbender

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

  // Raid Buffs
  2825: 'bloodlust.jpg',   // Bloodlust
  32182: 'heroism.jpg',    // Heroism

  // Utility
  17: 'shield.jpg',        // Power Word: Shield
  2061: 'hope.jpg',        // Flash Heal (using hope icon)
  2060: 'hope.jpg',        // Greater Heal
  2050: 'hope.jpg',        // Heal
  32546: 'hope.jpg',       // Binding Heal
  33076: 'hope.jpg',       // Prayer of Mending
  596: 'hope.jpg',         // Prayer of Healing
  64044: 'mindsear.jpg',   // Psychic Horror
  15487: 'dispel.jpg',     // Silence
  8122: 'dispel.jpg',      // Psychic Scream
  73325: 'feather.jpg',    // Leap of Faith
  527: 'dispel.jpg',       // Dispel Magic
  528: 'dispel.jpg',       // Cure Disease
  64843: 'divinehymn.jpg', // Divine Hymn
  132157: 'holynova.jpg',  // Holy Nova

  // Shadowform
  15473: 'shadowform.jpg', // Shadowform

  // Fade
  586: 'fade.jpg'          // Fade
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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SPELL_ICONS, getSpellIcon };
}
