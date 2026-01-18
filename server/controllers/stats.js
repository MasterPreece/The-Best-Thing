const { count, queryOne } = require('../utils/db-helpers');

/**
 * Get global statistics
 */
const getGlobalStats = async (req, res) => {
  try {
    // Get multiple stats in parallel using helper functions
    const [totalItems, totalComparisons, totalUsers, todayComparisonsResult] = await Promise.all([
      count('items'),
      count('comparisons'),
      count('user_sessions'),
      queryOne(`
        SELECT COUNT(*) as count 
        FROM comparisons 
        WHERE DATE(created_at) = CURRENT_DATE
      `)
    ]);
    
    const todayComparisons = todayComparisonsResult ? parseInt(todayComparisonsResult.count) : 0;
    
    res.json({
      totalItems,
      totalComparisons,
      totalUsers,
      todayComparisons
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

module.exports = {
  getGlobalStats
};

