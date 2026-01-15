const db = require('../database');

/**
 * Get user's collection (saved comparisons)
 */
const getCollection = async (req, res) => {
  const userId = req.userId;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let collections = [];
    
    if (dbType === 'postgres') {
      const result = await dbInstance.query(`
        SELECT 
          col.id,
          col.comparison_id,
          col.created_at,
          i1.id as item1_id,
          i1.title as item1_title,
          i1.image_url as item1_image,
          i2.id as item2_id,
          i2.title as item2_title,
          i2.image_url as item2_image,
          c.winner_id
        FROM collections col
        JOIN comparisons c ON col.comparison_id = c.id
        JOIN items i1 ON c.item1_id = i1.id
        JOIN items i2 ON c.item2_id = i2.id
        WHERE col.user_id = $1
        ORDER BY col.created_at DESC
        LIMIT 100
      `, [userId]);
      collections = result.rows || [];
    } else {
      collections = await new Promise((resolve, reject) => {
        dbInstance.all(`
          SELECT 
            col.id,
            col.comparison_id,
            col.created_at,
            i1.id as item1_id,
            i1.title as item1_title,
            i1.image_url as item1_image,
            i2.id as item2_id,
            i2.title as item2_title,
            i2.image_url as item2_image,
            c.winner_id
          FROM collections col
          JOIN comparisons c ON col.comparison_id = c.id
          JOIN items i1 ON c.item1_id = i1.id
          JOIN items i2 ON c.item2_id = i2.id
          WHERE col.user_id = ?
          ORDER BY col.created_at DESC
          LIMIT 100
        `, [userId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }

    res.json({ collections });
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
};

/**
 * Add comparison to collection (save favorite)
 */
const addToCollection = async (req, res) => {
  const { comparisonId } = req.params;
  const userId = req.userId;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Check if comparison exists
    let comparison = null;
    if (dbType === 'postgres') {
      const result = await dbInstance.query('SELECT id FROM comparisons WHERE id = $1', [comparisonId]);
      comparison = result.rows[0];
    } else {
      comparison = await new Promise((resolve, reject) => {
        dbInstance.get('SELECT id FROM comparisons WHERE id = ?', [comparisonId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }

    if (!comparison) {
      return res.status(404).json({ error: 'Comparison not found' });
    }

    // Add to collection (ignore if already exists)
    if (dbType === 'postgres') {
      try {
        await dbInstance.query(`
          INSERT INTO collections (user_id, comparison_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, comparison_id) DO NOTHING
        `, [userId, comparisonId]);
      } catch (err) {
        // Already exists or other error
        if (err.code !== '23505') { // Unique violation
          throw err;
        }
      }
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          INSERT OR IGNORE INTO collections (user_id, comparison_id)
          VALUES (?, ?)
        `, [userId, comparisonId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to collection:', error);
    res.status(500).json({ error: 'Failed to add to collection' });
  }
};

/**
 * Remove comparison from collection
 */
const removeFromCollection = async (req, res) => {
  const { comparisonId } = req.params;
  const userId = req.userId;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    if (dbType === 'postgres') {
      await dbInstance.query(`
        DELETE FROM collections 
        WHERE user_id = $1 AND comparison_id = $2
      `, [userId, comparisonId]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          DELETE FROM collections 
          WHERE user_id = ? AND comparison_id = ?
        `, [userId, comparisonId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from collection:', error);
    res.status(500).json({ error: 'Failed to remove from collection' });
  }
};

/**
 * Check if a comparison is in user's collection
 */
const checkInCollection = async (req, res) => {
  const { comparisonId } = req.params;
  const userId = req.userId;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  if (!userId) {
    return res.json({ inCollection: false });
  }

  try {
    let inCollection = false;
    
    if (dbType === 'postgres') {
      const result = await dbInstance.query(`
        SELECT id FROM collections 
        WHERE user_id = $1 AND comparison_id = $2
        LIMIT 1
      `, [userId, comparisonId]);
      inCollection = result.rows.length > 0;
    } else {
      const result = await new Promise((resolve) => {
        dbInstance.get(`
          SELECT id FROM collections 
          WHERE user_id = ? AND comparison_id = ?
          LIMIT 1
        `, [userId, comparisonId], (err, row) => {
          resolve(err ? null : row);
        });
      });
      inCollection = !!result;
    }

    res.json({ inCollection });
  } catch (error) {
    console.error('Error checking collection:', error);
    res.json({ inCollection: false });
  }
};

module.exports = {
  getCollection,
  addToCollection,
  removeFromCollection,
  checkInCollection
};

