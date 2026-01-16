const db = require('../database');

const getRankings = (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
  
  console.log(`[Rankings] Requested limit: ${req.query.limit}, parsed limit: ${limit}, offset: ${offset}, category: ${categoryId}`);
  
  // Cap at 10,000 to prevent performance issues, but allow "all" to work
  if (limit > 10000) {
    limit = 10000;
  }
  
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  
  // Build WHERE clause for category filter
  const categoryFilter = categoryId ? (dbType === 'postgres' ? 'WHERE i.category_id = $1' : 'WHERE i.category_id = ?') : '';
  const categoryParams = categoryId ? [categoryId] : [];
  
  // If limit is very large, just get all items (no LIMIT clause)
  if (limit >= 10000) {
    if (dbType === 'postgres') {
      const sql = categoryId
        ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           WHERE i.category_id = $1
           ORDER BY i.elo_rating DESC`
        : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           ORDER BY i.elo_rating DESC`;
      
      db.query(sql, categoryParams).then(result => {
        res.json({
          rankings: result.rows,
          limit: result.rows.length,
          offset: 0,
          total: result.rows.length
        });
      }).catch(err => {
        // If categories column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === '42P01' && errorStr.includes('category'))) {
          console.log('Categories not available for rankings, using simple query');
          const simpleSql = categoryId 
            ? `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               WHERE category_id = $1
               ORDER BY elo_rating DESC`
            : `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               ORDER BY elo_rating DESC`;
          const simpleParams = categoryId ? [categoryId] : [];
          
          return db.query(simpleSql, simpleParams).then(result => {
            res.json({
              rankings: result.rows,
              limit: result.rows.length,
              offset: 0,
              total: result.rows.length
            });
          }).catch(fallbackErr => {
            console.error('Error fetching rankings:', fallbackErr);
            res.status(500).json({ error: 'Failed to fetch rankings' });
          });
        }
        console.error('Error fetching rankings:', err);
        res.status(500).json({ error: 'Failed to fetch rankings' });
      });
      return;
    }
    
    const sql = categoryId
      ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                c.id as category_id, c.name as category_name, c.slug as category_slug
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.category_id = ?
         ORDER BY i.elo_rating DESC`
      : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                c.id as category_id, c.name as category_name, c.slug as category_slug
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         ORDER BY i.elo_rating DESC`;
    
    dbInstance.all(sql, categoryParams, (err, rows) => {
      if (err) {
        // If categories column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('Categories not available for rankings, using simple query');
          const simpleSql = categoryId 
            ? `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               WHERE category_id = ?
               ORDER BY elo_rating DESC`
            : `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               ORDER BY elo_rating DESC`;
          const simpleParams = categoryId ? [categoryId] : [];
          
          return dbInstance.all(simpleSql, simpleParams, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              console.error('Error fetching rankings:', fallbackErr);
              return res.status(500).json({ error: 'Failed to fetch rankings' });
            }
            
            res.json({
              rankings: fallbackRows,
              limit: fallbackRows.length,
              offset: 0,
              total: fallbackRows.length
            });
          });
        }
        console.error('Error fetching rankings:', err);
        return res.status(500).json({ error: 'Failed to fetch rankings' });
      }
      
      console.log(`[Rankings] Fetched all items: ${rows.length} total`);
      
      res.json({
        rankings: rows,
        limit: rows.length,
        offset: 0,
        total: rows.length
      });
    });
  } else {
    if (dbType === 'postgres') {
      const sql = categoryId
        ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           WHERE i.category_id = $1
           ORDER BY i.elo_rating DESC
           LIMIT $2 OFFSET $3`
        : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                  c.id as category_id, c.name as category_name, c.slug as category_slug
           FROM items i
           LEFT JOIN categories c ON i.category_id = c.id
           ORDER BY i.elo_rating DESC
           LIMIT $1 OFFSET $2`;
      
      const params = categoryId ? [categoryId, limit, offset] : [limit, offset];
      
      db.query(sql, params).then(result => {
        // Get total count
        const countSql = categoryId 
          ? `SELECT COUNT(*) as total FROM items WHERE category_id = $1`
          : `SELECT COUNT(*) as total FROM items`;
        const countParams = categoryId ? [categoryId] : [];
        
        return db.query(countSql, countParams).then(countResult => {
          const total = parseInt(countResult.rows[0]?.total || 0);
          console.log(`[Rankings] Fetched ${result.rows.length} items with limit ${limit}, total: ${total}`);
          res.json({
            rankings: result.rows,
            limit,
            offset,
            total
          });
        });
      }).catch(err => {
        console.error('Error fetching rankings:', err);
        res.status(500).json({ error: 'Failed to fetch rankings' });
      });
      return;
    }
    
    const sql = categoryId
      ? `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                c.id as category_id, c.name as category_name, c.slug as category_slug
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.category_id = ?
         ORDER BY i.elo_rating DESC
         LIMIT ? OFFSET ?`
      : `SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count, i.wins, i.losses,
                c.id as category_id, c.name as category_name, c.slug as category_slug
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         ORDER BY i.elo_rating DESC
         LIMIT ? OFFSET ?`;
    const params = categoryId ? [categoryId, limit, offset] : [limit, offset];
    
    dbInstance.all(sql, params, (err, rows) => {
      if (err) {
        // If categories column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('Categories not available for rankings, using simple query');
          const simpleSql = categoryId 
            ? `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               WHERE category_id = ?
               ORDER BY elo_rating DESC
               LIMIT ? OFFSET ?`
            : `SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
               FROM items
               ORDER BY elo_rating DESC
               LIMIT ? OFFSET ?`;
          const simpleParams = categoryId ? [categoryId, limit, offset] : [limit, offset];
          
          return dbInstance.all(simpleSql, simpleParams, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              console.error('Error fetching rankings:', fallbackErr);
              return res.status(500).json({ error: 'Failed to fetch rankings' });
            }
            
            const countSql = categoryId 
              ? `SELECT COUNT(*) as total FROM items WHERE category_id = ?`
              : `SELECT COUNT(*) as total FROM items`;
            const countParams = categoryId ? [categoryId] : [];
            
            dbInstance.get(countSql, countParams, (countErr, countRow) => {
              const total = countRow ? countRow.total : fallbackRows.length;
              
              res.json({
                rankings: fallbackRows,
                limit,
                offset,
                total
              });
            });
          });
        }
        console.error('Error fetching rankings:', err);
        return res.status(500).json({ error: 'Failed to fetch rankings' });
      }
      
      console.log(`[Rankings] Fetched ${rows.length} items with limit ${limit}`);
      
      // Get total count for pagination info
      const countSql = categoryId 
        ? `SELECT COUNT(*) as total FROM items WHERE category_id = ?`
        : `SELECT COUNT(*) as total FROM items`;
      const countParams = categoryId ? [categoryId] : [];
      
      dbInstance.get(countSql, countParams, (err, countRow) => {
        const total = countRow ? countRow.total : rows.length;
        
        console.log(`[Rankings] Total items in database: ${total}`);
        
        res.json({
          rankings: rows,
          limit,
          offset,
          total
        });
      });
    });
  }
};

/**
 * Search for an item and return its ranking
 */
const searchItem = (req, res) => {
  const { query } = req.query;
  
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  const dbInstance = db.getDb();
  const searchTerm = `%${query}%`;
  const startsWithTerm = `${query}%`;
  
  // Search for items matching the query (case-insensitive)
  dbInstance.all(`
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
  `, [searchTerm, searchTerm, startsWithTerm, searchTerm], (err, items) => {
    if (err) {
      console.error('Error searching items:', err);
      return res.status(500).json({ error: 'Failed to search items' });
    }
    
    if (items.length === 0) {
      return res.json({
        results: [],
        query,
        count: 0
      });
    }
    
    // Calculate rank for each item individually
    // This is more reliable than using correlated subqueries with IN clauses
    const rankPromises = items.map(item => {
      return new Promise((resolve) => {
        dbInstance.get(`
          SELECT COUNT(*) + 1 as rank
          FROM items
          WHERE elo_rating > ?
        `, [item.elo_rating], (err, rankRow) => {
          if (err) {
            console.error(`Error calculating rank for item ${item.id}:`, err);
            resolve({ id: item.id, rank: null });
          } else {
            resolve({ id: item.id, rank: rankRow ? rankRow.rank : null });
          }
        });
      });
    });
    
    Promise.all(rankPromises).then(rankings => {
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
    }).catch(err => {
      console.error('Error calculating rankings:', err);
      res.status(500).json({ error: 'Failed to calculate rankings' });
    });
  });
};

const getItemById = async (req, res) => {
  const { id } = req.params;
  const dbType = db.getDbType();
  
  try {
    // Get basic item info
    let item = null;
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses, created_at
        FROM items
        WHERE id = $1
      `, [id]);
      item = result.rows[0] || null;
    } else {
      const dbInstance = db.getDb();
      item = await new Promise((resolve, reject) => {
        dbInstance.get(`
          SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses, created_at
          FROM items
          WHERE id = ?
        `, [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Get ranking position
    let rank = null;
    if (dbType === 'postgres') {
      const rankResult = await db.query(`
        SELECT COUNT(*) + 1 as rank
        FROM items
        WHERE elo_rating > $1
      `, [item.elo_rating]);
      rank = parseInt(rankResult.rows[0]?.rank || 0);
    } else {
      const dbInstance = db.getDb();
      const rankRow = await new Promise((resolve) => {
        dbInstance.get(`
          SELECT COUNT(*) + 1 as rank
          FROM items
          WHERE elo_rating > ?
        `, [item.elo_rating], (err, row) => {
          resolve(err ? null : row);
        });
      });
      rank = rankRow ? rankRow.rank : null;
    }
    
    // Calculate win rate
    const winRate = item.comparison_count > 0 
      ? ((item.wins / item.comparison_count) * 100).toFixed(1)
      : 0;
    
    // Get recent comparisons involving this item (last 10)
    let recentComparisons = [];
    if (dbType === 'postgres') {
      const comparisonsResult = await db.query(`
        SELECT 
          c.id,
          c.created_at,
          i1.id as opponent_id,
          i1.title as opponent_title,
          i1.image_url as opponent_image,
          CASE WHEN c.winner_id = $1 THEN true ELSE false END as won
        FROM comparisons c
        LEFT JOIN items i1 ON (c.item1_id = i1.id AND c.item2_id = $1) OR (c.item2_id = i1.id AND c.item1_id = $1)
        WHERE (c.item1_id = $1 OR c.item2_id = $1) AND i1.id != $1
        ORDER BY c.created_at DESC
        LIMIT 10
      `, [id]);
      recentComparisons = comparisonsResult.rows || [];
    } else {
      const dbInstance = db.getDb();
      recentComparisons = await new Promise((resolve) => {
        dbInstance.all(`
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
        `, [id, id, id, id, id, id], (err, rows) => {
          resolve(err ? [] : (rows || []));
        });
      });
    }
    
    // Get most common opponents
    let topOpponents = [];
    if (dbType === 'postgres') {
      const opponentsResult = await db.query(`
        SELECT 
          CASE 
            WHEN c.item1_id = $1 THEN c.item2_id
            ELSE c.item1_id
          END as opponent_id,
          CASE 
            WHEN c.item1_id = $1 THEN i2.title
            ELSE i1.title
          END as opponent_title,
          CASE 
            WHEN c.item1_id = $1 THEN i2.image_url
            ELSE i1.image_url
          END as opponent_image,
          COUNT(*) as match_count,
          SUM(CASE WHEN c.winner_id = $1 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN c.winner_id != $1 THEN 1 ELSE 0 END) as losses
        FROM comparisons c
        LEFT JOIN items i1 ON c.item1_id = i1.id
        LEFT JOIN items i2 ON c.item2_id = i2.id
        WHERE (c.item1_id = $1 OR c.item2_id = $1)
        GROUP BY opponent_id, opponent_title, opponent_image
        ORDER BY match_count DESC
        LIMIT 5
      `, [id]);
      topOpponents = opponentsResult.rows || [];
    } else {
      const dbInstance = db.getDb();
      topOpponents = await new Promise((resolve) => {
        dbInstance.all(`
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
        `, [id, id, id, id, id, id, id], (err, rows) => {
          resolve(err ? [] : (rows || []));
        });
      });
    }
    
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

module.exports = {
  getRankings,
  searchItem,
  getItemById,
  getTrendingItems
};
