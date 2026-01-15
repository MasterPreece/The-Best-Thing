const db = require('../database');

const getRankings = (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
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
      
      // Get total count for pagination info
      dbInstance.get(`SELECT COUNT(*) as total FROM items`, [], (err, countRow) => {
        const total = countRow ? countRow.total : rows.length;
        
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

const getItemById = (req, res) => {
  const { id } = req.params;
  const dbInstance = db.getDb();
  
  dbInstance.get(`
    SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses
    FROM items
    WHERE id = ?
  `, [id], (err, row) => {
    if (err) {
      console.error('Error fetching item:', err);
      return res.status(500).json({ error: 'Failed to fetch item' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Get ranking position
    dbInstance.get(`
      SELECT COUNT(*) + 1 as rank
      FROM items
      WHERE elo_rating > ?
    `, [row.elo_rating], (err, rankRow) => {
      if (!err && rankRow) {
        row.rank = rankRow.rank;
      }
      
      res.json(row);
    });
  });
};

module.exports = {
  getRankings,
  searchItem,
  getItemById
};
