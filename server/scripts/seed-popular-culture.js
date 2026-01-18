/**
 * Script to seed popular culture and well-known items
 * Focuses on categories that users will recognize (TV shows, movies, celebrities, sports, etc.)
 * Run this to fill gaps in familiar content
 * Usage: node server/scripts/seed-popular-culture.js [count]
 */

const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');
const axios = require('axios');

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
const API_DELAY = 300;

/**
 * Get articles from specific popular subcategories
 * These are subcategories that tend to have well-known, recognizable items
 */
async function gatherPopularCultureArticles(targetCount = TARGET_COUNT) {
  console.log(`\n🎬 Gathering popular culture articles to get ${targetCount} familiar items...\n`);
  
  const allArticles = new Set();
  
  // Specific popular subcategories that users will recognize
  const popularSubcategories = [
    // TV Shows - Popular, well-known series
    'Category:American television series',
    'Category:British television series',
    'Category:Reality television series',
    'Category:Animated television series',
    'Category:Streaming television series',
    
    // Movies - Popular films
    'Category:American films',
    'Category:British films',
    'Category:Superhero films',
    'Category:Animated films',
    'Category:Action films',
    'Category:Comedy films',
    'Category:Horror films',
    
    // Celebrities & Public Figures
    'Category:American actors',
    'Category:American actresses',
    'Category:American musicians',
    'Category:American singers',
    'Category:American rappers',
    'Category:Professional wrestlers',
    'Category:Models',
    
    // Sports - Popular athletes and teams
    'Category:National Basketball Association players',
    'Category:National Football League players',
    'Category:Major League Baseball players',
    'Category:Premier League players',
    'Category:FIFA World Cup players',
    'Category:Olympic athletes',
    'Category:Formula One drivers',
    
    // Music - Popular artists and bands
    'Category:American musical groups',
    'Category:British musical groups',
    'Category:Rock music groups',
    'Category:Pop music groups',
    'Category:Hip hop groups',
    'Category:American rock musicians',
    'Category:American pop musicians',
    
    // Video Games - Popular games
    'Category:Action video games',
    'Category:Role-playing video games',
    'Category:Platform games',
    'Category:First-person shooter games',
    'Category:Sports video games',
    'Category:Super Mario games',
    'Category:The Legend of Zelda games',
    'Category:Pokémon games',
    
    // Brands & Companies - Well-known brands
    'Category:Fast food restaurant chains',
    'Category:Technology companies of the United States',
    'Category:Automotive brands',
    'Category:Soft drink brands',
    'Category:Candy brands',
    
    // Internet & Memes - Pop culture phenomena
    'Category:Internet memes',
    'Category:Social networking websites',
    'Category:Streaming services',
    'Category:Video sharing websites',
    
    // Food & Restaurants - Popular chains
    'Category:Restaurant chains',
    'Category:Coffeehouse chains',
    'Category:Pizza chains',
    'Category:Burger restaurants',
    
    // Other recognizable categories
    'Category:Marvel Comics characters',
    'Category:DC Comics characters',
    'Category:Star Wars',
    'Category:Harry Potter',
    'Category:The Lord of the Rings',
  ];
  
  const perCategoryTarget = Math.ceil(targetCount / popularSubcategories.length);
  
  for (const category of popularSubcategories) {
    if (allArticles.size >= targetCount * 1.2) break; // Get 20% more for buffer
    
    try {
      let continueToken = null;
      let fetchedFromCategory = 0;
      
      while (fetchedFromCategory < perCategoryTarget && allArticles.size < targetCount * 1.2) {
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
  
  console.log(`\n✅ Gathered ${allArticles.size} unique articles from popular culture categories\n`);
  return Array.from(allArticles);
}

/**
 * Get pageviews for articles to prioritize the most viewed/familiar ones
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
    return 0;
  }
}

/**
 * Sort by pageviews and filter out obscure items
 */
async function filterAndSortByPopularity(articleTitles, targetCount) {
  console.log(`📈 Getting pageview data for ${articleTitles.length} articles to find the most popular...\n`);
  
  const articlesWithViews = [];
  const batchSize = 20;
  
  for (let i = 0; i < articleTitles.length; i += batchSize) {
    const batch = articleTitles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(articleTitles.length / batchSize);
    
    console.log(`   Processing batch ${batchNum}/${totalBatches}...`);
    
    const batchResults = await Promise.all(
      batch.map(async (title, idx) => {
        if (idx > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const views = await getArticlePageviews(title);
        return { title, views };
      })
    );
    
    articlesWithViews.push(...batchResults);
    
    if ((i + batchSize) % 100 === 0 || i + batchSize >= articleTitles.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, articleTitles.length)}/${articleTitles.length} processed`);
    }
    
    if (i + batchSize < articleTitles.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Sort by pageviews (highest first)
  articlesWithViews.sort((a, b) => b.views - a.views);
  
  // Filter out items with very low pageviews (likely obscure)
  // Keep only top performers
  const minViews = Math.max(1000, articlesWithViews[Math.floor(articlesWithViews.length * 0.1)]?.views || 1000);
  const filtered = articlesWithViews.filter(item => item.views >= minViews);
  
  console.log(`\n✅ Filtered to ${filtered.length} articles with good pageviews (min: ${minViews.toLocaleString()})`);
  console.log(`📊 Top 10 articles by pageviews:`);
  filtered.slice(0, 10).forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.title}: ${item.views.toLocaleString()} views`);
  });
  
  return filtered.slice(0, targetCount).map(item => item.title);
}

/**
 * Main seeding function
 * @param {number} targetCount - Target number of articles to seed
 */
async function seedPopularCulture(targetCount = 500) {
  console.log(`\n🎬 Starting to seed ${targetCount} popular culture items...\n`);
  
  const startTime = Date.now();
  
  await db.init();
  
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
  
  // Step 1: Gather articles from popular culture categories
  const allArticleTitles = await gatherPopularCultureArticles(targetCount * 1.5);
  
  if (allArticleTitles.length === 0) {
    console.error('❌ No articles gathered.');
    throw new Error('No articles gathered');
  }
  
  // Step 2: Filter and sort by popularity
  const topArticles = await filterAndSortByPopularity(allArticleTitles, targetCount);
  
  console.log(`\n📋 Processing ${topArticles.length} popular culture articles...\n`);
  
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
      
      if (j > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      try {
        const pageInfo = await wikipediaFetcher.fetchPageInfo(title);
        
        if (!pageInfo || !pageInfo.wikipediaId) {
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
  
  console.log(`\n\n✅ Popular culture seeding complete!`);
  console.log(`   📊 Final database count: ${finalCount} items (+${finalCount - currentCount} new)`);
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   ⏭️  Skipped: ${skipped} (already existed or invalid)`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Time elapsed: ${elapsed} minutes\n`);
  
  return { inserted, skipped, failed, finalCount, previousCount: currentCount };
}

// Run if called directly
if (require.main === module) {
  const targetCount = parseInt(process.argv[2]) || 500;
  seedPopularCulture(targetCount).catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }).then(() => {
    process.exit(0);
  });
}

module.exports = { seedPopularCulture };

