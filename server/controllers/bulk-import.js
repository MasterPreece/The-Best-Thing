const db = require('../database');

// Try to load xlsx, but don't fail if it's not installed
let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.warn('Warning: xlsx module not installed. Bulk import functionality will be disabled.');
  XLSX = null;
}

/**
 * Bulk import items from Excel/CSV file
 * POST /api/admin/bulk-import
 * Expects multipart/form-data with 'file' field
 */
const bulkImport = async (req, res) => {
  try {
    if (!XLSX) {
      return res.status(503).json({ 
        error: 'Bulk import not available',
        message: 'xlsx module is not installed. Please install it with: npm install xlsx'
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        message: 'Please upload an Excel (.xlsx, .xls) or CSV file'
      });
    }

    const file = req.file;
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    
    // Validate file type
    if (!['xlsx', 'xls', 'csv'].includes(fileExtension)) {
      return res.status(400).json({ 
        error: 'Invalid file type',
        message: 'Please upload an Excel (.xlsx, .xls) or CSV file'
      });
    }

    // Parse the file
    let workbook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch (err) {
      return res.status(400).json({ 
        error: 'Failed to parse file',
        message: 'The file appears to be corrupted or in an unsupported format'
      });
    }

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      defval: null, // Use null for empty cells
      raw: false // Convert numbers to strings for consistency
    });

    if (data.length === 0) {
      return res.status(400).json({ 
        error: 'Empty file',
        message: 'The file contains no data'
      });
    }

    console.log(`[Bulk Import] Parsed ${data.length} rows from file`);

    // Validate and process rows
    const items = [];
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // +2 because Excel rows start at 1 and we have a header
      
      // Normalize column names (case-insensitive, handle spaces/underscores)
      const title = row.title || row.Title || row.TITLE || row['Item Title'] || row['item title'];
      const imageUrl = row.image_url || row.imageUrl || row['Image URL'] || row['image url'] || row.image || row.Image;
      const description = row.description || row.Description || row.DESCRIPTION || row.desc || row.Desc;
      const wikipediaId = row.wikipedia_id || row.wikipediaId || row['Wikipedia ID'] || row['wikipedia id'] || row.wiki_id;
      const categoryName = row.category || row.Category || row.CATEGORY || row['Category Name'] || row['category name'] || row.category_name;

      // Title is required
      if (!title || typeof title !== 'string' || !title.trim()) {
        errors.push({
          row: rowNum,
          error: 'Missing or invalid title',
          data: row
        });
        continue;
      }

      // Validate Wikipedia ID if provided
      let wikiId = null;
      if (wikipediaId) {
        const parsed = parseInt(wikipediaId);
        if (isNaN(parsed) || parsed <= 0) {
          errors.push({
            row: rowNum,
            error: 'Invalid Wikipedia ID (must be a positive number)',
            data: row
          });
          continue;
        }
        wikiId = parsed;
      }

      // Look up category by name if provided
      let categoryId = null;
      if (categoryName) {
        const dbType = db.getDbType();
        try {
          if (dbType === 'postgres') {
            const catResult = await db.query(`
              SELECT id FROM categories WHERE LOWER(name) = LOWER($1) OR LOWER(slug) = LOWER($1)
            `, [categoryName.trim()]);
            categoryId = catResult.rows[0]?.id || null;
          } else {
            const dbInstance = db.getDb();
            const catRow = await new Promise((resolve) => {
              dbInstance.get(`
                SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)
              `, [categoryName.trim(), categoryName.trim()], (err, row) => {
                resolve(err ? null : row);
              });
            });
            categoryId = catRow ? catRow.id : null;
          }
          
          if (!categoryId) {
            errors.push({
              row: rowNum,
              error: `Category "${categoryName}" not found. Available categories: Food & Drinks, Movies & TV, Music, Video Games, Sports, Technology, Places, People, Brands, Animals, Vehicles, Science, History, Art & Culture, Other`,
              data: row
            });
            // Continue anyway - will insert without category
          }
        } catch (err) {
          console.error(`Error looking up category "${categoryName}":`, err);
          // Continue without category
        }
      }

      items.push({
        title: title.trim(),
        imageUrl: imageUrl ? imageUrl.trim() : null,
        description: description ? description.trim() : null,
        wikipediaId: wikiId,
        categoryId: categoryId
      });
    }

    if (items.length === 0) {
      return res.status(400).json({ 
        error: 'No valid items found',
        message: 'All rows had errors. Please check your file format.',
        errors: errors.slice(0, 10) // Return first 10 errors
      });
    }

    console.log(`[Bulk Import] Validated ${items.length} items, ${errors.length} errors`);

    // Insert items into database
    const dbType = db.getDbType();
    const inserted = [];
    const skipped = [];
    const failed = [];

    for (const item of items) {
      try {
        if (dbType === 'postgres') {
          try {
            const result = await db.query(`
              INSERT INTO items (wikipedia_id, title, image_url, description, category_id)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (title) DO NOTHING
              RETURNING id, title
            `, [item.wikipediaId, item.title, item.imageUrl, item.description, item.categoryId]);
            
            if (result.rows.length > 0) {
              inserted.push(result.rows[0]);
            } else {
              skipped.push({ title: item.title, reason: 'Duplicate title' });
            }
          } catch (err) {
            if (err.code === '23505' || err.message.includes('UNIQUE')) {
              skipped.push({ title: item.title, reason: 'Duplicate title' });
            } else {
              throw err;
            }
          }
        } else {
          const dbInstance = db.getDb();
          await new Promise((resolve, reject) => {
            dbInstance.run(`
              INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description, category_id)
              VALUES (?, ?, ?, ?, ?)
            `, [item.wikipediaId, item.title, item.imageUrl, item.description, item.categoryId], function(err) {
              if (err) {
                if (err.message.includes('UNIQUE')) {
                  skipped.push({ title: item.title, reason: 'Duplicate title' });
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                if (this.changes > 0) {
                  inserted.push({ id: this.lastID, title: item.title });
                } else {
                  skipped.push({ title: item.title, reason: 'Duplicate title' });
                }
                resolve();
              }
            });
          });
        }
      } catch (err) {
        console.error(`[Bulk Import] Error inserting item "${item.title}":`, err);
        failed.push({ 
          title: item.title, 
          reason: err.message || 'Database error' 
        });
      }
    }

    console.log(`[Bulk Import] Complete: ${inserted.length} inserted, ${skipped.length} skipped, ${failed.length} failed`);

    res.json({
      success: true,
      summary: {
        total: items.length,
        inserted: inserted.length,
        skipped: skipped.length,
        failed: failed.length,
        errors: errors.length
      },
      inserted: inserted.slice(0, 50), // Return first 50 inserted items
      skipped: skipped.slice(0, 50), // Return first 50 skipped items
      failed: failed.slice(0, 50), // Return first 50 failed items
      errors: errors.slice(0, 20), // Return first 20 validation errors
      message: `Successfully imported ${inserted.length} items. ${skipped.length} skipped (duplicates), ${failed.length} failed.`
    });

  } catch (error) {
    console.error('[Bulk Import] Error:', error);
    res.status(500).json({ 
      error: 'Failed to process bulk import',
      message: error.message 
    });
  }
};

/**
 * Get a template file for bulk import
 * GET /api/admin/bulk-import/template
 */
const getTemplate = (req, res) => {
  try {
    if (!XLSX) {
      return res.status(503).json({ 
        error: 'Template download not available',
        message: 'xlsx module is not installed. Please install it with: npm install xlsx'
      });
    }

    // Create a sample workbook
    const workbook = XLSX.utils.book_new();
    
    // Sample data
    const sampleData = [
      {
        'title': 'Example Item 1',
        'image_url': 'https://example.com/image1.jpg',
        'description': 'This is an example description for item 1',
        'wikipedia_id': '12345',
        'category': 'Food & Drinks'
      },
      {
        'title': 'Example Item 2',
        'image_url': 'https://example.com/image2.jpg',
        'description': 'This is an example description for item 2',
        'wikipedia_id': '',
        'category': 'Movies & TV'
      },
      {
        'title': 'Example Item 3',
        'image_url': '',
        'description': 'Item without image',
        'wikipedia_id': '',
        'category': ''
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk-import-template.xlsx"');
    res.send(buffer);

  } catch (error) {
    console.error('[Bulk Import] Error generating template:', error);
    res.status(500).json({ 
      error: 'Failed to generate template',
      message: error.message 
    });
  }
};

module.exports = {
  bulkImport,
  getTemplate
};

