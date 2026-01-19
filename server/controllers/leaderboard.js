const db = require('../database');

/**
 * Calculate stats for a registered user
 */
const getRegisteredUserStats = async (userId, dbType, dbInstance) => {
  try {
    // Check if stats columns exist
    const hasStatsColumns = dbType === 'postgres'
      ? await db.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name IN ('upset_picks_count', 'longest_correct_streak', 'average_rating_difference')
        `).then(result => result.rows.length > 0)
      : await new Promise((resolve) => {
          dbInstance.all(`PRAGMA table_info(users)`, (err, columns) => {
            if (err) return resolve(false);
            const columnNames = columns.map(c => c.name);
            resolve(columnNames.includes('upset_picks_count'));
          });
        });

    if (!hasStatsColumns) {
      // Calculate from comparisons if columns don't exist
      return await calculateStatsFromComparisons(userId, null, dbType, dbInstance);
    }

    // Get stats from users table
    const userStats = dbType === 'postgres'
      ? await db.query(`
          SELECT 
            u.upset_picks_count,
            u.total_upsets_available,
            u.average_rating_difference,
            u.longest_correct_streak,
            (SELECT MAX(rating_difference) FROM comparisons 
             WHERE user_id = u.id AND was_upset = true) as biggest_upset
          FROM users u
          WHERE u.id = $1
        `, [userId])
      : await new Promise((resolve, reject) => {
          dbInstance.get(`
            SELECT 
              upset_picks_count,
              total_upsets_available,
              average_rating_difference,
              longest_correct_streak
            FROM users
            WHERE id = ?
          `, [userId], async (err, row) => {
            if (err) return reject(err);
            // Get biggest upset separately
            const biggestUpset = await new Promise((resolve2) => {
              dbInstance.get(`
                SELECT MAX(rating_difference) as biggest_upset
                FROM comparisons
                WHERE user_id = ? AND was_upset = 1
              `, [userId], (err2, row2) => {
                resolve2(err2 ? null : (row2?.biggest_upset || null));
              });
            });
            resolve({ ...row, biggest_upset: biggestUpset });
          });
        });

    const stats = dbType === 'postgres' ? userStats.rows[0] : userStats;
    
    return {
      upsetPicksCount: parseInt(stats?.upset_picks_count || 0),
      totalUpsetsAvailable: parseInt(stats?.total_upsets_available || 0),
      avgPointDifferential: parseFloat(stats?.average_rating_difference || 0),
      longestStreak: parseInt(stats?.longest_correct_streak || 0),
      biggestUpset: parseFloat(stats?.biggest_upset || null),
      upsetPickRate: stats?.total_upsets_available > 0 
        ? (parseInt(stats?.upset_picks_count || 0) / parseInt(stats?.total_upsets_available || 1)) * 100 
        : 0
    };
  } catch (err) {
    console.error('Error getting registered user stats:', err);
    return {
      upsetPicksCount: 0,
      totalUpsetsAvailable: 0,
      avgPointDifferential: 0,
      longestStreak: 0,
      biggestUpset: null,
      upsetPickRate: 0
    };
  }
};

/**
 * Calculate stats for an anonymous user from comparisons table
 */
const calculateStatsFromComparisons = async (userId, sessionId, dbType, dbInstance) => {
  try {
    const whereClause = userId 
      ? (dbType === 'postgres' ? 'user_id = $1' : 'user_id = ?')
      : (dbType === 'postgres' ? 'user_session_id = $1' : 'user_session_id = ?');
    const params = userId ? [userId] : [sessionId];

    const stats = dbType === 'postgres'
      ? await db.query(`
          SELECT 
            COUNT(*) as total_comparisons,
            SUM(CASE WHEN was_upset = true THEN 1 ELSE 0 END) as upset_picks,
            SUM(CASE WHEN was_upset = true THEN 1 ELSE 0 END) as total_upsets_available,
            AVG(rating_difference) as avg_diff,
            MAX(CASE WHEN was_upset = true THEN rating_difference ELSE NULL END) as biggest_upset
          FROM comparisons
          WHERE ${whereClause}
        `, params)
      : await new Promise((resolve, reject) => {
          // Check if columns exist first
          dbInstance.all(`PRAGMA table_info(comparisons)`, (err, columns) => {
            if (err) return reject(err);
            const columnNames = columns.map(c => c.name);
            const hasWasUpset = columnNames.includes('was_upset');
            const hasRatingDiff = columnNames.includes('rating_difference');

            if (!hasWasUpset || !hasRatingDiff) {
              return resolve({
                total_comparisons: 0,
                upset_picks: 0,
                total_upsets_available: 0,
                avg_diff: 0,
                biggest_upset: null
              });
            }

            dbInstance.get(`
              SELECT 
                COUNT(*) as total_comparisons,
                SUM(CASE WHEN was_upset = 1 THEN 1 ELSE 0 END) as upset_picks,
                SUM(CASE WHEN was_upset = 1 THEN 1 ELSE 0 END) as total_upsets_available,
                AVG(rating_difference) as avg_diff,
                MAX(CASE WHEN was_upset = 1 THEN rating_difference ELSE NULL END) as biggest_upset
              FROM comparisons
              WHERE ${whereClause}
            `, params, (err2, row) => {
              if (err2) reject(err2);
              else resolve(row || {
                total_comparisons: 0,
                upset_picks: 0,
                total_upsets_available: 0,
                avg_diff: 0,
                biggest_upset: null
              });
            });
          });
        });

    const row = dbType === 'postgres' ? stats.rows[0] : stats;
    
    // For longest streak, we'd need to calculate it from comparisons
    // For now, return 0 (can be enhanced later)
    const longestStreak = 0;

    return {
      upsetPicksCount: parseInt(row?.upset_picks || 0),
      totalUpsetsAvailable: parseInt(row?.total_upsets_available || 0),
      avgPointDifferential: parseFloat(row?.avg_diff || 0),
      longestStreak: longestStreak,
      biggestUpset: row?.biggest_upset ? parseFloat(row.biggest_upset) : null,
      upsetPickRate: parseInt(row?.total_upsets_available || 0) > 0
        ? (parseInt(row?.upset_picks || 0) / parseInt(row?.total_upsets_available || 1)) * 100
        : 0
    };
  } catch (err) {
    console.error('Error calculating stats from comparisons:', err);
    return {
      upsetPicksCount: 0,
      totalUpsetsAvailable: 0,
      avgPointDifferential: 0,
      longestStreak: 0,
      biggestUpset: null,
      upsetPickRate: 0
    };
  }
};

const getLeaderboard = async (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  
  // Cap at 10,000 to prevent performance issues
  if (limit > 10000) {
    limit = 10000;
  }
  
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  try {
    let rows = [];
    let total = 0;
    
    if (dbType === 'postgres') {
      // PostgreSQL: Combine user_sessions (anonymous) and users (logged-in)
      // Use UNION ALL to combine both, then order by comparisons_count
      if (limit >= 10000) {
        // Get all - combine anonymous sessions and logged-in users
        const result = await db.query(`
          SELECT 
            session_id as identifier,
            session_id,
            NULL as username,
            NULL as user_id,
            comparisons_count, 
            last_active,
            'anonymous' as user_type
          FROM user_sessions
          WHERE comparisons_count > 0
          
          UNION ALL
          
          SELECT 
            username as identifier,
            NULL as session_id,
            username,
            id as user_id,
            comparisons_count,
            last_active,
            'registered' as user_type
          FROM users
          WHERE comparisons_count > 0
          
          ORDER BY comparisons_count DESC
        `);
        rows = result.rows || [];
        
        // Get total count (combined)
        const countResult = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
            (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
        `);
        total = parseInt(countResult.rows[0]?.total || 0);
      } else {
        // Get with limit - combine and limit the combined result
        const result = await db.query(`
          SELECT * FROM (
            SELECT 
              session_id as identifier,
              session_id,
              NULL as username,
              NULL as user_id,
              comparisons_count, 
              last_active,
              'anonymous' as user_type
            FROM user_sessions
            WHERE comparisons_count > 0
            
            UNION ALL
            
            SELECT 
              username as identifier,
              NULL as session_id,
              username,
              id as user_id,
              comparisons_count,
              last_active,
              'registered' as user_type
            FROM users
            WHERE comparisons_count > 0
          ) combined
          ORDER BY comparisons_count DESC
          LIMIT $1
        `, [limit]);
        rows = result.rows || [];
        
        // Get total count (combined)
        const countResult = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
            (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
        `);
        total = parseInt(countResult.rows[0]?.total || 0);
      }
    } else {
      // SQLite: Combine user_sessions and users
      if (limit >= 10000) {
        // Get all
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT 
              session_id as identifier,
              session_id,
              NULL as username,
              NULL as user_id,
              comparisons_count, 
              last_active,
              'anonymous' as user_type
            FROM user_sessions
            WHERE comparisons_count > 0
            
            UNION ALL
            
            SELECT 
              username as identifier,
              NULL as session_id,
              username,
              id as user_id,
              comparisons_count,
              last_active,
              'registered' as user_type
            FROM users
            WHERE comparisons_count > 0
            
            ORDER BY comparisons_count DESC
          `, [], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT 
              (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
              (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
          `, [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      } else {
        // Get with limit
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT * FROM (
              SELECT 
                session_id as identifier,
                session_id,
                NULL as username,
                NULL as user_id,
                comparisons_count, 
                last_active,
                'anonymous' as user_type
              FROM user_sessions
              WHERE comparisons_count > 0
              
              UNION ALL
              
              SELECT 
                username as identifier,
                NULL as session_id,
                username,
                id as user_id,
                comparisons_count,
                last_active,
                'registered' as user_type
              FROM users
              WHERE comparisons_count > 0
            )
            ORDER BY comparisons_count DESC
            LIMIT ?
          `, [limit], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT 
              (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
              (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
          `, [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      }
    }
    
    console.log(`[Leaderboard] Fetched ${rows.length} users/sessions (limit: ${limit >= 10000 ? 'all' : limit}), total: ${total}`);
    
    // Calculate stats for each user
    const leaderboardWithStats = await Promise.all(rows.map(async (row, index) => {
      const baseData = {
        rank: index + 1,
        identifier: row.identifier || row.session_id || row.username,
        username: row.username || null,
        sessionId: row.session_id || null,
        userType: row.user_type || (row.username ? 'registered' : 'anonymous'),
        comparisonsCount: parseInt(row.comparisons_count || 0),
        lastActive: row.last_active
      };

      // Get stats based on user type
      let stats;
      if (row.user_type === 'registered' && row.user_id) {
        // Registered user - get stats from users table
        stats = await getRegisteredUserStats(row.user_id, dbType, dbInstance);
      } else {
        // Anonymous user - calculate from comparisons
        stats = await calculateStatsFromComparisons(null, row.session_id, dbType, dbInstance);
      }

      return {
        ...baseData,
        biggestUpset: stats.biggestUpset,
        longestStreak: stats.longestStreak,
        avgPointDifferential: stats.avgPointDifferential,
        upsetPicksCount: stats.upsetPicksCount,
        upsetPickRate: Math.round(stats.upsetPickRate * 10) / 10
      };
    }));

    // Identify top performers (top 3 in each category)
    const topUpsets = leaderboardWithStats
      .filter(u => u.biggestUpset !== null && u.biggestUpset > 0)
      .sort((a, b) => b.biggestUpset - a.biggestUpset)
      .slice(0, 3)
      .map(u => u.identifier);

    const topStreaks = leaderboardWithStats
      .filter(u => u.longestStreak > 0)
      .sort((a, b) => b.longestStreak - a.longestStreak)
      .slice(0, 3)
      .map(u => u.identifier);

    const topAvgDiffs = leaderboardWithStats
      .filter(u => u.avgPointDifferential > 0)
      .sort((a, b) => b.avgPointDifferential - a.avgPointDifferential)
      .slice(0, 3)
      .map(u => u.identifier);

    const topUpsetRates = leaderboardWithStats
      .filter(u => u.upsetPickRate > 0 && u.upsetPicksCount >= 3) // At least 3 upset picks
      .sort((a, b) => b.upsetPickRate - a.upsetPickRate)
      .slice(0, 3)
      .map(u => u.identifier);

    // Add flags to each user
    const leaderboard = leaderboardWithStats.map(user => ({
      ...user,
      isTopUpset: topUpsets.includes(user.identifier),
      isTopStreak: topStreaks.includes(user.identifier),
      isTopAvgDiff: topAvgDiffs.includes(user.identifier),
      isTopUpsetRate: topUpsetRates.includes(user.identifier)
    }));

    res.json({
      leaderboard,
      total
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard', 
      details: error.message 
    });
  }
};

module.exports = {
  getLeaderboard
};

