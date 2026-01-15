const db = require('../database');
const axios = require('axios');

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const API_DELAY = 300;
const INITIAL_SEED_COUNT = 50; // Seed with 50 items initially

/**
 * Fetch page information including image
 */
const fetchPageInfo = async (title) => {
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        prop: 'pageimages|extracts|pageprops',
        piprop: 'original',
        exintro: true,
        explaintext: true,
        pithumbsize: 400,
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });
    
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    
    if (page.missing || page.invalid || !page.pageid) {
      return null;
    }
    
    if (page.title.includes('(disambiguation)') || 
        (page.title.includes('List of') && page.title.includes(':'))) {
      return null;
    }
    
    return {
      wikipediaId: page.pageid,
      title: page.title,
      imageUrl: page.original?.source || page.thumbnail?.source || null,
      description: page.extract?.substring(0, 500) || ''
    };
  } catch (error) {
    console.error(`Error fetching page ${title}:`, error.message);
    return null;
  }
};

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
 * Auto-seed database if empty (runs in background)
 */
const autoSeedIfEmpty = async () => {
  const dbInstance = db.getDb();
  
  return new Promise((resolve) => {
    dbInstance.get('SELECT COUNT(*) as count FROM items', async (err, row) => {
      if (err) {
        console.error('Error checking item count:', err);
        return resolve();
      }
      
      const itemCount = row ? row.count : 0;
      
      if (itemCount > 0) {
        console.log(`Database has ${itemCount} items. No seeding needed.`);
        return resolve();
      }
      
      console.log('Database is empty. Starting auto-seed...');
      console.log(`Fetching ${INITIAL_SEED_COUNT} Wikipedia pages...`);
      
      try {
        // Get random article titles
        const titles = await getRandomArticles(INITIAL_SEED_COUNT);
        
        if (titles.length === 0) {
          console.log('No articles retrieved for seeding');
          return resolve();
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
          await new Promise((resolveInsert) => {
            dbInstance.get(`
              SELECT id FROM items 
              WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?)
              LIMIT 1
            `, [pageInfo.title, pageInfo.wikipediaId], (err, existingItem) => {
              if (err || existingItem) {
                skipped++;
                return resolveInsert();
              }
              
              dbInstance.run(`
                INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description)
                VALUES (?, ?, ?, ?)
              `, [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description], function(insertErr) {
                if (!insertErr && this.changes > 0) {
                  inserted++;
                } else {
                  skipped++;
                }
                resolveInsert();
              });
            });
          });
        }
        
        console.log(`Auto-seed complete! Added ${inserted} items, skipped ${skipped}.`);
        console.log(`Database will continue to grow automatically as users vote.`);
        
      } catch (error) {
        console.error('Error during auto-seed:', error);
      }
      
      resolve();
    });
  });
};

module.exports = {
  autoSeedIfEmpty
};

