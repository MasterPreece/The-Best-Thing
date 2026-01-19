const db = require('../database');

/**
 * Calculate user statistics from comparisons table
 */
const calculateUserStats = (userId) => {
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  return new Promise((resolve, reject) => {
    // First check what columns exist in comparisons table
    const checkColumnsSql = dbType === 'postgres'
      ? `SELECT column_name FROM information_schema.columns WHERE table_name = 'comparisons' AND column_name IN ('was_upset', 'rating_difference')`
      : `PRAGMA table_info(comparisons)`;
    
    // Check for columns
    if (dbType === 'postgres') {
      db.query(checkColumnsSql).then(result => {
        const columns = result.rows.map(r => r.column_name);
        const hasWasUpset = columns.includes('was_upset');
        const hasRatingDiff = columns.includes('rating_difference');
        processStats(hasWasUpset, hasRatingDiff);
      }).catch(() => {
        // If check fails, assume columns don't exist
        processStats(false, false);
      });
    } else {
      dbInstance.all(checkColumnsSql, (err, columns) => {
        if (err) {
          // If check fails, assume columns don't exist
          processStats(false, false);
          return;
        }
        const columnNames = columns.map(c => c.name);
        const hasWasUpset = columnNames.includes('was_upset');
        const hasRatingDiff = columnNames.includes('rating_difference');
        processStats(hasWasUpset, hasRatingDiff);
      });
    }
    
    const processStats = (hasWasUpset, hasRatingDiff) => {
      // Build SQL based on available columns
      const sql = dbType === 'postgres'
        ? hasWasUpset && hasRatingDiff
          ? `
            SELECT 
              COUNT(*) as total_comparisons,
              SUM(CASE WHEN c.was_upset = true THEN 1 ELSE 0 END) as total_upsets_available,
              SUM(CASE WHEN c.was_upset = true THEN 1 ELSE 0 END) as upset_picks,
              AVG(c.rating_difference) as avg_rating_difference
            FROM comparisons c
            WHERE c.user_id = $1
          `
          : `
            SELECT 
              COUNT(*) as total_comparisons,
              0 as total_upsets_available,
              0 as upset_picks,
              NULL as avg_rating_difference
            FROM comparisons c
            WHERE c.user_id = $1
          `
        : hasWasUpset && hasRatingDiff
          ? `
            SELECT 
              COUNT(*) as total_comparisons,
              SUM(CASE WHEN c.was_upset = 1 THEN 1 ELSE 0 END) as total_upsets_available,
              SUM(CASE WHEN c.was_upset = 1 THEN 1 ELSE 0 END) as upset_picks,
              AVG(c.rating_difference) as avg_rating_difference
            FROM comparisons c
            WHERE c.user_id = ?
          `
          : `
            SELECT 
              COUNT(*) as total_comparisons,
              0 as total_upsets_available,
              0 as upset_picks,
              NULL as avg_rating_difference
            FROM comparisons c
            WHERE c.user_id = ?
          `;

      const params = dbType === 'postgres' ? [userId] : [userId];

      dbInstance.get(sql, params, (err, row) => {
        if (err) {
          console.error('Error calculating user stats:', err);
          return resolve({
            upsetPicks: 0,
            totalUpsetsAvailable: 0,
            upsetPickRate: 0,
            averageRatingDifference: 0,
            favoriteCategoryId: null,
            longestCorrectStreak: 0
          });
        }

        const totalUpsetsAvailable = parseInt(row?.total_upsets_available || 0);
        const upsetPicks = parseInt(row?.upset_picks || 0);
        const upsetPickRate = totalUpsetsAvailable > 0 
          ? (upsetPicks / totalUpsetsAvailable) * 100 
          : 0;

        // Try to get favorite category, but don't fail if column doesn't exist
        const categorySql = dbType === 'postgres'
          ? `
            SELECT i.category_id, COUNT(*) as vote_count
            FROM comparisons c
            JOIN items i ON (c.item1_id = i.id OR c.item2_id = i.id)
            WHERE c.user_id = $1 AND i.category_id IS NOT NULL
            GROUP BY i.category_id
            ORDER BY vote_count DESC
            LIMIT 1
          `
          : `
            SELECT i.category_id, COUNT(*) as vote_count
            FROM comparisons c
            JOIN items i ON (c.item1_id = i.id OR c.item2_id = i.id)
            WHERE c.user_id = ? AND i.category_id IS NOT NULL
            GROUP BY i.category_id
            ORDER BY vote_count DESC
            LIMIT 1
          `;

        dbInstance.get(categorySql, params, (err2, categoryRow) => {
          if (err2) {
            // Category column might not exist, that's okay
            if (!err2.message.includes('category_id')) {
              console.error('Error getting favorite category:', err2);
            }
          }

          const favoriteCategoryId = categoryRow?.category_id || null;
          
          // For now, simplify streak calculation - always return 0
          // Can be enhanced later with proper SQL
          const longestCorrectStreak = 0;

          resolve({
            upsetPicks: upsetPicks,
            totalUpsetsAvailable: totalUpsetsAvailable,
            upsetPickRate: Math.round(upsetPickRate * 10) / 10, // Round to 1 decimal
            averageRatingDifference: Math.round((parseFloat(row?.avg_rating_difference) || 0) * 10) / 10,
            favoriteCategoryId: favoriteCategoryId,
            longestCorrectStreak: longestCorrectStreak
          });
        });
      });
    };
  });
};

/**
 * Update user statistics in users table (cached values)
 */
const updateUserStatsInDatabase = async (userId) => {
  const stats = await calculateUserStats(userId);
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  return new Promise((resolve, reject) => {
    const updateSql = dbType === 'postgres'
      ? `
        UPDATE users 
        SET upset_picks_count = $1,
            total_upsets_available = $2,
            average_rating_difference = $3,
            favorite_category_id = $4,
            longest_correct_streak = $5
        WHERE id = $6
      `
      : `
        UPDATE users 
        SET upset_picks_count = ?,
            total_upsets_available = ?,
            average_rating_difference = ?,
            favorite_category_id = ?,
            longest_correct_streak = ?
        WHERE id = ?
      `;

    const params = dbType === 'postgres'
      ? [stats.upsetPicks, stats.totalUpsetsAvailable, stats.averageRatingDifference, 
         stats.favoriteCategoryId, stats.longestCorrectStreak, userId]
      : [stats.upsetPicks, stats.totalUpsetsAvailable, stats.averageRatingDifference, 
         stats.favoriteCategoryId, stats.longestCorrectStreak, userId];

    dbInstance.run(updateSql, params, (err) => {
      if (err) {
        // Silently ignore "column doesn't exist" errors - migrations haven't run yet
        const errMsg = err.message || err.toString() || '';
        if (!errMsg.toLowerCase().includes('no such column')) {
          console.error('Error updating user stats in database:', err);
        }
        // Don't reject - stats are non-critical
      }
      resolve(stats);
    });
  });
};

module.exports = {
  calculateUserStats,
  updateUserStatsInDatabase
};

