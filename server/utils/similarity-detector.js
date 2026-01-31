/**
 * Similarity Detection Utility
 * Detects similar items based on title patterns to enable diversity filtering
 */

/**
 * Extract similarity group from an item title
 * Returns a group identifier (e.g., "battalion", "station", "building") or null
 * 
 * @param {string} title - The item title
 * @returns {string|null} - Similarity group identifier or null if no pattern matches
 */
function getSimilarityGroup(title) {
  if (!title || typeof title !== 'string') {
    return null;
  }

  const normalizedTitle = title.trim();

  // Military units: "Xth Battalion", "Xth Division", "Xth Regiment", etc.
  const militaryPattern = /\d+(st|nd|rd|th)?\s+(Battalion|Division|Regiment|Infantry|Brigade|Corps|Army|Squadron|Company|Platoon)/i;
  if (militaryPattern.test(normalizedTitle)) {
    const match = normalizedTitle.match(/\b(Battalion|Division|Regiment|Infantry|Brigade|Corps|Army|Squadron|Company|Platoon)\b/i);
    if (match) {
      return `military_${match[1].toLowerCase()}`;
    }
  }

  // Transportation: "X Station", "X Airport", "X Railway Station", etc.
  const transportPattern = /\b(Station|Airport|Railway Station|Train Station|Metro Station|Bus Station|Rail Station|Subway Station|Terminal|Depot)\b/i;
  if (transportPattern.test(normalizedTitle)) {
    const match = normalizedTitle.match(/\b(Station|Airport|Railway Station|Train Station|Metro Station|Bus Station|Rail Station|Subway Station|Terminal|Depot)\b/i);
    if (match) {
      // Normalize to common groups
      const matchLower = match[1].toLowerCase();
      if (matchLower.includes('station')) {
        return 'transportation_station';
      } else if (matchLower.includes('airport')) {
        return 'transportation_airport';
      } else if (matchLower.includes('terminal') || matchLower.includes('depot')) {
        return 'transportation_terminal';
      }
    }
  }

  // Buildings: "X Building", "X Tower", "X Center", etc.
  const buildingPattern = /\b(Building|Tower|Center|Centre|Plaza|Complex|Hall|House|Mansion|Palace|Castle|Monument|Memorial)\b/i;
  if (buildingPattern.test(normalizedTitle)) {
    const match = normalizedTitle.match(/\b(Building|Tower|Center|Centre|Plaza|Complex|Hall|House|Mansion|Palace|Castle|Monument|Memorial)\b/i);
    if (match) {
      return `building_${match[1].toLowerCase()}`;
    }
  }

  // Geographic: Try to extract country/region patterns
  // Look for patterns like "X, Country" or "X (Country)"
  const geoPattern = /,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$|\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\)$/;
  const geoMatch = normalizedTitle.match(geoPattern);
  if (geoMatch) {
    const location = (geoMatch[1] || geoMatch[2] || '').trim();
    // Common countries/regions that might have many similar items
    const commonLocations = ['New York', 'New York City', 'NYC', 'London', 'Paris', 'Tokyo', 'Berlin', 'Moscow', 'Sydney', 'Melbourne', 'Toronto', 'Vancouver'];
    if (commonLocations.some(loc => location.toLowerCase().includes(loc.toLowerCase()))) {
      return `geographic_${location.toLowerCase().replace(/\s+/g, '_')}`;
    }
  }

  // No pattern matched - return null (no diversity penalty)
  return null;
}

/**
 * Get similarity group for multiple items
 * 
 * @param {Array<{id: number, title: string}>} items - Array of items
 * @returns {Map<number, string|null>} - Map of item_id -> similarity_group
 */
function getSimilarityGroupsForItems(items) {
  const groupMap = new Map();
  
  if (!items || !Array.isArray(items)) {
    return groupMap;
  }

  items.forEach(item => {
    if (item && item.id && item.title) {
      const group = getSimilarityGroup(item.title);
      groupMap.set(item.id, group);
    }
  });

  return groupMap;
}

/**
 * Calculate diversity penalty based on how recently a similarity group was seen
 * 
 * @param {number} comparisonsAgo - How many comparisons ago this group was seen (null if not seen recently)
 * @param {number} penaltyStrength - Strength of penalty (0.0-1.0, default 0.8)
 * @returns {number} - Penalty multiplier (0.0-1.0)
 */
function calculateDiversityPenalty(comparisonsAgo, penaltyStrength = 0.8) {
  if (comparisonsAgo === null || comparisonsAgo === undefined) {
    return 1.0; // No penalty if not seen recently
  }

  let basePenalty = 1.0;
  
  if (comparisonsAgo <= 5) {
    basePenalty = 0.2;
  } else if (comparisonsAgo <= 10) {
    basePenalty = 0.4;
  } else if (comparisonsAgo <= 15) {
    basePenalty = 0.6;
  } else if (comparisonsAgo <= 20) {
    basePenalty = 0.8;
  } else {
    return 1.0; // No penalty if seen more than 20 comparisons ago
  }

  // Apply penalty strength multiplier
  // If penaltyStrength is 0.8, then 0.2 becomes 0.36 (0.2 + 0.8 * (1.0 - 0.2))
  const adjustedPenalty = basePenalty + (1.0 - basePenalty) * (1.0 - penaltyStrength);
  
  return adjustedPenalty;
}

module.exports = {
  getSimilarityGroup,
  getSimilarityGroupsForItems,
  calculateDiversityPenalty
};

