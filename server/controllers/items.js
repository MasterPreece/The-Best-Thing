const db = require('../database');

const getRankings = (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  const dbInstance = db.getDb();
  
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
    
    res.json({
      rankings: rows,
      limit,
      offset
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
    
    res.json(row);
  });
};

module.exports = {
  getRankings,
  getItemById
};

