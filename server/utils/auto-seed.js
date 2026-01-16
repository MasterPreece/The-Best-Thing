const db = require('../database');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

const API_DELAY = 300;
const INITIAL_SEED_COUNT = 50; // Seed with 50 items initially

// Use the shared fetchPageInfo function from wikipedia-fetcher
const fetchPageInfo = wikipediaFetcher.fetchPageInfo;

/**
 * Get random Wikipedia articles
 */
const getRandomArticles = async (count = 10) => {
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        list: 'random',
        rnnamespace: 0,
        rnlimit: count,
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });

    const articles = response.data.query.random || [];
    return articles.map(article => article.title);
  } catch (error) {
    console.error('Error fetching random articles:', error.message);
    return [];
  }
};

/**
 * Get popular/most viewed Wikipedia articles
 */
const getPopularArticles = async (count = 10) => {
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        list: 'mostviewed',
        pvimlimit: count,
        pvimnamespace: 0,
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });

    const articles = response.data.query?.mostviewed || [];
    if (articles.length > 0) {
      return articles.map(article => article.title);
    }
    
    // Fallback to featured articles
    return await getFeaturedArticles(count);
  } catch (error) {
    console.error('Error fetching popular articles:', error.message);
    return await getFeaturedArticles(count);
  }
};

/**
 * Get featured articles (high-quality, well-maintained Wikipedia pages)
 */
const getFeaturedArticles = async (count = 10) => {
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        list: 'categorymembers',
        cmtitle: 'Category:Featured articles',
        cmnamespace: 0,
        cmlimit: count * 2,
        cmtype: 'page',
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });

    const members = response.data.query?.categorymembers || [];
    const shuffled = members.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(member => member.title);
  } catch (error) {
    console.error('Error fetching featured articles:', error.message);
    return [];
  }
};

/**
 * Auto-seed database if empty (runs in background)
 */
const autoSeedIfEmpty = async () => {
  try {
    const dbType = db.getDbType();
    let itemCount = 0;
    
    if (dbType === 'postgres') {
      // Use PostgreSQL query helper
      const result = await db.query('SELECT COUNT(*) as count FROM items');
      itemCount = result.rows[0] ? parseInt(result.rows[0].count) : 0;
    } else {
      // Use SQLite callback style
      const dbInstance = db.getDb();
      const row = await new Promise((resolve, reject) => {
        dbInstance.get('SELECT COUNT(*) as count FROM items', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      itemCount = row ? row.count : 0;
    }
    
    if (itemCount > 0) {
      console.log(`Database has ${itemCount} items. No seeding needed.`);
      return;
    }
    
    console.log('Database is empty. Starting auto-seed...');
    console.log(`Fetching ${INITIAL_SEED_COUNT} Wikipedia pages...`);
    
    // Mix of popular and random articles for initial seed
    console.log('Fetching mix of popular and random articles...');
    const popularTitles = await getPopularArticles(Math.ceil(INITIAL_SEED_COUNT / 2));
    const randomTitles = await getRandomArticles(Math.floor(INITIAL_SEED_COUNT / 2));
    const titles = [...popularTitles, ...randomTitles];
    
    if (titles.length === 0) {
      console.log('No articles retrieved for seeding');
      return;
    }
    
    let inserted = 0;
    let skipped = 0;
    
    // Fetch and insert pages (limit to avoid blocking server start)
    const seedLimit = Math.min(20, titles.length); // Seed max 20 on startup
    
    for (let i = 0; i < seedLimit; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      const pageInfo = await fetchPageInfo(titles[i]);
      
      if (!pageInfo) {
        skipped++;
        continue;
      }
      
      // Check if exists and insert
      let existingItem = null;
      if (dbType === 'postgres') {
        const result = await db.query(`
          SELECT id FROM items 
          WHERE title = $1 OR (wikipedia_id IS NOT NULL AND wikipedia_id = $2)
          LIMIT 1
        `, [pageInfo.title, pageInfo.wikipediaId]);
        existingItem = result.rows[0] || null;
      } else {
        const dbInstance = db.getDb();
        existingItem = await new Promise((resolve, reject) => {
          dbInstance.get(`
            SELECT id FROM items 
            WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?)
            LIMIT 1
          `, [pageInfo.title, pageInfo.wikipediaId], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          });
        });
      }
      
      if (existingItem) {
        skipped++;
        continue;
      }
      
      // Insert item
      if (dbType === 'postgres') {
        const result = await db.query(`
          INSERT INTO items (wikipedia_id, title, image_url, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (title) DO NOTHING
          RETURNING id
        `, [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description]);
        
        if (result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } else {
        const dbInstance = db.getDb();
        const result = await new Promise((resolve, reject) => {
          dbInstance.run(`
            INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description)
            VALUES (?, ?, ?, ?)
          `, [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description], function(insertErr) {
            if (insertErr) reject(insertErr);
            else resolve({ changes: this.changes });
          });
        });
        
        if (result.changes > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }
    }
    
    console.log(`Auto-seed complete! Added ${inserted} items, skipped ${skipped}.`);
    console.log(`Database will continue to grow automatically as users vote.`);
    
  } catch (error) {
    console.error('Error during auto-seed:', error);
  }
};

module.exports = {
  autoSeedIfEmpty
};

