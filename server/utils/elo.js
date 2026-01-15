// Elo rating system for ranking items
// K-factor determines how much ratings change per game (higher = more volatile)
const K_FACTOR = 32;

/**
 * Calculate expected score for player A
 */
const expectedScore = (ratingA, ratingB) => {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
};

/**
 * Update Elo ratings after a match
 * @param {number} rating1 - Current rating of item 1
 * @param {number} rating2 - Current rating of item 2
 * @param {boolean} item1Won - Whether item 1 won
 * @returns {Object} New ratings for both items
 */
const updateEloRatings = (rating1, rating2, item1Won) => {
  const expected1 = expectedScore(rating1, rating2);
  const expected2 = expectedScore(rating2, rating1);
  
  const actual1 = item1Won ? 1 : 0;
  const actual2 = item1Won ? 0 : 1;
  
  const newRating1 = rating1 + K_FACTOR * (actual1 - expected1);
  const newRating2 = rating2 + K_FACTOR * (actual2 - expected2);
  
  return {
    newRating1,
    newRating2
  };
};

module.exports = {
  updateEloRatings,
  expectedScore
};

