/**
 * Wrapper for seed-top-2000 script that can be imported as a module
 * (without calling process.exit())
 */

const { seedTopArticles } = require('./seed-top-2000');

module.exports = seedTopArticles;

