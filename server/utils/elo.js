// Elo rating system for ranking items
// K-factor determines how much ratings change per game (higher = more volatile)
const settings = require('./settings');

// Default values (used as fallback)
const DEFAULT_BASE_K_FACTOR = 32;
const DEFAULT_HIGH_CONFIDENCE_K = 16;
const DEFAULT_MEDIUM_CONFIDENCE_K = 24;
const DEFAULT_LOW_CONFIDENCE_K = 32;
const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_MEDIUM_CONFIDENCE_THRESHOLD = 0.33;

/**
 * Calculate expected score for player A
 */
const expectedScore = (ratingA, ratingB) => {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
};

/**
 * Get dynamic K-factor based on rating confidence
 * @param {number} ratingConfidence - Confidence level (0-1)
 * @returns {Promise<number>} K-factor to use
 */
const getDynamicKFactor = async (ratingConfidence) => {
  const highThreshold = await settings.getHighConfidenceThreshold();
  const mediumThreshold = await settings.getMediumConfidenceThreshold();
  const highK = await settings.getHighConfidenceK();
  const mediumK = await settings.getMediumConfidenceK();
  const lowK = await settings.getLowConfidenceK();
  
  if (ratingConfidence >= highThreshold) {
    // High confidence: use lower K-factor for stability
    return highK;
  } else if (ratingConfidence >= mediumThreshold) {
    // Medium confidence: use medium K-factor
    return mediumK;
  } else {
    // Low confidence: use higher K-factor to learn faster
    return lowK;
  }
};

/**
 * Update Elo ratings after a match
 * @param {number} rating1 - Current rating of item 1
 * @param {number} rating2 - Current rating of item 2
 * @param {boolean} item1Won - Whether item 1 won
 * @param {number} confidence1 - Rating confidence for item 1 (optional)
 * @param {number} confidence2 - Rating confidence for item 2 (optional)
 * @returns {Promise<Object>} New ratings for both items
 */
const updateEloRatings = async (rating1, rating2, item1Won, confidence1 = 0, confidence2 = 0) => {
  const expected1 = expectedScore(rating1, rating2);
  const expected2 = expectedScore(rating2, rating1);
  
  const actual1 = item1Won ? 1 : 0;
  const actual2 = item1Won ? 0 : 1;
  
  // Use dynamic K-factor based on confidence if provided, otherwise use base K
  const baseK = await settings.getBaseKFactor();
  const k1 = confidence1 !== undefined ? await getDynamicKFactor(confidence1) : baseK;
  const k2 = confidence2 !== undefined ? await getDynamicKFactor(confidence2) : baseK;
  
  const newRating1 = rating1 + k1 * (actual1 - expected1);
  const newRating2 = rating2 + k2 * (actual2 - expected2);
  
  return {
    newRating1,
    newRating2
  };
};

module.exports = {
  updateEloRatings,
  expectedScore,
  getDynamicKFactor,
  // Export defaults for backwards compatibility
  BASE_K_FACTOR: DEFAULT_BASE_K_FACTOR,
  HIGH_CONFIDENCE_K: DEFAULT_HIGH_CONFIDENCE_K,
  MEDIUM_CONFIDENCE_K: DEFAULT_MEDIUM_CONFIDENCE_K,
  LOW_CONFIDENCE_K: DEFAULT_LOW_CONFIDENCE_K
};

