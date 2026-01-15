/**
 * Script to seed database with articles from specific categories
 * Fetches top 50 articles from each specified category
 * Usage: node server/scripts/seed-categories.js
 */

const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

// Category mappings with alternatives (will fetch from multiple sources per category)
const CATEGORIES = [
  { name: 'Video Games', primary: ['Category:Video games'], alternatives: ['Category:Video game franchises', 'Category:Indie games', 'Category:Video game developers'] },
  { name: 'Historical Events', primary: ['Category:Historical events'], alternatives: ['Category:Battles', 'Category:Wars', 'Category:Events'] },
  { name: 'Automobiles/Vehicles', primary: ['Category:Automobiles', 'Category:Vehicles'], alternatives: ['Category:Vehicle manufacturers', 'Category:Cars', 'Category:Motorcycles'] },
  { name: 'Music/Artists/Songs', primary: ['Category:Musicians', 'Category:Songs'], alternatives: ['Category:Albums', 'Category:Musical groups', 'Category:Music genres'] },
  { name: 'Science', primary: ['Category:Science'], alternatives: ['Category:Scientific discoveries', 'Category:Physics', 'Category:Biology', 'Category:Chemistry'] },
  { name: 'Current Events', primary: ['Category:Current events'], alternatives: ['Category:2024', 'Category:News', 'Category:Events'] },
  { name: 'Restaurants', primary: ['Category:Restaurant chains'], alternatives: ['Category:Fast food', 'Category:Restaurants', 'Category:Food chains'] },
  { name: 'Foods', primary: ['Category:Foods'], alternatives: ['Category:Dishes', 'Category:Cuisine', 'Category:Food and drink'] },
  { name: 'Soda', primary: ['Category:Soft drinks'], alternatives: ['Category:Soft drink brands', 'Category:Beverages'] },
  { name: 'Candy', primary: ['Category:Candy'], alternatives: ['Category:Confectionery', 'Category:Candy brands', 'Category:Sweets'] },
  { name: 'Movies', primary: ['Category:Films'], alternatives: ['Category:Film franchises', 'Category:Film series', 'Category:Films by year'] },
  { name: 'TV Shows', primary: ['Category:Television series'], alternatives: ['Category:Television programs', 'Category:TV franchises', 'Category:TV shows by year'] },
  { name: 'Celebrities', primary: ['Category:Living people'], alternatives: ['Category:Actors', 'Category:Singers', 'Category:Models', 'Category:Celebrities'] },
  { name: 'Athletes', primary: ['Category:Athletes'], alternatives: ['Category:Olympic athletes', 'Category:Football players', 'Category:Basketball players', 'Category:Sportspeople'] },
  { name: 'Brands', primary: ['Category:Brands'], alternatives: ['Category:Company brands', 'Category:Product brands', 'Category:Commercial brands'] },
  { name: 'Memes', primary: ['Category:Internet memes'], alternatives: ['Category:Memes', 'Category:Viral phenomena'] },
  { name: 'Other Things', primary: [], alternatives: [] } // Will use random/featured articles
];

const ARTICLES_PER_CATEGORY = 50;
const API_DELAY = 300; // Rate limiting: delay between requests (ms)

async function seedCategories() {
  console.log(`\n🎯 Starting to seed database with ${ARTICLES_PER_CATEGORY} articles from ${CATEGORIES.length} categories...\n`);
  console.log(`Total target: ~${ARTICLES_PER_CATEGORY * CATEGORIES.length} articles\n`);
  
  // Initialize database
  await db.init();
  
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  
  // Get current count
  let currentCount = 0;
  if (dbType === 'postgres') {
    const result = await dbInstance.query('SELECT COUNT(*) as count FROM items');
    currentCount = parseInt(result.rows[0]?.count || 0);
  } else {
    currentCount = await new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        if (err) {
          console.error('Error getting count:', err);
          resolve(0);
        } else {
          resolve(row ? row.count : 0);
        }
      });
    });
  }
  
  console.log(`Current database has ${currentCount} items\n`);
  console.log(`Fetching ${ARTICLES_PER_CATEGORY} articles from each category...\n`);
  console.log('=' .repeat(60));
  
  let totalAdded = 0;
  let totalSkipped = 0;
  
  // Process each category
  for (let i = 0; i < CATEGORIES.length; i++) {
    const categoryInfo = CATEGORIES[i];
    const categoryNum = i + 1;
    
    console.log(`\n[${categoryNum}/${CATEGORIES.length}] Processing: ${categoryInfo.name.toUpperCase()}`);
    console.log('-'.repeat(60));
    
    let categoryAdded = 0;
    let categorySkipped = 0;
    let articlesToFetch = [];
    
    // Get articles from category (or use random for "other things")
    if (categoryInfo.primary.length > 0) {
      // Try primary categories first
      const articlesPerPrimary = Math.ceil(ARTICLES_PER_CATEGORY / categoryInfo.primary.length);
      
      for (const primaryCat of categoryInfo.primary) {
        if (articlesToFetch.length >= ARTICLES_PER_CATEGORY) break;
        
        const remaining = ARTICLES_PER_CATEGORY - articlesToFetch.length;
        const needed = Math.min(articlesPerPrimary, remaining);
        
        console.log(`Fetching articles from ${primaryCat}...`);
        const catArticles = await wikipediaFetcher.getArticlesFromCategory(primaryCat, needed);
        articlesToFetch = [...new Set([...articlesToFetch, ...catArticles])];
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      // If we didn't get enough, try alternatives
      if (articlesToFetch.length < ARTICLES_PER_CATEGORY && categoryInfo.alternatives.length > 0) {
        const remaining = ARTICLES_PER_CATEGORY - articlesToFetch.length;
        console.log(`Only got ${articlesToFetch.length} articles, trying alternatives...`);
        
        for (const alt of categoryInfo.alternatives) {
          if (articlesToFetch.length >= ARTICLES_PER_CATEGORY) break;
          
          const needed = ARTICLES_PER_CATEGORY - articlesToFetch.length;
          const altArticles = await wikipediaFetcher.getArticlesFromCategory(alt, needed);
          articlesToFetch = [...new Set([...articlesToFetch, ...altArticles])];
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
        }
      }
    } else {
      // For "other things", use random articles
      console.log(`Using random/featured articles for "other things"...`);
      const randomArticles = await wikipediaFetcher.getRandomArticles(Math.ceil(ARTICLES_PER_CATEGORY / 2));
      const popularArticles = await wikipediaFetcher.getPopularArticles(Math.ceil(ARTICLES_PER_CATEGORY / 2));
      articlesToFetch = [...new Set([...randomArticles, ...popularArticles])].slice(0, ARTICLES_PER_CATEGORY);
    }
    
    if (articlesToFetch.length === 0) {
      console.log(`❌ No articles retrieved for ${categoryInfo.name}`);
      continue;
    }
    
    console.log(`Retrieved ${articlesToFetch.length} article titles. Fetching details...`);
    
    // Fetch details for each article and insert into database
    for (let j = 0; j < articlesToFetch.length; j++) {
      const title = articlesToFetch[j];
      
      // Rate limiting: wait between requests
      if (j > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      // Fetch page information
      const pageInfo = await wikipediaFetcher.fetchPageInfo(title);
      
      if (!pageInfo || !pageInfo.wikipediaId) {
        console.log(`   ⏭️  Skipping ${title}: missing Wikipedia page ID`);
        categorySkipped++;
        continue;
      }
      
      // Check if item already exists
      let existingItem = null;
      if (dbType === 'postgres') {
        const result = await dbInstance.query(
          `SELECT id FROM items WHERE title = $1 OR (wikipedia_id IS NOT NULL AND wikipedia_id = $2) LIMIT 1`,
          [pageInfo.title, pageInfo.wikipediaId]
        );
        existingItem = result.rows[0];
      } else {
        existingItem = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT id FROM items
            WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?)
            LIMIT 1
          `, [pageInfo.title, pageInfo.wikipediaId], (err, item) => {
            resolve(item);
          });
        });
      }
      
      if (existingItem) {
        categorySkipped++;
        continue;
      }
      
      // Insert into database
      if (dbType === 'postgres') {
        const insertResult = await dbInstance.query(
          `INSERT INTO items (wikipedia_id, title, image_url, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (title) DO NOTHING`,
          [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description]
        );
        
        if (insertResult.rowCount > 0) {
          categoryAdded++;
          const imageStatus = pageInfo.imageUrl ? '📷' : '❌';
          console.log(`   ${imageStatus} Added: ${pageInfo.title}`);
        } else {
          categorySkipped++;
        }
      } else {
        const insertResult = await new Promise((resolve) => {
          dbInstance.run(`
            INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description)
            VALUES (?, ?, ?, ?)
          `, [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description], function(insertErr) {
            if (!insertErr && this.changes > 0) {
              resolve({ inserted: true });
            } else {
              resolve({ inserted: false });
            }
          });
        });
        
        if (insertResult.inserted) {
          categoryAdded++;
          const imageStatus = pageInfo.imageUrl ? '📷' : '❌';
          console.log(`   ${imageStatus} Added: ${pageInfo.title}`);
        } else {
          categorySkipped++;
        }
      }
    }
    
    totalAdded += categoryAdded;
    totalSkipped += categorySkipped;
    
    console.log(`\n✅ Category complete: Added ${categoryAdded}, Skipped ${categorySkipped}`);
    
    // Wait a bit between categories to be respectful to Wikipedia
    if (i < CATEGORIES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Get final count
  let finalCount = 0;
  if (dbType === 'postgres') {
    const result = await dbInstance.query('SELECT COUNT(*) as count FROM items');
    finalCount = parseInt(result.rows[0]?.count || 0);
  } else {
    finalCount = await new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        if (err) {
          resolve(currentCount);
        } else {
          resolve(row ? row.count : currentCount);
        }
      });
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Complete! Database now has ${finalCount} items`);
  console.log(`   Added ${totalAdded} new articles`);
  console.log(`   Skipped ${totalSkipped} existing/invalid articles`);
  console.log(`   Net new items: ${finalCount - currentCount}\n`);
  
  process.exit(0);
}

seedCategories().catch(err => {
  console.error('\n❌ Error seeding categories:', err);
  process.exit(1);
});

