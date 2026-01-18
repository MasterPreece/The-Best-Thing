const db = require('../database');
const { queryMany, queryOne, insertAndReturn, updateAndReturn, deleteRecord } = require('../utils/db-helpers');
const seedCategoriesFunction = require('../scripts/seed-categories-wrapper');
const seedTop2000Function = require('../scripts/seed-top-2000-wrapper');
const { seedPopularCulture } = require('../scripts/seed-popular-culture');
const { assignDefaultCategories } = require('../scripts/assign-default-categories');
const { assignIntelligentCategories } = require('../scripts/assign-intelligent-categories');
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
 * Trigger top 2000 seeding
 * POST /api/admin/seed-top2000
 * Body: { count?: number, category?: string, startRank?: number, endRank?: number }
 */
const triggerSeedTop2000 = async (req, res) => {
  try {
    const { count, category, startRank, endRank } = req.body;
    
    // Determine effective count
    let targetCount = count ? parseInt(count) : 2000;
    let effectiveCount = targetCount;
    
    // If range is specified, use range size instead
    if (startRank && endRank) {
      const parsedStart = parseInt(startRank);
      const parsedEnd = parseInt(endRank);
      
      if (isNaN(parsedStart) || isNaN(parsedEnd) || parsedStart < 1 || parsedEnd < parsedStart) {
        return res.status(400).json({
          error: 'Invalid range',
          message: 'Start rank must be >= 1 and end rank must be >= start rank'
        });
      }
      
      effectiveCount = parsedEnd - parsedStart + 1;
    } else if (targetCount <= 0 || targetCount > 10000) {
      return res.status(400).json({
        error: 'Invalid count',
        message: 'Count must be between 1 and 10,000'
      });
    }
    
    // Validate category format if provided (should start with "Category:")
    let validCategory = null;
    if (category && category.trim()) {
      validCategory = category.trim();
      if (!validCategory.startsWith('Category:')) {
        validCategory = `Category:${validCategory}`;
      }
    }
    
    const rangeDesc = (startRank && endRank) ? `ranked ${startRank}-${endRank}` : `top ${targetCount}`;
    const categoryDesc = validCategory ? ` from ${validCategory}` : '';
    
    // Run seeding in background (don't block the response)
    res.json({ 
      message: `${rangeDesc} articles seeding started${categoryDesc}. This will take approximately ${Math.round(effectiveCount / 120)}-${Math.round(effectiveCount / 80)} minutes.`,
      note: 'Check logs to monitor progress. Articles will be sorted by pageviews.'
    });
    
    // Run seeding asynchronously with parameters
    const parsedStartRank = startRank ? parseInt(startRank) : null;
    const parsedEndRank = endRank ? parseInt(endRank) : null;
    
    seedTop2000Function(targetCount, validCategory, parsedStartRank, parsedEndRank).catch(err => {
      console.error('Error during admin-triggered top 2000 seeding:', err);
    });
    
  } catch (error) {
    console.error('Error in triggerSeedTop2000:', error);
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
    
    let items, total;
    
    if (search) {
      // For SQLite compatibility, lowercase the search term and use simpler LIKE
      const searchLower = search.toLowerCase();
      const searchTerm = `%${searchLower}%`;
      
      try {
        // Try with categories first
        items = await queryMany(`
          SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                 c.name as category_name, c.slug as category_slug
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          WHERE LOWER(i.title) LIKE ? OR LOWER(i.description) LIKE ?
          ORDER BY i.created_at DESC
          LIMIT ? OFFSET ?
        `, [searchTerm, searchTerm, limit, offset]);
        
        const countResult = await queryOne(`
          SELECT COUNT(*) as total
          FROM items
          WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ?
        `, [searchTerm, searchTerm]);
        
        total = parseInt(countResult?.total || 0);
      } catch (err) {
        // If categories column doesn't exist, use simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('[Admin] Categories not available, using simple query');
          items = await queryMany(`
            SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses, created_at
            FROM items
            WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
          `, [searchTerm, searchTerm, limit, offset]);
          
          const countResult = await queryOne(`
            SELECT COUNT(*) as total
            FROM items
            WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ?
          `, [searchTerm, searchTerm]);
          
          total = parseInt(countResult?.total || 0);
        } else {
          throw err;
        }
      }
    } else {
      try {
        // Try with categories first
        items = await queryMany(`
          SELECT i.id, i.title, i.image_url, i.description, i.category_id, i.elo_rating, i.comparison_count, i.wins, i.losses, i.created_at,
                 c.name as category_name, c.slug as category_slug
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          ORDER BY i.created_at DESC
          LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        const countResult = await queryOne(`SELECT COUNT(*) as total FROM items`);
        total = parseInt(countResult?.total || 0);
      } catch (err) {
        // If categories column doesn't exist, use simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('[Admin] Categories not available, using simple query');
          items = await queryMany(`
            SELECT id, title, image_url, description, elo_rating, comparison_count, wins, losses, created_at
            FROM items
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
          `, [limit, offset]);
          
          const countResult = await queryOne(`SELECT COUNT(*) as total FROM items`);
          total = parseInt(countResult?.total || 0);
        } else {
          throw err;
        }
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
    
    try {
      const item = await insertAndReturn(
        'items',
        {
          wikipedia_id: wikipediaId || null,
          title: title.trim(),
          image_url: imageUrl || null,
          description: description || null,
          category_id: categoryId || null
        },
        'id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at'
      );
      
      res.json({ success: true, item });
    } catch (err) {
      if (err.statusCode === 400) {
        return res.status(400).json({ error: err.message });
      }
      if (err.message?.includes('UNIQUE') || err.code === '23505') {
        return res.status(400).json({ error: 'An item with this title already exists' });
      }
      throw err;
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
    
    try {
      const item = await updateAndReturn(
        'items',
        id,
        {
          title: title.trim(),
          image_url: imageUrl || null,
          description: description || null,
          wikipedia_id: wikipediaId || null,
          category_id: categoryId || null
        },
        'id, title, image_url, description, category_id, elo_rating, comparison_count, wins, losses, created_at'
      );
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.json({ success: true, item });
    } catch (err) {
      if (err.statusCode === 400) {
        return res.status(400).json({ error: err.message });
      }
      if (err.statusCode === 404) {
        return res.status(404).json({ error: err.message });
      }
      if (err.message?.includes('UNIQUE') || err.code === '23505') {
        return res.status(400).json({ error: 'An item with this title already exists' });
      }
      throw err;
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
    
    const deleted = await deleteRecord('items', id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ success: true, message: 'Item deleted' });
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

/**
 * Trigger intelligent category assignment for uncategorized items
 * POST /api/admin/assign-categories
 * Body: { intelligent?: boolean, limit?: number }
 */
const triggerAssignCategories = async (req, res) => {
  try {
    const { intelligent = true, limit = null } = req.body; // Default to intelligent assignment
    
    if (intelligent) {
      // Intelligent assignment using Wikipedia categories
      res.json({ 
        message: 'Intelligent category assignment started. This will fetch Wikipedia categories and match them to our category system.',
        note: 'Items that cannot be matched will be skipped. Check logs to monitor progress.',
        limit: limit || 'all'
      });
      
      // Run intelligent assignment asynchronously
      assignIntelligentCategories(limit ? parseInt(limit) : null).catch(err => {
        console.error('Error during intelligent category assignment:', err);
      });
    } else {
      // Simple assignment to "Other"
      res.json({ 
        message: 'Category assignment started. This will assign all uncategorized items to "Other" category.',
        note: 'Check logs to monitor progress.'
      });
      
      // Run default assignment asynchronously
      assignDefaultCategories().catch(err => {
        console.error('Error during default category assignment:', err);
      });
    }
    
  } catch (error) {
    console.error('Error in triggerAssignCategories:', error);
    res.status(500).json({ 
      error: 'Failed to trigger category assignment',
      message: error.message 
    });
  }
};

/**
 * Trigger popular culture seeding
 * POST /api/admin/seed-popular-culture
 * Body: { count?: number }
 */
const triggerSeedPopularCulture = async (req, res) => {
  try {
    const { count } = req.body;
    const targetCount = count ? parseInt(count) : 500;
    
    if (targetCount <= 0 || targetCount > 5000) {
      return res.status(400).json({
        error: 'Invalid count',
        message: 'Count must be between 1 and 5,000'
      });
    }
    
    // Run seeding in background (don't block the response)
    res.json({ 
      message: `Popular culture seeding started for ${targetCount} items. This will focus on familiar, recognizable items from TV shows, movies, celebrities, sports, brands, etc.`,
      note: `This will take approximately ${Math.round(targetCount / 80)}-${Math.round(targetCount / 60)} minutes. Check logs to monitor progress.`
    });
    
    // Override the TARGET_COUNT by passing it directly
    // We'll modify the seed function to accept a parameter
    seedPopularCulture(targetCount).catch(err => {
      console.error('Error during popular culture seeding:', err);
    });
    
  } catch (error) {
    console.error('Error in triggerSeedPopularCulture:', error);
    res.status(500).json({ 
      error: 'Failed to trigger popular culture seeding',
      message: error.message 
    });
  }
};

module.exports = {
  triggerSeedCategories,
  triggerSeedTop2000,
  triggerSeedPopularCulture,
  triggerUpdateImages,
  triggerAssignCategories,
  getAdminItems,
  createItem,
  updateItem,
  deleteItem,
  getAdminStats
};

