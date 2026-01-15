const db = require('../database');

/**
 * Get global statistics
 */
const getGlobalStats = (req, res) => {
  const dbInstance = db.getDb();
  
  // Get multiple stats in parallel
  Promise.all([
    new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    }),
    new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM comparisons', (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    }),
    new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM user_sessions', (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    }),
    new Promise((resolve) => {
      dbInstance.get(`
        SELECT COUNT(*) as count 
        FROM comparisons 
        WHERE date(created_at) = date('now')
      `, (err, row) => {
        resolve(err ? 0 : (row ? row.count : 0));
      });
    })
  ]).then(([totalItems, totalComparisons, totalUsers, todayComparisons]) => {
    res.json({
      totalItems,
      totalComparisons,
      totalUsers,
      todayComparisons
    });
  }).catch(err => {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  });
};

module.exports = {
  getGlobalStats
};

