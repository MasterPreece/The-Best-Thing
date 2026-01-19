// Selection configuration
// Configurable weights for comparison selection algorithm

/**
 * Get familiarity weight (default 0.7 = 70% familiarity, 30% variety)
 * Can be overridden with environment variable FAMILIARITY_WEIGHT
 */
const getFamiliarityWeight = () => {
  const envWeight = process.env.FAMILIARITY_WEIGHT;
  if (envWeight !== undefined) {
    const parsed = parseFloat(envWeight);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.7; // Default: 70% familiarity, 30% variety
};

/**
 * Get variety weight (complement of familiarity weight)
 * If familiarity is 70%, variety is 30%
 */
const getVarietyWeight = () => {
  return 1.0 - getFamiliarityWeight();
};

/**
 * Get selection thresholds
 * Returns object with familiarityThreshold and varietyThreshold
 */
const getSelectionThresholds = () => {
  const familiarityWeight = getFamiliarityWeight();
  
  // Split variety weight: 50% items needing votes, 50% random
  const varietyWeight = getVarietyWeight();
  const itemsNeedingVotesWeight = varietyWeight * 0.5; // 15% of total (when familiarity is 70%)
  const randomWeight = varietyWeight * 0.5; // 15% of total
  
  return {
    familiarityThreshold: familiarityWeight, // 0.7
    itemsNeedingVotesThreshold: familiarityWeight + itemsNeedingVotesWeight, // 0.85
    randomThreshold: 1.0 // 1.0 (everything above itemsNeedingVotesThreshold)
  };
};

module.exports = {
  getFamiliarityWeight,
  getVarietyWeight,
  getSelectionThresholds
};

