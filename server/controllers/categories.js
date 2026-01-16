const db = require('../database');

/**
 * Get all categories
 * GET /api/categories
 */
const getCategories = async (req, res) => {
  try {
    const dbType = db.getDbType();
    let categories;
    
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id, name, slug, description, 
               (SELECT COUNT(*) FROM items WHERE category_id = categories.id) as item_count
        FROM categories
        ORDER BY name ASC
      `);
      categories = result.rows;
    } else {
      const dbInstance = db.getDb();
      categories = await new Promise((resolve, reject) => {
        dbInstance.all(`
          SELECT c.id, c.name, c.slug, c.description,
                 (SELECT COUNT(*) FROM items WHERE category_id = c.id) as item_count
          FROM categories c
          ORDER BY c.name ASC
        `, [], (err, rows) => {
          if (err) {
            // If category_id column doesn't exist, return categories with 0 count
            const errorStr = err.message || err.toString() || '';
            if (errorStr.includes('no such column') || errorStr.includes('category_id') ||
                (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
              console.log('Categories column not available, returning categories without counts');
              // Return categories without item counts
              return dbInstance.all(`
                SELECT id, name, slug, description, 0 as item_count
                FROM categories
                ORDER BY name ASC
              `, [], (fallbackErr, fallbackRows) => {
                if (fallbackErr) {
                  // Even if this fails, return empty array
                  resolve([]);
                } else {
                  resolve(fallbackRows || []);
                }
              });
            }
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    }
    
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories', message: error.message });
  }
};

/**
 * Get category by slug
 * GET /api/categories/:slug
 */
const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const dbType = db.getDbType();
    let category;
    
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id, name, slug, description,
               (SELECT COUNT(*) FROM items WHERE category_id = categories.id) as item_count
        FROM categories
        WHERE slug = $1
      `, [slug]);
      category = result.rows[0] || null;
    } else {
      const dbInstance = db.getDb();
      category = await new Promise((resolve, reject) => {
        dbInstance.get(`
          SELECT c.id, c.name, c.slug, c.description,
                 (SELECT COUNT(*) FROM items WHERE category_id = c.id) as item_count
          FROM categories c
          WHERE c.slug = ?
        `, [slug], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ category });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category', message: error.message });
  }
};

module.exports = {
  getCategories,
  getCategoryBySlug
};

