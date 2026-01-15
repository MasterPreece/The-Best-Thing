/**
 * Script to seed popular/highly-ranked Wikipedia articles
 * Run this to immediately add popular articles to the database
 * Usage: node server/scripts/seed-popular.js [count]
 */

const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

const POPULAR_COUNT = parseInt(process.argv[2]) || 50; // Default 50 popular articles

async function seedPopular() {
  console.log(`\n🎯 Starting to seed ${POPULAR_COUNT} popular Wikipedia articles...\n`);
  
  // Initialize database
  await db.init();
  
  // Get current count
  const dbInstance = db.getDb();
  const currentCount = await new Promise((resolve) => {
    dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
      if (err) {
        console.error('Error getting count:', err);
        resolve(0);
      } else {
        resolve(row ? row.count : 0);
      }
    });
  });
  
  console.log(`Current database has ${currentCount} items`);
  console.log(`Fetching ${POPULAR_COUNT} popular articles...\n`);
  
  // Fetch popular articles in batches
  const batches = Math.ceil(POPULAR_COUNT / 10);
  let totalAdded = 0;
  let totalSkipped = 0;
  
  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(10, POPULAR_COUNT - totalAdded);
    if (batchSize <= 0) break;
    
    console.log(`\nBatch ${i + 1}/${batches}: Fetching ${batchSize} popular articles...`);
    
    const result = await wikipediaFetcher.fetchPopularItemsOnly(batchSize);
    totalAdded += result.inserted;
    totalSkipped += result.skipped;
    
    // Wait a bit between batches to be respectful
    if (i < batches - 1) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Get final count
  const finalCount = await new Promise((resolve) => {
    dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
      if (err) {
        resolve(currentCount);
      } else {
        resolve(row ? row.count : currentCount);
      }
    });
  });
  
  console.log(`\n✅ Complete! Database now has ${finalCount} items`);
  console.log(`   Added ${totalAdded} new popular articles`);
  console.log(`   Skipped ${totalSkipped} existing/invalid articles\n`);
  process.exit(0);
}

seedPopular().catch(err => {
  console.error('Error seeding popular articles:', err);
  process.exit(1);
});

