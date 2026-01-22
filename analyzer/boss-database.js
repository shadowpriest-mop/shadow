// Boss Database for MoP Raids
// Maps WarcraftLogs encounterID to boss NPC names

const BOSS_DATABASE = {
  // Mogu'shan Vaults
  1442: { // The Stone Guard
    bossNames: ['Jasper', 'Jade', 'Amethyst', 'Cobalt']
  },
  1443: { // Feng the Accursed
    bossNames: ['Feng the Accursed']
  },
  1444: { // Gara'jal the Spiritbinder
    bossNames: ['Gara\'jal the Spiritbinder']
  },
  1445: { // The Spirit Kings
    bossNames: ['Qiang the Merciless', 'Subetai the Swift', 'Zian of the Endless Shadow', 'Meng the Demented']
  },
  1446: { // Elegon
    bossNames: ['Elegon']
  },
  1447: { // Will of the Emperor
    bossNames: ['Jan-xi', 'Qin-xi']
  },

  // Heart of Fear
  1448: { // Imperial Vizier Zor'lok
    bossNames: ['Imperial Vizier Zor\'lok']
  },
  1449: { // Blade Lord Ta'yak
    bossNames: ['Blade Lord Ta\'yak']
  },
  1450: { // Garalon
    bossNames: ['Garalon']
  },
  1451: { // Wind Lord Mel'jarak
    bossNames: ['Wind Lord Mel\'jarak']
  },
  1452: { // Amber-Shaper Un'sok
    bossNames: ['Amber-Shaper Un\'sok']
  },
  1453: { // Grand Empress Shek'zeer
    bossNames: ['Grand Empress Shek\'zeer']
  },

  // Terrace of Endless Spring
  1454: { // Protectors of the Endless
    bossNames: ['Ancient Asani', 'Ancient Regail', 'Protector Kaolan']
  },
  1455: { // Tsulong
    bossNames: ['Tsulong']
  },
  1456: { // Lei Shi
    bossNames: ['Lei Shi']
  },
  1457: { // Sha of Fear
    bossNames: ['Sha of Fear']
  },

  // Throne of Thunder (WCL Classic IDs - different from original MoP)
  1499: { // Iron Qon
    bossNames: ['Iron Qon']
  },
  1500: { // Twin Consorts
    bossNames: ['Suen', 'Lu\'lin']
  },
  1505: { // Tortos
    bossNames: ['Tortos']
  },
  1510: { // Council of Elders
    bossNames: ['Frost King Malakk', 'Kazra\'jin', 'Sul the Sandcrawler', 'High Priestess Mar\'li']
  },
  1512: { // Durumu the Forgotten
    bossNames: ['Durumu the Forgotten']
  },
  1513: { // Ji-Kun
    bossNames: ['Ji-Kun']
  },
  1514: { // Primordius
    bossNames: ['Primordius']
  },
  1515: { // Horridon
    bossNames: ['Horridon']
  },
  1516: { // Dark Animus
    bossNames: ['Dark Animus']
  },
  1517: { // Jin'rokh the Breaker
    bossNames: ['Jin\'rokh the Breaker']
  },
  1518: { // Megaera
    bossNames: ['Megaera']
  },
  1519: { // Lei Shen
    bossNames: ['Lei Shen']
  },
  1520: { // Ra-den (Heroic only)
    bossNames: ['Ra-den']
  },

  // Siege of Orgrimmar
  1594: { // Immerseus
    bossNames: ['Immerseus']
  },
  1595: { // The Fallen Protectors
    bossNames: ['Rook Stonetoe', 'He Softfoot', 'Sun Tenderheart']
  },
  1596: { // Norushen
    bossNames: ['Norushen', 'Amalgam of Corruption']
  },
  1597: { // Sha of Pride
    bossNames: ['Sha of Pride']
  },
  1598: { // Galakras
    bossNames: ['Galakras']
  },
  1599: { // Iron Juggernaut
    bossNames: ['Iron Juggernaut']
  },
  1600: { // Kor'kron Dark Shaman
    bossNames: ['Earthbreaker Haromm', 'Wavebinder Kardris']
  },
  1601: { // General Nazgrim
    bossNames: ['General Nazgrim']
  },
  1602: { // Malkorok
    bossNames: ['Malkorok']
  },
  1603: { // Spoils of Pandaria
    bossNames: [] // This is a loot room, no traditional boss NPC
  },
  1604: { // Thok the Bloodthirsty
    bossNames: ['Thok the Bloodthirsty']
  },
  1605: { // Siegecrafter Blackfuse
    bossNames: ['Siegecrafter Blackfuse']
  },
  1606: { // Paragons of the Klaxxi
    bossNames: [
      'Kil\'ruk the Wind-Reaver',
      'Xaril the Poisoned Mind',
      'Ka\'roz the Locust',
      'Korven the Prime',
      'Iyyokuk the Lucid',
      'Skeer the Bloodseeker',
      'Rik\'kal the Dissector',
      'Hisek the Swarmkeeper',
      'Kaztik the Manipulator'
    ]
  },
  1607: { // Garrosh Hellscream
    bossNames: ['Garrosh Hellscream']
  }
};

/**
 * Check if an NPC name is a boss for a given encounter
 * @param {string} npcName - The NPC name to check
 * @param {number} encounterID - The WarcraftLogs encounter ID
 * @returns {boolean} True if the NPC is a boss
 */
function isBossNPC(npcName, encounterID) {
  if (!encounterID || encounterID === 0) {
    return false; // Trash pulls
  }

  const encounter = BOSS_DATABASE[encounterID];
  if (!encounter) {
    // Unknown encounter, fall back to name matching
    return false;
  }

  // Check if NPC name matches any boss in the database
  return encounter.bossNames.some(bossName => {
    // Exact match
    if (npcName === bossName) return true;
    // Partial match (for cases where WCL may have slightly different formatting)
    if (npcName.includes(bossName) || bossName.includes(npcName)) return true;
    return false;
  });
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.BOSS_DATABASE = BOSS_DATABASE;
  window.isBossNPC = isBossNPC;
}

// Node.js exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BOSS_DATABASE, isBossNPC };
}
