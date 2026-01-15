const axios = require('axios');
const db = require('../database');

// Wikipedia API endpoint
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// Rate limiting: delay between API calls (ms) - be respectful!
const API_DELAY = 300;

// Minimum items before we start fetching more
const MIN_ITEMS_THRESHOLD = 50;

// Maximum items to fetch in one batch
const BATCH_SIZE = 10;

// Track if we're currently fetching to avoid duplicate requests
let isFetching = false;
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 60000; // Only fetch once per minute max

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
        rnnamespace: 0, // Only main articles (not disambiguation pages, etc.)
        rnlimit: count,
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/yourusername/the-best-thing; contact@example.com)'
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
        'User-Agent': 'TheBestThing/1.0 (https://github.com/yourusername/the-best-thing; contact@example.com)'
      }
    });
    
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    
    if (page.missing || page.invalid) {
      return null;
    }
    
    // Skip disambiguation pages and other non-content pages
    if (page.title.includes('(disambiguation)') || 
        page.title.includes('List of') && page.title.includes(':')) {
      return null;
    }
    
    const wikipediaId = page.pageid || null;
    
    return {
      wikipediaId,
      title: page.title,
      imageUrl: page.original?.source || page.thumbnail?.source || null,
      description: page.extract?.substring(0, 500) || ''
    };
  } catch (error) {
    if (error.response?.status === 403) {
      console.error(`403 Forbidden for ${title} - rate limit hit`);
    } else {
      console.error(`Error fetching page ${title}:`, error.message);
    }
    return null;
  }
};

/**
 * Check if database needs more items
 */
const checkAndFetchIfNeeded = async () => {
  const dbInstance = db.getDb();
  
  return new Promise((resolve) => {
    // Check current item count
    dbInstance.get(`
      SELECT COUNT(*) as count FROM items
    `, [], async (err, row) => {
      if (err) {
        console.error('Error checking item count:', err);
        return resolve();
      }
      
      const itemCount = row.count;
      
      // If we have enough items, don't fetch
      if (itemCount >= MIN_ITEMS_THRESHOLD) {
        return resolve();
      }
      
      // Check if we're already fetching or recently fetched
      const now = Date.now();
      if (isFetching || (now - lastFetchTime) < MIN_FETCH_INTERVAL) {
        return resolve();
      }
      
      // Start fetching in background (don't block)
      fetchMoreItems(itemCount).then(() => resolve()).catch(() => resolve());
    });
  });
};

/**
 * Fetch more items to add to database
 */
const fetchMoreItems = async (currentCount = 0) => {
  if (isFetching) return;
  
  isFetching = true;
  lastFetchTime = Date.now();
  
  console.log(`Database has ${currentCount} items. Fetching more from Wikipedia...`);
  
  try {
    // Get random article titles
    const titles = await getRandomArticles(BATCH_SIZE);
    
    if (titles.length === 0) {
      console.log('No random articles retrieved');
      isFetching = false;
      return;
    }
    
    console.log(`Retrieved ${titles.length} random article titles. Fetching details...`);
    
    const dbInstance = db.getDb();
    let inserted = 0;
    let skipped = 0;
    
    // Fetch details for each article with rate limiting
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      
      // Rate limiting: wait between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      }
      
      const pageInfo = await fetchPageInfo(title);
      
      if (!pageInfo) {
        skipped++;
        continue;
      }
      
      // Skip if pageid is missing (invalid page)
      if (!pageInfo.wikipediaId) {
        console.log(`Skipping ${pageInfo.title}: missing Wikipedia page ID`);
        skipped++;
        continue;
      }
      
      // Check if item already exists by title or wikipedia_id before inserting
      await new Promise((resolve) => {
        dbInstance.get(`
          SELECT id FROM items 
          WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?)
          LIMIT 1
        `, [pageInfo.title, pageInfo.wikipediaId], (err, existingItem) => {
          if (err) {
            console.error(`Error checking for duplicate ${pageInfo.title}:`, err);
            skipped++;
            return resolve();
          }
          
          if (existingItem) {
            skipped++;
            return resolve();
          }
          
          // Insert into database (ignore if constraint violated)
          dbInstance.run(`
            INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description)
            VALUES (?, ?, ?, ?)
          `, [pageInfo.wikipediaId, pageInfo.title, pageInfo.imageUrl, pageInfo.description], function(insertErr) {
            if (insertErr) {
              console.error(`Error inserting ${pageInfo.title}:`, insertErr);
              skipped++;
            } else if (this.changes > 0) {
              inserted++;
              console.log(`Added: ${pageInfo.title}`);
            } else {
              skipped++;
            }
            resolve();
          });
        });
      });
    }
    
    console.log(`Batch complete: Added ${inserted} new items, skipped ${skipped} existing/invalid items`);
    
    // Check if we need more
    dbInstance.get(`SELECT COUNT(*) as count FROM items`, [], async (err, row) => {
      if (!err && row.count < MIN_ITEMS_THRESHOLD) {
        // Still need more, but wait a bit before fetching again
        setTimeout(() => {
          isFetching = false;
          fetchMoreItems(row.count);
        }, 5000); // Wait 5 seconds before next batch
      } else {
        isFetching = false;
      }
    });
    
  } catch (error) {
    console.error('Error in fetchMoreItems:', error);
    isFetching = false;
  }
};

module.exports = {
  checkAndFetchIfNeeded,
  fetchMoreItems
};

