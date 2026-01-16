const db = require('../database');
const seedCategoriesFunction = require('../scripts/seed-categories-wrapper');
const { updateMissingImages } = require('../scripts/update-missing-images');

/**
 * Trigger category seeding (protected by secret)
 * POST /api/admin/seed-categories
 * Body: { secret: "your-secret" }
 */
const triggerSeedCategories = async (req, res) => {
  try {
    const { secret } = req.body;
    const expectedSecret = process.env.ADMIN_SECRET || 'change-this-secret-in-production';
    
    if (secret !== expectedSecret) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid secret' 
      });
    }
    
    // Run seeding in background (don't block the response)
    res.json({ 
      message: 'Category seeding started. This will take 10-15 minutes.',
      note: 'Check logs to monitor progress.'
    });
    
    // Run seeding asynchronously
    seedCategoriesFunction().catch(err => {
      console.error('Error during admin-triggered seeding:', err);
    });
    
  } catch (error) {
    console.error('Error in triggerSeedCategories:', error);
    res.status(500).json({ 
      error: 'Failed to trigger seeding',
      message: error.message 
    });
  }
};

/**
 * Trigger image update for items without images
 * POST /api/admin/update-images
 * Body: { limit?: number, includePlaceholders?: boolean }
 */
const triggerUpdateImages = async (req, res) => {
  try {
    const { limit, includePlaceholders } = req.body;
    
    // Run update in background (don't block the response)
    res.json({ 
      message: 'Image update process started.',
      note: 'This will process items without images. Check logs to monitor progress.',
      limit: limit || 'all',
      skipPlaceholders: !includePlaceholders
    });
    
    // Run update asynchronously
    updateMissingImages({
      limit: limit ? parseInt(limit) : null,
      skipPlaceholders: !includePlaceholders
    }).catch(err => {
      console.error('Error during admin-triggered image update:', err);
    });
    
  } catch (error) {
    console.error('Error in triggerUpdateImages:', error);
    res.status(500).json({ 
      error: 'Failed to trigger image update',
      message: error.message 
    });
  }
};

/**
 * Get all items for admin dashboard (with pagination)
 * GET /api/admin/items?page=1&limit=50&search=query
 */
const getAdminItems = async (req, res) => {
  try {
    console.log('[Admin] Fetching items, query:', req.query);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;
    
    const dbType = db.getDbType();
    console.log('[Admin] Database type:', dbType);
    let items, total;
    
    if (dbType === 'postgres') {
      if (search) {
        const searchTerm = `%${search}%`;
        const itemsResult = await db.query(`
          SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                 c.name as category_name, c.slug as category_slug
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          WHERE LOWER(i.title) LIKE LOWER($1) OR LOWER(i.description) LIKE LOWER($1)
          ORDER BY i.created_at DESC
          LIMIT $2 OFFSET $3
        `, [searchTerm, limit, offset]);
        
        const countResult = await db.query(`
          SELECT COUNT(*) as total
          FROM items
          WHERE LOWER(title) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1)
        `, [searchTerm]);
        
        items = itemsResult.rows;
        total = parseInt(countResult.rows[0]?.total || 0);
      } else {
        const itemsResult = await db.query(`
          SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                 c.name as category_name, c.slug as category_slug
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          ORDER BY i.created_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        const countResult = await db.query(`SELECT COUNT(*) as total FROM items`);
        
        items = itemsResult.rows;
        total = parseInt(countResult.rows[0]?.total || 0);
      }
    } else {
      const dbInstance = db.getDb();
      
      if (search) {
        const searchTerm = `%${search}%`;
        items = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                   c.name as category_name, c.slug as category_slug
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE LOWER(i.title) LIKE LOWER(?) OR LOWER(i.description) LIKE LOWER(?)
            ORDER BY i.created_at DESC
            LIMIT ? OFFSET ?
          `, [searchTerm, searchTerm, limit, offset], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });
        
        const countRow = await new Promise((resolve, reject) => {
          dbInstance.get(`
            SELECT COUNT(*) as total
            FROM items
            WHERE LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)
          `, [searchTerm, searchTerm], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        total = countRow ? countRow.total : 0;
      } else {
        items = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                   c.name as category_name, c.slug as category_slug
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            ORDER BY i.created_at DESC
            LIMIT ? OFFSET ?
          `, [limit, offset], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });
        
        const countRow = await new Promise((resolve, reject) => {
          dbInstance.get(`SELECT COUNT(*) as total FROM items`, [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        total = countRow ? countRow.total : 0;
      }
    }
    
    console.log(`[Admin] Found ${items.length} items, total: ${total}`);
    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Admin] Error fetching admin items:', error);
    console.error('[Admin] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch items', 
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Create a new item
 * POST /api/admin/items
 */
const createItem = async (req, res) => {
  try {
    const { title, imageUrl, description, wikipediaId, categoryId } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const dbType = db.getDbType();
    let result;
    
    if (dbType === 'postgres') {
      result = await db.query(`
        INSERT INTO items (wikipedia_id, title, image_url, description, category_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at
      `, [wikipediaId || null, title.trim(), imageUrl || null, description || null, categoryId || null]);
      
      res.json({ success: true, item: result.rows[0] });
    } else {
      const dbInstance = db.getDb();
      try {
        const item = await new Promise((resolve, reject) => {
          dbInstance.run(`
            INSERT INTO items (wikipedia_id, title, image_url, description, category_id)
            VALUES (?, ?, ?, ?, ?)
          `, [wikipediaId || null, title.trim(), imageUrl || null, description || null, categoryId || null], function(err) {
            if (err) {
              if (err.message.includes('UNIQUE constraint')) {
                return reject({ statusCode: 400, message: 'An item with this title already exists' });
              }
              reject(err);
            } else {
            // Fetch the created item
            dbInstance.get(`
              SELECT id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at
              FROM items WHERE id = ?
            `, [this.lastID], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            }
          });
        });
        res.json({ success: true, item });
      } catch (err) {
        if (err.statusCode === 400) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }
  } catch (error) {
    console.error('Error creating item:', error);
    if (error.message?.includes('UNIQUE') || error.code === '23505') {
      return res.status(400).json({ error: 'An item with this title already exists' });
    }
    res.status(500).json({ error: 'Failed to create item', message: error.message });
  }
};

/**
 * Update an item
 * PUT /api/admin/items/:id
 */
const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, imageUrl, description, wikipediaId, categoryId } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const dbType = db.getDbType();
    
    if (dbType === 'postgres') {
      const result = await db.query(`
        UPDATE items
        SET title = $1, image_url = $2, description = $3, wikipedia_id = $4, category_id = $5
        WHERE id = $6
        RETURNING id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at
      `, [title.trim(), imageUrl || null, description || null, wikipediaId || null, categoryId || null, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.json({ success: true, item: result.rows[0] });
    } else {
      const dbInstance = db.getDb();
        try {
        const item = await new Promise((resolve, reject) => {
          dbInstance.run(`
            UPDATE items
            SET title = ?, image_url = ?, description = ?, wikipedia_id = ?, category_id = ?
            WHERE id = ?
          `, [title.trim(), imageUrl || null, description || null, wikipediaId || null, categoryId || null, id], function(err) {
            if (err) {
              if (err.message.includes('UNIQUE constraint')) {
                return reject({ statusCode: 400, message: 'An item with this title already exists' });
              }
              reject(err);
            } else if (this.changes === 0) {
              return reject({ statusCode: 404, message: 'Item not found' });
            } else {
              // Fetch the updated item
              dbInstance.get(`
                SELECT id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at
                FROM items WHERE id = ?
              `, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            }
          });
        });
        res.json({ success: true, item });
      } catch (err) {
        if (err.statusCode === 400) {
          return res.status(400).json({ error: err.message });
        }
        if (err.statusCode === 404) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }
    }
  } catch (error) {
    console.error('Error updating item:', error);
    if (error.message?.includes('UNIQUE') || error.code === '23505') {
      return res.status(400).json({ error: 'An item with this title already exists' });
    }
    res.status(500).json({ error: 'Failed to update item', message: error.message });
  }
};

/**
 * Delete an item
 * DELETE /api/admin/items/:id
 */
const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const dbType = db.getDbType();
    
    if (dbType === 'postgres') {
      const result = await db.query(`DELETE FROM items WHERE id = $1 RETURNING id`, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.json({ success: true, message: 'Item deleted' });
    } else {
      const dbInstance = db.getDb();
      try {
        await new Promise((resolve, reject) => {
          dbInstance.run(`DELETE FROM items WHERE id = ?`, [id], function(err) {
            if (err) reject(err);
            else if (this.changes === 0) {
              return reject({ statusCode: 404, message: 'Item not found' });
            } else {
              resolve();
            }
          });
        });
        res.json({ success: true, message: 'Item deleted' });
      } catch (err) {
        if (err.statusCode === 404) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }
    }
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item', message: error.message });
  }
};

/**
 * Get database statistics for admin
 * GET /api/admin/stats
 */
const getAdminStats = async (req, res) => {
  try {
    const dbType = db.getDbType();
    let stats;
    
    if (dbType === 'postgres') {
      const results = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM items'),
        db.query('SELECT COUNT(*) as count FROM comparisons'),
        db.query('SELECT COUNT(*) as count FROM user_sessions'),
        db.query('SELECT COUNT(*) as count FROM users'),
        db.query('SELECT COUNT(*) as count FROM comments'),
        db.query(`SELECT COUNT(*) as count FROM items WHERE image_url IS NOT NULL`)
      ]);
      
      stats = {
        totalItems: parseInt(results[0].rows[0]?.count || 0),
        totalComparisons: parseInt(results[1].rows[0]?.count || 0),
        totalUserSessions: parseInt(results[2].rows[0]?.count || 0),
        totalUsers: parseInt(results[3].rows[0]?.count || 0),
        totalComments: parseInt(results[4].rows[0]?.count || 0),
        itemsWithImages: parseInt(results[5].rows[0]?.count || 0),
        imageCoverage: results[0].rows[0]?.count > 0 
          ? ((results[5].rows[0]?.count / results[0].rows[0]?.count) * 100).toFixed(1)
          : 0
      };
    } else {
      const dbInstance = db.getDb();
      const results = await Promise.all([
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM items', [], (err, row) => resolve(row))),
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM comparisons', [], (err, row) => resolve(row))),
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM user_sessions', [], (err, row) => resolve(row))),
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM users', [], (err, row) => resolve(row))),
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM comments', [], (err, row) => resolve(row))),
        new Promise(resolve => dbInstance.get('SELECT COUNT(*) as count FROM items WHERE image_url IS NOT NULL', [], (err, row) => resolve(row)))
      ]);
      
      const totalItems = results[0] ? results[0].count : 0;
      const itemsWithImages = results[5] ? results[5].count : 0;
      
      stats = {
        totalItems,
        totalComparisons: results[1] ? results[1].count : 0,
        totalUserSessions: results[2] ? results[2].count : 0,
        totalUsers: results[3] ? results[3].count : 0,
        totalComments: results[4] ? results[4].count : 0,
        itemsWithImages,
        imageCoverage: totalItems > 0 ? ((itemsWithImages / totalItems) * 100).toFixed(1) : 0
      };
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
};

module.exports = {
  triggerSeedCategories,
  triggerUpdateImages,
  getAdminItems,
  createItem,
  updateItem,
  deleteItem,
  getAdminStats
};

