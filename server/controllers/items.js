const db = require('../database');

const getRankings = (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  console.log(`[Rankings] Requested limit: ${req.query.limit}, parsed limit: ${limit}, offset: ${offset}`);
  
  // Cap at 10,000 to prevent performance issues, but allow "all" to work
  if (limit > 10000) {
    limit = 10000;
  }
  
  const dbInstance = db.getDb();
  
  // If limit is very large, just get all items (no LIMIT clause)
  if (limit >= 10000) {
    dbInstance.all(`
      SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
      FROM items
      ORDER BY elo_rating DESC
    `, [], (err, rows) => {
      if (err) {
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
    dbInstance.all(`
      SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
      FROM items
      ORDER BY elo_rating DESC
      LIMIT ? OFFSET ?
    `, [limit, offset], (err, rows) => {
      if (err) {
        console.error('Error fetching rankings:', err);
        return res.status(500).json({ error: 'Failed to fetch rankings' });
      }
      
      console.log(`[Rankings] Fetched ${rows.length} items with limit ${limit}`);
      
      // Get total count for pagination info
      dbInstance.get(`SELECT COUNT(*) as total FROM items`, [], (err, countRow) => {
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

module.exports = {
  getRankings,
  searchItem,
  getItemById
};
