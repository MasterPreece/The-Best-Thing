/**
 * Script to seed the top 2000 most popular Wikipedia articles
 * Respects Wikipedia's rate limits with proper delays
 * Usage: node server/scripts/seed-top-2000.js [count]
 * 
 * This script:
 * 1. Gets articles from multiple high-quality sources
 * 2. Sorts them by actual pageviews (using Wikipedia's REST API)
 * 3. Processes in batches with rate limiting
 * 4. Takes ~15-20 minutes for 2000 articles (respectful of API limits)
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
const API_DELAY = 300; // 300ms between requests (respectful rate limiting)

// TARGET_COUNT will be read from process.argv when run as script, or default to 2000
// When used as module, we'll accept it as a parameter
const TARGET_COUNT = parseInt(process.argv[2]) || 2000;

/**
 * Get articles from multiple high-quality sources
 * @param {number} targetCount - Target number of articles to gather
 * @param {string} category - Optional Wikipedia category to filter by (e.g., 'Category:Films')
 */
async function gatherTopArticles(targetCount = TARGET_COUNT, category = null) {
  const sourceDesc = category ? `from category "${category}"` : 'from multiple sources';
  console.log(`\n🔍 Gathering articles ${sourceDesc} to find top ${targetCount}...\n`);
  
  const allArticles = new Set();
  
  // If category is specified, only gather from that category
  if (category) {
    console.log(`🏷️  Getting articles from ${category}...`);
    try {
      let continueToken = null;
      let fetched = 0;
      const gatherTarget = targetCount * 3; // Get more to ensure enough for sorting
      
      while (fetched < gatherTarget) {
        const params = {
          action: 'query',
          format: 'json',
          list: 'categorymembers',
          cmtitle: category,
          cmnamespace: 0,
          cmlimit: 500,
          cmtype: 'page',
          redirects: 1
        };
        
        if (continueToken) {
          params.cmcontinue = continueToken;
        }
        
        const response = await axios.get(WIKIPEDIA_API, {
          params,
          headers: {
            'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
          }
        });
        
        const members = response.data.query?.categorymembers || [];
        members.forEach(m => allArticles.add(m.title));
        fetched += members.length;
        
        console.log(`   ✓ Added ${members.length} from ${category} (${allArticles.size} total)`);
        
        continueToken = response.data.continue?.cmcontinue;
        if (!continueToken) break;
        
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      console.log(`\n✅ Gathered ${allArticles.size} unique articles from ${category}\n`);
      return Array.from(allArticles);
    } catch (err) {
      console.error(`   ✗ Error fetching from ${category}:`, err.message);
      return [];
    }
  }
  
  // Source 1: Most viewed articles (get max allowed)
  console.log('📊 Getting most viewed articles...');
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        list: 'mostviewed',
        pvimlimit: 500, // Get up to 500 most viewed
        pvimnamespace: 0,
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });
    
    const mostviewed = response.data.query?.mostviewed || [];
    mostviewed.forEach(article => allArticles.add(article.title));
    console.log(`   ✓ Added ${mostviewed.length} most viewed articles (${allArticles.size} total)`);
    
    await new Promise(resolve => setTimeout(resolve, API_DELAY));
  } catch (err) {
    console.error('   ✗ Error fetching most viewed:', err.message);
  }
  
  // Source 2: Featured articles (high-quality, well-known)
  console.log('⭐ Getting featured articles...');
  try {
    let continueToken = null;
    let fetched = 0;
    const maxFeatured = 500;
    const gatherTarget = targetCount * 2; // Gather 2x to ensure we have enough for sorting
    
    while (fetched < maxFeatured && allArticles.size < gatherTarget) {
      const params = {
        action: 'query',
        format: 'json',
        list: 'categorymembers',
        cmtitle: 'Category:Featured articles',
        cmnamespace: 0,
        cmlimit: 500,
        cmtype: 'page',
        redirects: 1
      };
      
      if (continueToken) {
        params.cmcontinue = continueToken;
      }
      
      const response = await axios.get(WIKIPEDIA_API, {
        params,
        headers: {
          'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
        }
      });
      
      const members = response.data.query?.categorymembers || [];
      members.forEach(m => allArticles.add(m.title));
      fetched += members.length;
      
      console.log(`   ✓ Added ${members.length} featured articles (${allArticles.size} total)`);
      
      continueToken = response.data.continue?.cmcontinue;
      if (!continueToken) break;
      
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
  } catch (err) {
    console.error('   ✗ Error fetching featured articles:', err.message);
  }
  
  // Source 3: Good articles (another high-quality source)
  console.log('✨ Getting good articles...');
  try {
    let continueToken = null;
    let fetched = 0;
    const maxGood = 500;
    const gatherTarget = targetCount * 2; // Gather 2x to ensure we have enough for sorting
    
    while (fetched < maxGood && allArticles.size < gatherTarget) {
      const params = {
        action: 'query',
        format: 'json',
        list: 'categorymembers',
        cmtitle: 'Category:Good articles',
        cmnamespace: 0,
        cmlimit: 500,
        cmtype: 'page',
        redirects: 1
      };
      
      if (continueToken) {
        params.cmcontinue = continueToken;
      }
      
      const response = await axios.get(WIKIPEDIA_API, {
        params,
        headers: {
          'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
        }
      });
      
      const members = response.data.query?.categorymembers || [];
      members.forEach(m => allArticles.add(m.title));
      fetched += members.length;
      
      console.log(`   ✓ Added ${members.length} good articles (${allArticles.size} total)`);
      
      continueToken = response.data.continue?.cmcontinue;
      if (!continueToken) break;
      
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
  } catch (err) {
    console.error('   ✗ Error fetching good articles:', err.message);
  }
  
  // Source 4: Popular categories
  console.log('🏷️  Getting articles from popular categories...');
  const popularCategories = [
    'Category:Countries',
    'Category:Cities',
    'Category:Biography',
    'Category:Films',
    'Category:Music',
    'Category:Video games',
    'Category:Sports',
    'Category:Technology'
  ];
  
  const gatherTarget = targetCount * 2; // Gather 2x to ensure we have enough for sorting
  // For large targetCounts, get more per category (up to 1000 per category)
  const perCategoryLimit = Math.min(1000, Math.max(200, Math.ceil(targetCount / 10)));
  
  for (const category of popularCategories) {
    if (allArticles.size >= gatherTarget) break;
    
    try {
      let continueToken = null;
      let fetchedFromCategory = 0;
      const categoryTarget = Math.min(perCategoryLimit, gatherTarget - allArticles.size);
      
      while (fetchedFromCategory < categoryTarget && allArticles.size < gatherTarget) {
        const params = {
          action: 'query',
          format: 'json',
          list: 'categorymembers',
          cmtitle: category,
          cmnamespace: 0,
          cmlimit: Math.min(500, categoryTarget - fetchedFromCategory), // Get up to 500 per request
          cmtype: 'page',
          redirects: 1
        };
        
        if (continueToken) {
          params.cmcontinue = continueToken;
        }
        
        const response = await axios.get(WIKIPEDIA_API, {
          params,
          headers: {
            'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
          }
        });
        
        const members = response.data.query?.categorymembers || [];
        members.forEach(m => allArticles.add(m.title));
        fetchedFromCategory += members.length;
        
        if (members.length > 0) {
          console.log(`   ✓ Added ${members.length} from ${category} (${allArticles.size} total)`);
        }
        
        continueToken = response.data.continue?.cmcontinue;
        if (!continueToken || members.length === 0) break;
        
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
    } catch (err) {
      console.error(`   ✗ Error fetching ${category}:`, err.message);
    }
  }
  
  console.log(`\n✅ Gathered ${allArticles.size} unique articles from all sources\n`);
  return Array.from(allArticles);
}

/**
 * Get pageviews for articles using Wikipedia's REST API
 * Uses last 60 days of pageviews to determine popularity
 */
async function getArticlePageviews(articleTitle) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };
    
    const formattedTitle = articleTitle.replace(/ /g, '_');
    const encodedTitle = encodeURIComponent(formattedTitle);
    const url = `${PAGEVIEWS_API}/${encodedTitle}/daily/${formatDate(startDate)}/${formatDate(endDate)}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      },
      timeout: 5000
    });
    
    const items = response.data.items || [];
    return items.reduce((sum, item) => sum + (item.views || 0), 0);
  } catch (error) {
    // If pageview data isn't available, return 0 (article will be lower ranked)
    return 0;
  }
}

/**
 * Sort articles by pageviews and return top N (or range if specified)
 * @param {string[]} articleTitles - Array of article titles
 * @param {number} targetCount - Target number of articles
 * @param {number} startRank - Optional starting rank (1-based, inclusive)
 * @param {number} endRank - Optional ending rank (1-based, inclusive)
 */
async function sortByPageviews(articleTitles, targetCount = TARGET_COUNT, startRank = null, endRank = null) {
  const rangeDesc = startRank && endRank ? `ranked ${startRank}-${endRank}` : `top ${targetCount}`;
  console.log(`📈 Getting pageview data for ${articleTitles.length} articles to find ${rangeDesc}...\n`);
  
  const articlesWithViews = [];
  const batchSize = 20; // Process 20 at a time to balance speed and rate limits
  
  for (let i = 0; i < articleTitles.length; i += batchSize) {
    const batch = articleTitles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(articleTitles.length / batchSize);
    
    console.log(`   Processing batch ${batchNum}/${totalBatches} (${batch.length} articles)...`);
    
    const batchResults = await Promise.all(
      batch.map(async (title, idx) => {
        // Small delay between requests in batch
        if (idx > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const views = await getArticlePageviews(title);
        return { title, views };
      })
    );
    
    articlesWithViews.push(...batchResults);
    
    // Progress update
    if ((i + batchSize) % 100 === 0 || i + batchSize >= articleTitles.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, articleTitles.length)}/${articleTitles.length} processed`);
    }
    
    // Delay between batches
    if (i + batchSize < articleTitles.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Sort by pageviews (highest first)
  articlesWithViews.sort((a, b) => b.views - a.views);
  
  // If range is specified, take that range instead of top N
  let selectedArticles;
  if (startRank && endRank) {
    // Convert to 0-based index (startRank is 1-based)
    const startIdx = Math.max(0, startRank - 1);
    const endIdx = Math.min(articlesWithViews.length, endRank);
    
    if (startIdx >= articlesWithViews.length) {
      console.log(`\n⚠️  Warning: Start rank ${startRank} exceeds available articles (${articlesWithViews.length}). Returning empty array.\n`);
      return [];
    }
    
    selectedArticles = articlesWithViews.slice(startIdx, endIdx);
    console.log(`\n✅ Articles ranked ${startRank}-${endRank} by pageviews (showing first 5):`);
    selectedArticles.slice(0, 5).forEach((item, idx) => {
      const actualRank = startIdx + idx + 1;
      console.log(`   ${actualRank}. ${item.title}: ${item.views.toLocaleString()} views`);
    });
  } else {
    selectedArticles = articlesWithViews.slice(0, targetCount);
    console.log(`\n✅ Top 10 articles by pageviews:`);
    selectedArticles.slice(0, 10).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.title}: ${item.views.toLocaleString()} views`);
    });
  }
  
  return selectedArticles.map(item => item.title).filter(Boolean);
}

/**
 * Main seeding function
 * @param {number} targetCount - Target number of articles (ignored if range is specified)
 * @param {string} category - Optional Wikipedia category to filter by
 * @param {number} startRank - Optional starting rank (1-based, for range selection)
 * @param {number} endRank - Optional ending rank (1-based, for range selection)
 */
async function seedTopArticles(targetCount = TARGET_COUNT, category = null, startRank = null, endRank = null) {
  // Ensure we have a valid count (use range size if range is specified)
  const effectiveCount = (startRank && endRank) ? (endRank - startRank + 1) : (targetCount || TARGET_COUNT);
  const targetArticleCount = effectiveCount;
  const estimatedMinutes = Math.round(targetArticleCount / 100);
  
  const rangeDesc = (startRank && endRank) ? `ranked ${startRank}-${endRank}` : `top ${targetArticleCount}`;
  const categoryDesc = category ? ` from ${category}` : '';
  
  console.log(`\n🚀 Starting to seed ${rangeDesc} Wikipedia articles${categoryDesc}`);
  console.log(`⏱️  Estimated time: ~${estimatedMinutes}-${Math.round(estimatedMinutes * 1.2)} minutes (respecting rate limits)\n`);
  
  const startTime = Date.now();
  
  // Initialize database
  await db.init();
  
  // Get current count
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  let currentCount = 0;
  if (dbType === 'postgres') {
    const result = await db.query('SELECT COUNT(*) as count FROM items');
    currentCount = parseInt(result.rows[0]?.count || 0);
  } else {
    currentCount = await new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        if (err) resolve(0);
        else resolve(row ? row.count : 0);
      });
    });
  }
  
  console.log(`📊 Current database has ${currentCount} items\n`);
  
  // Step 1: Gather articles from multiple sources (or specific category)
  // If a range is specified, gather at least endRank articles (with buffer for duplicates)
  // Otherwise, use targetCount * 2 to ensure enough articles for sorting
  const gatherCount = (startRank && endRank) ? Math.max(endRank * 1.5, targetCount * 2) : targetCount * 2;
  const allArticleTitles = await gatherTopArticles(gatherCount, category);
  
  if (allArticleTitles.length === 0) {
    console.error('❌ No articles gathered.');
    throw new Error('No articles gathered');
  }
  
  // Step 2: Sort by pageviews and get top N (or range)
  const topArticles = await sortByPageviews(allArticleTitles, targetCount, startRank, endRank);
  
  console.log(`\n📋 Processing top ${topArticles.length} articles...\n`);
  
  // Step 3: Fetch details and insert into database
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < topArticles.length; i += BATCH_SIZE) {
    const batch = topArticles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(topArticles.length / BATCH_SIZE);
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} articles)...`);
    
    for (let j = 0; j < batch.length; j++) {
      const title = batch[j];
      
      // Rate limiting
      if (j > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      try {
        // Fetch page info (includes Wikipedia image, description, etc.)
        const pageInfo = await wikipediaFetcher.fetchPageInfo(title);
        
        if (!pageInfo) {
          skipped++;
          continue;
        }
        
        // Skip if no Wikipedia ID (invalid page)
        if (!pageInfo.wikipediaId) {
          skipped++;
          continue;
        }
        
        // Check if already exists
        if (dbType === 'postgres') {
          const existing = await db.query(
            'SELECT id FROM items WHERE title = $1 OR (wikipedia_id IS NOT NULL AND wikipedia_id = $2) LIMIT 1',
            [pageInfo.title, pageInfo.wikipediaId]
          );
          
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }
          
          // Insert
          await db.query(
            'INSERT INTO items (wikipedia_id, title, image_url, description) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description]
          );
          
          const checkInsert = await db.query('SELECT id FROM items WHERE title = $1', [pageInfo.title]);
          if (checkInsert.rows.length > 0) {
            inserted++;
            const imageStatus = pageInfo.hasImage ? '📷' : '❌';
            console.log(`   ${imageStatus} [${i + j + 1}/${topArticles.length}] ${pageInfo.title}`);
          } else {
            skipped++;
          }
        } else {
          // SQLite
          await new Promise((resolve) => {
            dbInstance.get(
              'SELECT id FROM items WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?) LIMIT 1',
              [pageInfo.title, pageInfo.wikipediaId],
              async (err, existing) => {
                if (err || existing) {
                  skipped++;
                  return resolve();
                }
                
                dbInstance.run(
                  'INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description) VALUES (?, ?, ?, ?)',
                  [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description],
                  function(insertErr) {
                    if (insertErr) {
                      failed++;
                    } else if (this.changes > 0) {
                      inserted++;
                      const imageStatus = pageInfo.hasImage ? '📷' : '❌';
                      console.log(`   ${imageStatus} [${i + j + 1}/${topArticles.length}] ${pageInfo.title}`);
                    } else {
                      skipped++;
                    }
                    resolve();
                  }
                );
              }
            );
          });
        }
        
      } catch (error) {
        console.error(`   ✗ Error processing ${title}:`, error.message);
        failed++;
      }
    }
    
    // Brief pause between batches
    if (i + BATCH_SIZE < topArticles.length) {
      console.log(`   ⏸️  Pausing 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Get final count
  let finalCount = currentCount;
  if (dbType === 'postgres') {
    const result = await db.query('SELECT COUNT(*) as count FROM items');
    finalCount = parseInt(result.rows[0]?.count || 0);
  } else {
    finalCount = await new Promise((resolve) => {
      dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
        if (err) resolve(currentCount);
        else resolve(row ? row.count : currentCount);
      });
    });
  }
  
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log(`\n\n✅ Seeding complete!`);
  console.log(`   📊 Final database count: ${finalCount} items (+${finalCount - currentCount} new)`);
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already existed or invalid)`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Time elapsed: ${elapsed} minutes\n`);
  
  return { inserted, skipped, failed, finalCount, previousCount: currentCount };
}

// Export for use as module
module.exports = { seedTopArticles };

// Run if called directly
if (require.main === module) {
  seedTopArticles().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }).then(() => {
    process.exit(0);
  });
}

