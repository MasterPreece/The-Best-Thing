const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

// Try to load xlsx, but don't fail if it's not installed
let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.warn('Warning: xlsx module not installed. Bulk lookup functionality will be disabled.');
  XLSX = null;
}

// Rate limiting: delay between Wikipedia API calls (ms)
const API_DELAY = 300;

/**
 * Bulk lookup and import items from CSV/Excel file
 * POST /api/admin/bulk-lookup
 * Expects multipart/form-data with 'file' field
 * File format: CSV/Excel with a "Title" column (and optional "Category" column)
 * For each title, searches Wikipedia and adds the item if found
 */
const bulkLookup = async (req, res) => {
  try {
    if (!XLSX) {
      return res.status(503).json({ 
        error: 'Bulk lookup not available',
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

    console.log(`[Bulk Lookup] Parsed ${data.length} rows from file`);

    // Return immediately - process in background
    res.json({ 
      message: `Bulk lookup started for ${data.length} items. This will take approximately ${Math.round(data.length * API_DELAY / 1000 / 60)} minutes.`,
      note: 'The process is running in the background. Check logs to monitor progress.'
    });

    // Process in background (don't block response)
    processBulkLookup(data).catch(err => {
      console.error('[Bulk Lookup] Error during bulk lookup:', err);
    });

  } catch (error) {
    console.error('[Bulk Lookup] Error:', error);
    res.status(500).json({ 
      error: 'Failed to process bulk lookup',
      message: error.message 
    });
  }
};

/**
 * Process the bulk lookup data
 * @param {Array} data - Array of rows from CSV/Excel
 */
async function processBulkLookup(data) {
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  
  console.log(`[Bulk Lookup] Starting to process ${data.length} items...`);
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2; // +2 because Excel rows start at 1 and we have a header
    
    // Normalize column names (case-insensitive, handle spaces/underscores)
    const title = row.title || row.Title || row.TITLE || row.name || row.Name || row.NAME || 
                  row['Item Title'] || row['item title'] || row['Item Name'] || row['item name'];
    const categoryName = row.category || row.Category || row.CATEGORY || row['Category Name'] || 
                        row['category name'] || row.category_name;
    
    // Title is required
    if (!title || typeof title !== 'string' || !title.trim()) {
      errors.push({
        row: rowNum,
        error: 'Missing or invalid title',
        data: row
      });
      failed++;
      continue;
    }
    
    const trimmedTitle = title.trim();
    
    // Rate limiting: wait between Wikipedia API calls
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
    
    try {
      // Look up Wikipedia page for this title
      console.log(`[Bulk Lookup] [${i + 1}/${data.length}] Looking up: ${trimmedTitle}`);
      const pageInfo = await wikipediaFetcher.fetchPageInfo(trimmedTitle);
      
      if (!pageInfo || !pageInfo.wikipediaId) {
        console.log(`[Bulk Lookup] ✗ Not found or invalid: ${trimmedTitle}`);
        errors.push({
          row: rowNum,
          error: `Wikipedia page not found for "${trimmedTitle}"`,
          data: row
        });
        failed++;
        continue;
      }
      
      // Look up category by name if provided
      let categoryId = null;
      if (categoryName) {
        try {
          if (dbType === 'postgres') {
            const catResult = await db.query(`
              SELECT id FROM categories WHERE LOWER(name) = LOWER($1) OR LOWER(slug) = LOWER($1)
            `, [categoryName.trim()]);
            categoryId = catResult.rows[0]?.id || null;
          } else {
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
            console.log(`[Bulk Lookup] ⚠ Category "${categoryName}" not found for ${trimmedTitle}`);
            // Continue without category
          }
        } catch (err) {
          console.error(`[Bulk Lookup] Error looking up category "${categoryName}":`, err);
          // Continue without category
        }
      }
      
      // Check if item already exists
      let existing = false;
      if (dbType === 'postgres') {
        const existingResult = await db.query(
          'SELECT id FROM items WHERE title = $1 OR (wikipedia_id IS NOT NULL AND wikipedia_id = $2) LIMIT 1',
          [pageInfo.title, pageInfo.wikipediaId]
        );
        existing = existingResult.rows.length > 0;
      } else {
        existing = await new Promise((resolve) => {
          dbInstance.get(
            'SELECT id FROM items WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?) LIMIT 1',
            [pageInfo.title, pageInfo.wikipediaId],
            (err, row) => {
              resolve(err ? false : !!row);
            }
          );
        });
      }
      
      if (existing) {
        console.log(`[Bulk Lookup] ⏭ Already exists: ${pageInfo.title}`);
        skipped++;
        continue;
      }
      
      // Insert into database
      if (dbType === 'postgres') {
        await db.query(
          'INSERT INTO items (wikipedia_id, title, image_url, description, category_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description, categoryId]
        );
        
        // Check if insert succeeded
        const checkResult = await db.query('SELECT id FROM items WHERE title = $1', [pageInfo.title]);
        if (checkResult.rows.length > 0) {
          inserted++;
          const imageStatus = pageInfo.hasImage ? '📷' : '❌';
          console.log(`[Bulk Lookup] ${imageStatus} [${i + 1}/${data.length}] Added: ${pageInfo.title}`);
        } else {
          skipped++;
        }
      } else {
        await new Promise((resolve) => {
          dbInstance.run(
            'INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description, category_id) VALUES (?, ?, ?, ?, ?)',
            [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description, categoryId],
            function(err) {
              if (err) {
                console.error(`[Bulk Lookup] Error inserting ${pageInfo.title}:`, err);
                failed++;
                errors.push({
                  row: rowNum,
                  error: `Database error: ${err.message}`,
                  data: row
                });
              } else if (this.changes > 0) {
                inserted++;
                const imageStatus = pageInfo.hasImage ? '📷' : '❌';
                console.log(`[Bulk Lookup] ${imageStatus} [${i + 1}/${data.length}] Added: ${pageInfo.title}`);
              } else {
                skipped++;
              }
              resolve();
            }
          );
        });
      }
      
    } catch (error) {
      console.error(`[Bulk Lookup] Error processing "${trimmedTitle}":`, error.message);
      errors.push({
        row: rowNum,
        error: `Error: ${error.message}`,
        data: row
      });
      failed++;
    }
    
    // Progress update every 10 items
    if ((i + 1) % 10 === 0) {
      console.log(`[Bulk Lookup] Progress: ${i + 1}/${data.length} processed (${inserted} inserted, ${skipped} skipped, ${failed} failed)`);
    }
  }
  
  console.log(`\n[Bulk Lookup] ✅ Complete!`);
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already existed)`);
  console.log(`   ❌ Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`   📋 Errors (first 10):`);
    errors.slice(0, 10).forEach(err => {
      console.log(`      Row ${err.row}: ${err.error}`);
    });
  }
}

module.exports = {
  bulkLookup
};

