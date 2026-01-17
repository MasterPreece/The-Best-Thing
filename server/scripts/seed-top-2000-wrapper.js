/**
 * Wrapper for seed-top-2000 script that can be imported as a module
 * (without calling process.exit())
 */

const { seedTopArticles } = require('./seed-top-2000');

// Export function that accepts parameters
module.exports = (targetCount, category, startRank, endRank) => {
  return seedTopArticles(targetCount, category, startRank, endRank);
};

