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

// Growth settings - continue adding items over time
const GROWTH_BATCH_SIZE = 5; // Add 5 items at a time for continuous growth
const GROWTH_INTERVAL = 30 * 60 * 1000; // Add items every 30 minutes (when above threshold)

// Track if we're currently fetching to avoid duplicate requests
let isFetching = false;
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 60000; // Only fetch once per minute max
let lastGrowthFetch = 0; // Track last growth fetch time

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
 * Uses the "mostviewed" list which returns articles with the most views in a time period
 * Tries multiple sources to get variety
 */
const getPopularArticles = async (count = 10) => {
  try {
    // Get most viewed articles from the past day
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        list: 'mostviewed',
        pvimlimit: Math.min(count * 2, 100), // Get more to account for duplicates
        pvimnamespace: 0, // Only main articles
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });

    let articles = response.data.query?.mostviewed || [];
    
    // If we don't have enough, supplement with featured articles
    if (articles.length < count) {
      console.log(`Only got ${articles.length} from mostviewed, supplementing with featured articles...`);
      const featured = await getFeaturedArticles(count - articles.length);
      articles = [...articles.map(a => a.title), ...featured];
    } else {
      // Shuffle to get variety and take requested count
      articles = articles.sort(() => Math.random() - 0.5).slice(0, count);
      articles = articles.map(article => article.title);
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching popular articles:', error.message);
    // Fallback to getting featured articles if mostviewed fails
    console.log('Falling back to featured articles...');
    return await getFeaturedArticles(count);
  }
};

/**
 * Get featured articles (high-quality, well-maintained Wikipedia pages)
 * These are typically well-known topics
 */
const getFeaturedArticles = async (count = 10) => {
  try {
    // Get articles from multiple popular categories for variety
    const categories = [
      'Category:Featured articles',
      'Category:Good articles',
      'Category:Biography',
      'Category:Countries',
      'Category:Cities'
    ];
    
    let allArticles = [];
    
    // Try to get from multiple categories
    for (const category of categories.slice(0, 3)) { // Try first 3 categories
      try {
        const response = await axios.get(WIKIPEDIA_API, {
          params: {
            action: 'query',
            format: 'json',
            list: 'categorymembers',
            cmtitle: category,
            cmnamespace: 0,
            cmlimit: Math.ceil(count / 2), // Get fewer from each category
            cmtype: 'page',
            redirects: 1
          },
          headers: {
            'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
          }
        });

        const members = response.data.query?.categorymembers || [];
        allArticles = [...allArticles, ...members.map(m => m.title)];
        
        // Wait between category requests
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Error fetching from ${category}:`, err.message);
      }
      
      // If we have enough, stop
      if (allArticles.length >= count) break;
    }
    
    // Shuffle and take count, remove duplicates
    const unique = [...new Set(allArticles)];
    const shuffled = unique.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (error) {
    console.error('Error fetching featured articles:', error.message);
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
 * Now includes continuous growth - adds items even when above threshold
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
      const now = Date.now();
      
      // Check if we're already fetching or recently fetched
      if (isFetching || (now - lastFetchTime) < MIN_FETCH_INTERVAL) {
        return resolve();
      }
      
      // If below threshold, fetch to reach minimum
      if (itemCount < MIN_ITEMS_THRESHOLD) {
        console.log(`Database has ${itemCount} items (below threshold of ${MIN_ITEMS_THRESHOLD}). Fetching more...`);
        fetchMoreItems(itemCount).then(() => resolve()).catch(() => resolve());
        return;
      }
      
      // If above threshold, continue growing slowly (every 30 minutes)
      // This ensures the database keeps growing as people use the tool
      if ((now - lastGrowthFetch) >= GROWTH_INTERVAL) {
        console.log(`Database has ${itemCount} items. Adding ${GROWTH_BATCH_SIZE} more items for continuous growth...`);
        lastGrowthFetch = now;
        fetchMoreItems(itemCount, true, GROWTH_BATCH_SIZE).then(() => resolve()).catch(() => resolve());
        return;
      }
      
      // Nothing to do right now
      resolve();
    });
  });
};

/**
 * Fetch more items to add to database
 * Mixes popular and random articles for variety
 */
const fetchMoreItems = async (currentCount = 0, usePopular = true, batchSize = BATCH_SIZE) => {
  if (isFetching) return;
  
  isFetching = true;
  lastFetchTime = Date.now();
  
  console.log(`Database has ${currentCount} items. Fetching ${batchSize} more from Wikipedia...`);
  
  try {
    let titles = [];
    
    // Alternate between popular and random articles for variety
    // Or use 50/50 mix if usePopular is true
    if (usePopular && currentCount % (batchSize * 2) < batchSize) {
      // Fetch popular articles
      console.log('Fetching popular Wikipedia articles...');
      titles = await getPopularArticles(Math.ceil(batchSize / 2));
      
      // Fill remaining with random if needed
      if (titles.length < batchSize) {
        const randomTitles = await getRandomArticles(batchSize - titles.length);
        titles = [...titles, ...randomTitles];
      }
    } else {
      // Fetch random articles
      console.log('Fetching random Wikipedia articles...');
      titles = await getRandomArticles(batchSize);
    }
    
    if (titles.length === 0) {
      console.log('No articles retrieved');
      isFetching = false;
      return;
    }
    
    console.log(`Retrieved ${titles.length} article titles. Fetching details...`);
    
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
    
    // Check if we need more (only if below threshold)
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

/**
 * Fetch only popular articles (for manual seeding)
 */
const fetchPopularItemsOnly = async (count = 10) => {
  if (isFetching) return;
  
  isFetching = true;
  lastFetchTime = Date.now();
  
  console.log(`Fetching ${count} popular Wikipedia articles...`);
  
  try {
    const titles = await getPopularArticles(count);
    
    if (titles.length === 0) {
      console.log('No popular articles retrieved');
      isFetching = false;
      return { inserted: 0, skipped: 0 };
    }
    
    console.log(`Retrieved ${titles.length} popular article titles. Fetching details...`);
    
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
    isFetching = false;
    
    return { inserted, skipped };
    
  } catch (error) {
    console.error('Error in fetchPopularItemsOnly:', error);
    isFetching = false;
    return { inserted: 0, skipped: 0 };
  }
};

module.exports = {
  checkAndFetchIfNeeded,
  fetchMoreItems,
  fetchPopularItemsOnly,
  getPopularArticles
};

