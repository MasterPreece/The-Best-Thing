/**
 * Script to find items without images and attempt to fetch images for them
 * Uses Wikipedia API first, then Unsplash fallback (if configured), then placeholder
 * Only updates items that get real images (not placeholders)
 */

require('dotenv').config();
const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

// Rate limiting delay between API calls (ms)
const API_DELAY = 300;

/**
 * Find items that need images
 * Returns items where image_url is NULL, empty, or is a placeholder
 */
const findItemsWithoutImages = async () => {
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  if (dbType === 'postgres') {
    const result = await db.query(`
      SELECT id, title, image_url, wikipedia_id
      FROM items
      WHERE image_url IS NULL 
         OR image_url = ''
         OR image_url LIKE '%placeholder.com%'
      ORDER BY id
    `);
    return result.rows;
  } else {
    // SQLite
    return new Promise((resolve, reject) => {
      dbInstance.all(`
        SELECT id, title, image_url, wikipedia_id
        FROM items
        WHERE image_url IS NULL 
           OR image_url = ''
           OR image_url LIKE '%placeholder.com%'
        ORDER BY id
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
};

/**
 * Update an item's image URL
 */
const updateItemImage = async (itemId, imageUrl) => {
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  if (dbType === 'postgres') {
    await db.query(`
      UPDATE items 
      SET image_url = $1
      WHERE id = $2
    `, [imageUrl, itemId]);
  } else {
    return new Promise((resolve, reject) => {
      dbInstance.run(`
        UPDATE items 
        SET image_url = ?
        WHERE id = ?
      `, [imageUrl, itemId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }
};

/**
 * Main function to update missing images
 */
const updateMissingImages = async (options = {}) => {
  const {
    limit = null, // Process all by default, or set a limit
    batchSize = 50, // Process in batches to avoid overwhelming the API
    skipPlaceholders = true // Don't update if only placeholder found
  } = options;
  
  console.log('🔍 Finding items without images...');
  
  let itemsWithoutImages;
  try {
    itemsWithoutImages = await findItemsWithoutImages();
  } catch (error) {
    console.error('❌ Error finding items:', error);
    process.exit(1);
  }
  
  const totalItems = limit ? Math.min(itemsWithoutImages.length, limit) : itemsWithoutImages.length;
  
  if (totalItems === 0) {
    console.log('✅ All items already have images!');
    return { updated: 0, skipped: 0, failed: 0, placeholder: 0 };
  }
  
  console.log(`📋 Found ${itemsWithoutImages.length} items without images.`);
  console.log(`🔄 Processing ${totalItems} items (in batches of ${batchSize})...\n`);
  
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let placeholder = 0;
  
  // Process in batches
  for (let i = 0; i < totalItems; i += batchSize) {
    const batch = itemsWithoutImages.slice(i, Math.min(i + batchSize, totalItems));
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(totalItems / batchSize);
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
    
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      
      // Rate limiting: wait between requests (except first)
      if (j > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      try {
        console.log(`  [${i + j + 1}/${totalItems}] Fetching image for: ${item.title}...`);
        
        // Use fetchPageInfo to get image (tries Wikipedia, Unsplash, then placeholder)
        const pageInfo = await wikipediaFetcher.fetchPageInfo(item.title);
        
        if (!pageInfo) {
          console.log(`     ❌ Could not fetch page info`);
          failed++;
          continue;
        }
        
        // Check if we got a real image (not placeholder)
        const isPlaceholder = pageInfo.imageUrl && pageInfo.imageUrl.includes('placeholder.com');
        
        if (isPlaceholder && skipPlaceholders) {
          console.log(`     ⏭️  Only placeholder available, skipping`);
          placeholder++;
          continue;
        }
        
        // Update the item with the new image
        await updateItemImage(item.id, pageInfo.imageUrl);
        
        const source = pageInfo.imageSource || 'unknown';
        const emoji = isPlaceholder ? '📄' : '✅';
        console.log(`     ${emoji} Updated image (source: ${source})`);
        
        updated++;
        
      } catch (error) {
        console.error(`     ❌ Error processing ${item.title}:`, error.message);
        failed++;
      }
    }
    
    // Brief pause between batches
    if (i + batchSize < totalItems) {
      console.log(`\n⏸️  Pausing 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped (placeholder): ${placeholder}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📋 Total processed: ${totalItems}`);
  
  return { updated, skipped: placeholder, failed, placeholder };
};

// Run if called directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const limit = args[0] ? parseInt(args[0]) : null; // Optional limit
  const skipPlaceholders = !args.includes('--include-placeholders');
  
  console.log('🚀 Starting image update process...\n');
  
  // Initialize database
  db.init()
    .then(() => {
      console.log('✅ Database initialized\n');
      
      return updateMissingImages({
        limit,
        skipPlaceholders
      });
    })
    .then((results) => {
      console.log('\n✨ Process complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { updateMissingImages, findItemsWithoutImages };

