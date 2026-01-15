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
  // Fetch more than needed to account for duplicates/invalid items
  const targetCount = POPULAR_COUNT;
  const fetchMultiplier = 3; // Fetch 3x to account for duplicates/skips
  const batches = Math.ceil((targetCount * fetchMultiplier) / 10);
  let totalAdded = 0;
  let totalSkipped = 0;
  let attempts = 0;
  const maxAttempts = batches * 2; // Limit total attempts
  
  console.log(`Fetching up to ${targetCount * fetchMultiplier} articles to get ${targetCount} unique ones...\n`);
  
  for (let i = 0; i < maxAttempts && totalAdded < targetCount; i++) {
    attempts++;
    const remaining = targetCount - totalAdded;
    const batchSize = Math.min(10, remaining + 5); // Fetch a few extra per batch
    
    console.log(`Batch ${attempts}: Trying to fetch ${batchSize} popular articles (${totalAdded}/${targetCount} added so far)...`);
    
    const result = await wikipediaFetcher.fetchPopularItemsOnly(batchSize);
    totalAdded += result.inserted;
    totalSkipped += result.skipped;
    
    console.log(`   → Added ${result.inserted}, Skipped ${result.skipped}`);
    
    // If we've reached our target, stop
    if (totalAdded >= targetCount) {
      console.log(`\n✅ Reached target of ${targetCount} articles!`);
      break;
    }
    
    // Wait a bit between batches to be respectful
    if (i < maxAttempts - 1 && totalAdded < targetCount) {
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

