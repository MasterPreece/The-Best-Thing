const db = require('../database');
const { queryMany, queryOne } = require('../utils/db-helpers');

const getRankings = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
    const sortOrder = req.query.sort === 'lowest' ? 'ASC' : 'DESC'; // Default to highest (DESC)
    
    console.log(`[Rankings] Requested limit: ${req.query.limit}, parsed limit: ${limit}, offset: ${offset}, category: ${categoryId}, sort: ${sortOrder}`);
    
    // Cap at 10,000 to prevent performance issues, but allow "all" to work
    if (limit > 10000) {
      limit = 10000;
    }
    
    let rankings, total;
    const categoryParams = categoryId ? [categoryId] : [];
    
    // If limit is very large, just get all items (no LIMIT clause)
    if (limit >= 10000) {
      try {
        const sql = categoryId
          ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                    c.id as category_id, c.name as category_name, c.slug as category_slug
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             WHERE i.category_id = ?
             ORDER BY i.elo_rating ${sortOrder}`
          : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                    c.id as category_id, c.name as category_name, c.slug as category_slug
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             ORDER BY i.elo_rating ${sortOrder}`;
        
        rankings = await queryMany(sql, categoryParams);
        total = rankings.length;
        console.log(`[Rankings] Fetched all items: ${rankings.length} total`);
      } catch (err) {
        // If categories column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === '42P01' && errorStr.includes('category')) ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('Categories not available for rankings, using simple query');
          const simpleSql = categoryId 
            ? `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               WHERE category_id = ?
               ORDER BY elo_rating ${sortOrder}`
            : `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               ORDER BY elo_rating ${sortOrder}`;
          
          rankings = await queryMany(simpleSql, categoryParams);
          total = rankings.length;
        } else {
          throw err;
        }
      }
      
      return res.json({
        rankings,
        limit: rankings.length,
        offset: 0,
        total
      });
    }
    
    // Paginated query
    try {
      const sql = categoryId
        ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           WHERE i.category_id = ?
           ORDER BY i.elo_rating ${sortOrder}
           LIMIT ? OFFSET ?`
        : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           ORDER BY i.elo_rating ${sortOrder}
           LIMIT ? OFFSET ?`;
      
      const params = categoryId ? [categoryId, limit, offset] : [limit, offset];
      rankings = await queryMany(sql, params);
      
      // Get total count
      const countSql = categoryId 
        ? `SELECT COUNT(*) as total FROM items WHERE category_id = ?`
        : `SELECT COUNT(*) as total FROM items`;
      const countResult = await queryOne(countSql, categoryParams);
      total = parseInt(countResult?.total || 0);
      
      console.log(`[Rankings] Fetched ${rankings.length} items with limit ${limit}, total: ${total}`);
    } catch (err) {
      // If categories column doesn't exist, fallback to simple query
      const errorStr = err.message || err.toString() || '';
      if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
          (err.code === '42P01' && errorStr.includes('category')) ||
          (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
        console.log('Categories not available for rankings, using simple query');
        const simpleSql = categoryId 
          ? `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
             FROM items
             WHERE category_id = ?
             ORDER BY elo_rating ${sortOrder}
             LIMIT ? OFFSET ?`
          : `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
             FROM items
             ORDER BY elo_rating ${sortOrder}
             LIMIT ? OFFSET ?`;
        
        const simpleParams = categoryId ? [categoryId, limit, offset] : [limit, offset];
        rankings = await queryMany(simpleSql, simpleParams);
        
        const countSql = categoryId 
          ? `SELECT COUNT(*) as total FROM items WHERE category_id = ?`
          : `SELECT COUNT(*) as total FROM items`;
        const countResult = await queryOne(countSql, categoryParams);
        total = countResult ? parseInt(countResult.total) : rankings.length;
      } else {
        throw err;
      }
    }
    
    res.json({
      rankings,
      limit,
      offset,
      total
    });
  } catch (error) {
    console.error('Error fetching rankings:', error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
};

/**
 * Search for an item and return its ranking
 */
const searchItem = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const searchTerm = `%${query}%`;
    const startsWithTerm = `${query}%`;
    
    // Search for items matching the query (case-insensitive)
    const items = await queryMany(`
      SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
      FROM items
      WHERE LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)
      ORDER BY 
        CASE 
          WHEN LOWER(title) LIKE LOWER(?) THEN 1
          WHEN LOWER(title) LIKE LOWER(?) THEN 2
          ELSE 3
        END,
        elo_rating DESC
      LIMIT 20
    `, [searchTerm, searchTerm, startsWithTerm, searchTerm]);
    
    if (items.length === 0) {
      return res.json({
        results: [],
        query,
        count: 0
      });
    }
    
    // Calculate rank for each item individually
    const rankPromises = items.map(async (item) => {
      try {
        const rankResult = await queryOne(`
          SELECT COUNT(*) + 1 as rank
          FROM items
          WHERE elo_rating > ?
        `, [item.elo_rating]);
        return { id: item.id, rank: rankResult ? parseInt(rankResult.rank) : null };
      } catch (err) {
        console.error(`Error calculating rank for item ${item.id}:`, err);
        return { id: item.id, rank: null };
      }
    });
    
    const rankings = await Promise.all(rankPromises);
    
    // Merge ranking info with items
    const rankingMap = {};
    rankings.forEach(r => {
      rankingMap[r.id] = r.rank;
    });
    
    const results = items.map(item => ({
      ...item,
      rank: rankingMap[item.id] || null
    }));
    
    res.json({
      results,
      query,
      count: results.length
    });
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
};

const getItemById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get basic item info
    const item = await queryOne(`
      SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses, created_at
      FROM items
      WHERE id = ?
    `, [id]);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Get ranking position
    const rankResult = await queryOne(`
      SELECT COUNT(*) + 1 as rank
      FROM items
      WHERE elo_rating > ?
    `, [item.elo_rating]);
    const rank = rankResult ? parseInt(rankResult.rank) : null;
    
    // Calculate win rate
    const winRate = item.comparison_count > 0 
      ? ((item.wins / item.comparison_count) * 100).toFixed(1)
      : 0;
    
    // Get recent comparisons involving this item (last 10)
    const recentComparisons = await queryMany(`
      SELECT 
        c.id,
        c.created_at,
        CASE 
          WHEN c.item1_id = ? THEN c.item2_id
          ELSE c.item1_id
        END as opponent_id,
        CASE 
          WHEN c.item1_id = ? THEN i2.title
          ELSE i1.title
        END as opponent_title,
        CASE 
          WHEN c.item1_id = ? THEN i2.image_url
          ELSE i1.image_url
        END as opponent_image,
        CASE WHEN c.winner_id = ? THEN 1 ELSE 0 END as won
      FROM comparisons c
      LEFT JOIN items i1 ON c.item1_id = i1.id
      LEFT JOIN items i2 ON c.item2_id = i2.id
      WHERE (c.item1_id = ? OR c.item2_id = ?)
      ORDER BY c.created_at DESC
      LIMIT 10
    `, [id, id, id, id, id, id]) || [];
    
    // Get most common opponents
    const topOpponents = await queryMany(`
      SELECT 
        CASE 
          WHEN c.item1_id = ? THEN c.item2_id
          ELSE c.item1_id
        END as opponent_id,
        CASE 
          WHEN c.item1_id = ? THEN i2.title
          ELSE i1.title
        END as opponent_title,
        CASE 
          WHEN c.item1_id = ? THEN i2.image_url
          ELSE i1.image_url
        END as opponent_image,
        COUNT(*) as match_count,
        SUM(CASE WHEN c.winner_id = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN c.winner_id != ? THEN 1 ELSE 0 END) as losses
      FROM comparisons c
      LEFT JOIN items i1 ON c.item1_id = i1.id
      LEFT JOIN items i2 ON c.item2_id = i2.id
      WHERE (c.item1_id = ? OR c.item2_id = ?)
      GROUP BY opponent_id, opponent_title, opponent_image
      ORDER BY match_count DESC
      LIMIT 5
    `, [id, id, id, id, id, id, id]) || [];
    
    // Format response
    const response = {
      ...item,
      rank,
      winRate: parseFloat(winRate),
      recentComparisons: recentComparisons.map(c => ({
        id: c.id,
        createdAt: c.created_at,
        opponent: {
          id: c.opponent_id,
          title: c.opponent_title,
          imageUrl: c.opponent_image
        },
        won: c.won === true || c.won === 1
      })),
      topOpponents: topOpponents.map(o => ({
        id: o.opponent_id,
        title: o.opponent_title,
        imageUrl: o.opponent_image,
        matchCount: parseInt(o.match_count || 0),
        wins: parseInt(o.wins || 0),
        losses: parseInt(o.losses || 0)
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ error: 'Failed to fetch item details' });
  }
};

/**
 * Get trending/hot items (rising in rankings)
 * Items with recent activity or rising ratings
 */
const getTrendingItems = (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  
  if (dbType === 'postgres') {
    // Get items with recent comparisons, ordered by activity
    db.query(`
      SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating, 
             i.comparison_count, i.wins, i.losses,
             c.id as category_id, c.name as category_name, c.slug as category_slug,
             COUNT(cmp.id) as recent_comparisons
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
        AND cmp.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY i.id, c.id
      HAVING COUNT(cmp.id) > 0
      ORDER BY recent_comparisons DESC, i.elo_rating DESC
      LIMIT $1
    `, [limit]).then(result => {
      // Calculate ranks for each item
      const itemsWithRanks = result.rows.map((item, index) => ({
        ...item,
        rank: index + 1,
        trend: 'hot' // Hot items are trending
      }));
      
      res.json({
        trending: itemsWithRanks,
        count: itemsWithRanks.length
      });
    }).catch(err => {
      console.error('Error fetching trending items:', err);
      res.status(500).json({ error: 'Failed to fetch trending items' });
    });
    return;
  }
  
  // SQLite version - with fallback for missing categories
  dbInstance.all(`
    SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
           i.comparison_count, i.wins, i.losses,
           c.id as category_id, c.name as category_name, c.slug as category_slug,
           COUNT(cmp.id) as recent_comparisons
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
      AND datetime(cmp.created_at) >= datetime('now', '-24 hours')
    GROUP BY i.id, c.id
    HAVING COUNT(cmp.id) > 0
    ORDER BY recent_comparisons DESC, i.elo_rating DESC
    LIMIT ?
  `, [limit], (err, rows) => {
    if (err) {
      // If categories table/column doesn't exist, fallback to simple query
      const errorStr = err.message || err.toString() || '';
      if (errorStr.includes('no such table: categories') || 
          errorStr.includes('no such column') || 
          errorStr.includes('category_id') ||
          (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
        console.log('Categories not available for trending items, using simple query');
        return dbInstance.all(`
          SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
                 i.comparison_count, i.wins, i.losses,
                 COUNT(cmp.id) as recent_comparisons
          FROM items i
          LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
            AND datetime(cmp.created_at) >= datetime('now', '-24 hours')
          GROUP BY i.id
          HAVING COUNT(cmp.id) > 0
          ORDER BY recent_comparisons DESC, i.elo_rating DESC
          LIMIT ?
        `, [limit], (fallbackErr, fallbackRows) => {
          if (fallbackErr) {
            console.error('Error fetching trending items:', fallbackErr);
            return res.status(500).json({ error: 'Failed to fetch trending items', details: fallbackErr.message });
          }
          
          // Calculate ranks for each item
          const itemsWithRanks = (fallbackRows || []).map((item, index) => ({
            ...item,
            rank: index + 1,
            trend: 'hot'
          }));
          
          res.json({
            trending: itemsWithRanks,
            count: itemsWithRanks.length
          });
        });
      }
      
      console.error('Error fetching trending items:', err);
      return res.status(500).json({ error: 'Failed to fetch trending items', details: err.message });
    }
    
    // Calculate ranks for each item
    const itemsWithRanks = (rows || []).map((item, index) => ({
      ...item,
      rank: index + 1,
      trend: 'hot'
    }));
    
    res.json({
      trending: itemsWithRanks,
      count: itemsWithRanks.length
    });
  });
};

/**
 * Get rising and falling items
 * Items with recent wins (rising) vs recent losses (falling)
 */
const getRisingFalling = (req, res) => {
  const limit = parseInt(req.query.limit) || 3;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  
  if (dbType === 'postgres') {
    // Get items with recent wins (rising)
    const risingQuery = `
      SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
             i.comparison_count, i.wins, i.losses,
             COUNT(CASE WHEN (cmp.item1_id = i.id AND cmp.winner_id = i.id) 
                       OR (cmp.item2_id = i.id AND cmp.winner_id = i.id) 
                  THEN 1 END) as recent_wins
      FROM items i
      LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
        AND cmp.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY i.id
      HAVING COUNT(CASE WHEN (cmp.item1_id = i.id AND cmp.winner_id = i.id) 
                           OR (cmp.item2_id = i.id AND cmp.winner_id = i.id) 
                      THEN 1 END) > 0
      ORDER BY recent_wins DESC, i.elo_rating DESC
      LIMIT $1
    `;
    
    // Get items with recent losses (falling)
    const fallingQuery = `
      SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
             i.comparison_count, i.wins, i.losses,
             COUNT(CASE WHEN ((cmp.item1_id = i.id AND cmp.winner_id != i.id) 
                           OR (cmp.item2_id = i.id AND cmp.winner_id != i.id))
                       AND cmp.winner_id IS NOT NULL
                  THEN 1 END) as recent_losses
      FROM items i
      LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
        AND cmp.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY i.id
      HAVING COUNT(CASE WHEN ((cmp.item1_id = i.id AND cmp.winner_id != i.id) 
                                 OR (cmp.item2_id = i.id AND cmp.winner_id != i.id))
                            AND cmp.winner_id IS NOT NULL
                       THEN 1 END) > 0
      ORDER BY recent_losses DESC, i.elo_rating DESC
      LIMIT $1
    `;
    
    Promise.all([
      db.query(risingQuery, [limit]),
      db.query(fallingQuery, [limit])
    ]).then(([risingResult, fallingResult]) => {
      res.json({
        rising: risingResult.rows || [],
        falling: fallingResult.rows || []
      });
    }).catch(err => {
      console.error('Error fetching rising/falling items:', err);
      res.status(500).json({ error: 'Failed to fetch rising/falling items' });
    });
    return;
  }
  
  // SQLite version
  const risingQuery = `
    SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
           i.comparison_count, i.wins, i.losses,
           COUNT(CASE WHEN (cmp.item1_id = i.id AND cmp.winner_id = i.id) 
                     OR (cmp.item2_id = i.id AND cmp.winner_id = i.id) 
                THEN 1 END) as recent_wins
    FROM items i
    LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
      AND datetime(cmp.created_at) >= datetime('now', '-24 hours')
    GROUP BY i.id
    HAVING COUNT(CASE WHEN (cmp.item1_id = i.id AND cmp.winner_id = i.id) 
                         OR (cmp.item2_id = i.id AND cmp.winner_id = i.id) 
                    THEN 1 END) > 0
    ORDER BY recent_wins DESC, i.elo_rating DESC
    LIMIT ?
  `;
  
  const fallingQuery = `
    SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
           i.comparison_count, i.wins, i.losses,
           COUNT(CASE WHEN ((cmp.item1_id = i.id AND cmp.winner_id != i.id) 
                         OR (cmp.item2_id = i.id AND cmp.winner_id != i.id))
                     AND cmp.winner_id IS NOT NULL
                THEN 1 END) as recent_losses
    FROM items i
    LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
      AND datetime(cmp.created_at) >= datetime('now', '-24 hours')
    GROUP BY i.id
    HAVING COUNT(CASE WHEN ((cmp.item1_id = i.id AND cmp.winner_id != i.id) 
                               OR (cmp.item2_id = i.id AND cmp.winner_id != i.id))
                          AND cmp.winner_id IS NOT NULL
                     THEN 1 END) > 0
    ORDER BY recent_losses DESC, i.elo_rating DESC
    LIMIT ?
  `;
  
  dbInstance.all(risingQuery, [limit], (risingErr, risingRows) => {
    if (risingErr) {
      console.error('Error fetching rising items:', risingErr);
      return res.status(500).json({ error: 'Failed to fetch rising items' });
    }
    
    dbInstance.all(fallingQuery, [limit], (fallingErr, fallingRows) => {
      if (fallingErr) {
        console.error('Error fetching falling items:', fallingErr);
        return res.status(500).json({ error: 'Failed to fetch falling items' });
      }
      
      res.json({
        rising: risingRows || [],
        falling: fallingRows || []
      });
    });
  });
};

/**
 * Get detailed statistics for a specific item
 */
const getItemStats = async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    
    if (!itemId) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const dbInstance = db.getDb();
    const dbType = db.getDbType();

    // Get item details with all metrics
    const sql = dbType === 'postgres'
      ? `
        SELECT 
          id, title, elo_rating, comparison_count, wins, losses,
          peak_rating, peak_rating_date, rating_7days_ago, rating_30days_ago,
          first_vote_date, current_streak_wins, current_streak_losses,
          longest_win_streak, upset_win_count, win_rate_last_100,
          rating_change_last_7days, consistency_score
        FROM items
        WHERE id = $1
      `
      : `
        SELECT 
          id, title, elo_rating, comparison_count, wins, losses,
          peak_rating, peak_rating_date, rating_7days_ago, rating_30days_ago,
          first_vote_date, current_streak_wins, current_streak_losses,
          longest_win_streak, upset_win_count, win_rate_last_100,
          rating_change_last_7days, consistency_score
        FROM items
        WHERE id = ?
      `;

    const params = dbType === 'postgres' ? [itemId] : [itemId];

    const item = await new Promise((resolve, reject) => {
      dbInstance.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Calculate trend direction
    let trend = 'stable';
    if (item.rating_change_last_7days) {
      if (item.rating_change_last_7days > 10) {
        trend = 'rising';
      } else if (item.rating_change_last_7days < -10) {
        trend = 'falling';
      }
    }

    res.json({
      id: item.id,
      title: item.title,
      currentRating: item.elo_rating || 1500,
      peakRating: item.peak_rating || item.elo_rating || 1500,
      peakRatingDate: item.peak_rating_date,
      comparisonCount: item.comparison_count || 0,
      wins: item.wins || 0,
      losses: item.losses || 0,
      winRate: item.comparison_count > 0 ? ((item.wins || 0) / item.comparison_count * 100).toFixed(1) : 0,
      // Streaks
      currentStreakWins: item.current_streak_wins || 0,
      currentStreakLosses: item.current_streak_losses || 0,
      longestWinStreak: item.longest_win_streak || 0,
      // Upsets
      upsetWinCount: item.upset_win_count || 0,
      // Trends
      rating7DaysAgo: item.rating_7days_ago,
      rating30DaysAgo: item.rating_30days_ago,
      ratingChangeLast7Days: item.rating_change_last_7days || 0,
      trend: trend,
      // Performance
      winRateLast100: item.win_rate_last_100,
      consistencyScore: item.consistency_score,
      firstVoteDate: item.first_vote_date
    });
  } catch (error) {
    console.error('Error fetching item stats:', error);
    res.status(500).json({ error: 'Failed to fetch item statistics' });
  }
};

module.exports = {
  getRankings,
  searchItem,
  getItemById,
  getTrendingItems,
  getRisingFalling,
  getItemStats
};
