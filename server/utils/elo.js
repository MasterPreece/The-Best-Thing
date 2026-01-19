// Elo rating system for ranking items
// K-factor determines how much ratings change per game (higher = more volatile)
const BASE_K_FACTOR = 32;
const HIGH_CONFIDENCE_K = 16; // Stable for items with many comparisons
const MEDIUM_CONFIDENCE_K = 24; // Normal for items with moderate comparisons
const LOW_CONFIDENCE_K = 32; // Volatile for items with few comparisons

/**
 * Calculate expected score for player A
 */
const expectedScore = (ratingA, ratingB) => {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
};

/**
 * Get dynamic K-factor based on rating confidence
 * @param {number} ratingConfidence - Confidence level (0-1)
 * @returns {number} K-factor to use
 */
const getDynamicKFactor = (ratingConfidence) => {
  if (ratingConfidence >= 0.8) {
    // High confidence: use lower K-factor for stability
    return HIGH_CONFIDENCE_K;
  } else if (ratingConfidence >= 0.33) {
    // Medium confidence: use medium K-factor
    return MEDIUM_CONFIDENCE_K;
  } else {
    // Low confidence: use higher K-factor to learn faster
    return LOW_CONFIDENCE_K;
  }
};

/**
 * Update Elo ratings after a match
 * @param {number} rating1 - Current rating of item 1
 * @param {number} rating2 - Current rating of item 2
 * @param {boolean} item1Won - Whether item 1 won
 * @param {number} confidence1 - Rating confidence for item 1 (optional)
 * @param {number} confidence2 - Rating confidence for item 2 (optional)
 * @returns {Object} New ratings for both items
 */
const updateEloRatings = (rating1, rating2, item1Won, confidence1 = 0, confidence2 = 0) => {
  const expected1 = expectedScore(rating1, rating2);
  const expected2 = expectedScore(rating2, rating1);
  
  const actual1 = item1Won ? 1 : 0;
  const actual2 = item1Won ? 0 : 1;
  
  // Use dynamic K-factor based on confidence if provided, otherwise use base K
  const k1 = confidence1 !== undefined ? getDynamicKFactor(confidence1) : BASE_K_FACTOR;
  const k2 = confidence2 !== undefined ? getDynamicKFactor(confidence2) : BASE_K_FACTOR;
  
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
  BASE_K_FACTOR,
  HIGH_CONFIDENCE_K,
  MEDIUM_CONFIDENCE_K,
  LOW_CONFIDENCE_K
};

