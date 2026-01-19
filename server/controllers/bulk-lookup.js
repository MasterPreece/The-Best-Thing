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

    // Parse the file with UTF-8 encoding support
    let workbook;
    try {
      if (fileExtension === 'csv') {
        // Handle CSV files specially to preserve UTF-8 encoding
        // Parse CSV as UTF-8 string to preserve special characters
        const csvText = file.buffer.toString('utf8');
        
        // Remove BOM if present
        const csvWithoutBOM = csvText.length > 0 && csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
        
        // Parse CSV with UTF-8 encoding
        workbook = XLSX.read(csvWithoutBOM, { 
          type: 'string',
          codepage: 65001 // UTF-8
        });
      } else {
        // Parse Excel files with UTF-8 encoding
        workbook = XLSX.read(file.buffer, { 
          type: 'buffer',
          codepage: 65001 // UTF-8
        });
      }
    } catch (err) {
      return res.status(400).json({ 
        error: 'Failed to parse file',
        message: 'The file appears to be corrupted or in an unsupported format'
      });
    }

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with UTF-8 handling
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
      
      // Insert into database with higher initial familiarity score for manually uploaded items
      // Set familiarity_score to 65 (out of 100) to make them show up more often
      const initialFamiliarityScore = 65.0;
      const now = new Date().toISOString();
      
      if (dbType === 'postgres') {
        await db.query(
          'INSERT INTO items (wikipedia_id, title, image_url, description, category_id, familiarity_score, first_seen_at, last_compared_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING',
          [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description, categoryId, initialFamiliarityScore, now, now]
        );
        
        // Check if insert succeeded
        const checkResult = await db.query('SELECT id FROM items WHERE title = $1', [pageInfo.title]);
        if (checkResult.rows.length > 0) {
          inserted++;
          const imageStatus = pageInfo.hasImage ? '📷' : '❌';
          console.log(`[Bulk Lookup] ${imageStatus} [${i + 1}/${data.length}] Added: ${pageInfo.title} (familiarity: ${initialFamiliarityScore})`);
        } else {
          skipped++;
        }
      } else {
        // SQLite: Try with category_id and familiarity_score first, fall back if columns don't exist
        await new Promise((resolve) => {
          // Try with all columns first (category_id, familiarity_score, first_seen_at, last_compared_at)
          const now = new Date().toISOString();
          const initialFamiliarityScore = 65.0;
          
          dbInstance.run(
            'INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description, category_id, familiarity_score, first_seen_at, last_compared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description, categoryId, initialFamiliarityScore, now, now],
            function(err) {
              if (err) {
                const errorStr = err.message || err.toString() || '';
                // If category_id column doesn't exist, try without it but with familiarity
                if (errorStr.includes('no such column') && errorStr.includes('category_id')) {
                  console.log(`[Bulk Lookup] Category column not available, inserting without category`);
                  // Retry without category_id but with familiarity_score
                  dbInstance.run(
                    'INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description, familiarity_score, first_seen_at, last_compared_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description, initialFamiliarityScore, now, now],
                    function(retryErr) {
                      if (retryErr) {
                        const retryErrorStr = retryErr.message || retryErr.toString() || '';
                        // If familiarity_score columns don't exist, try without them
                        if (retryErrorStr.includes('no such column') && (retryErrorStr.includes('familiarity_score') || retryErrorStr.includes('first_seen_at') || retryErrorStr.includes('last_compared_at'))) {
                          console.log(`[Bulk Lookup] Familiarity columns not available, inserting without them`);
                          // Final fallback: just basic columns
                          dbInstance.run(
                            'INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description) VALUES (?, ?, ?, ?)',
                            [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description],
                            function(finalErr) {
                              if (finalErr) {
                                console.error(`[Bulk Lookup] Error inserting ${pageInfo.title}:`, finalErr);
                                failed++;
                                errors.push({
                                  row: rowNum,
                                  error: `Database error: ${finalErr.message}`,
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
                        } else {
                          // Other error
                          console.error(`[Bulk Lookup] Error inserting ${pageInfo.title}:`, retryErr);
                          failed++;
                          errors.push({
                            row: rowNum,
                            error: `Database error: ${retryErr.message}`,
                            data: row
                          });
                          resolve();
                        }
                      } else if (this.changes > 0) {
                        inserted++;
                        const imageStatus = pageInfo.hasImage ? '📷' : '❌';
                        console.log(`[Bulk Lookup] ${imageStatus} [${i + 1}/${data.length}] Added: ${pageInfo.title} (familiarity: ${initialFamiliarityScore})`);
                        resolve();
                      } else {
                        skipped++;
                        resolve();
                      }
                    }
                  );
                } else {
                  // Other error
                  console.error(`[Bulk Lookup] Error inserting ${pageInfo.title}:`, err);
                  failed++;
                  errors.push({
                    row: rowNum,
                    error: `Database error: ${err.message}`,
                    data: row
                  });
                  resolve();
                }
              } else if (this.changes > 0) {
                inserted++;
                const imageStatus = pageInfo.hasImage ? '📷' : '❌';
                console.log(`[Bulk Lookup] ${imageStatus} [${i + 1}/${data.length}] Added: ${pageInfo.title} (familiarity: ${initialFamiliarityScore})`);
                resolve();
              } else {
                skipped++;
                resolve();
              }
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

