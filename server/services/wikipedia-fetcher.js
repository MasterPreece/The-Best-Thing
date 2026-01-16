const axios = require('axios');
const db = require('../database');

// Wikipedia API endpoint
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// Unsplash API endpoint
const UNSPLASH_API = 'https://api.unsplash.com';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || null;

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
 * Note: Popular articles are more likely to have images
 */
const getPopularArticles = async (count = 10) => {
  try {
    // Get most viewed articles from the past day
    // These are more likely to have images since they're well-maintained
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
    
    // If we don't have enough, supplement with featured articles (which also tend to have images)
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
 * Get articles from a specific Wikipedia category
 * Fetches more articles than needed, then sorts by pageviews (most viewed first)
 * Returns top N most viewed articles
 */
const getArticlesFromCategory = async (categoryName, count = 50) => {
  try {
    let allArticles = [];
    let continueToken = null;
    const fullCategoryName = categoryName.startsWith('Category:') ? categoryName : `Category:${categoryName}`;
    
    // Fetch more articles than needed to get good pageview data
    // Fetch at least 3x the count to ensure we have enough popular articles
    const fetchTarget = Math.max(count * 3, 200); // At least 200 articles, or 3x the count
    
    console.log(`   Fetching up to ${fetchTarget} articles from ${fullCategoryName} to find top ${count} most viewed...`);
    
    // Fetch articles in batches (Wikipedia API limit is 500 per request)
    while (allArticles.length < fetchTarget) {
      const params = {
        action: 'query',
        format: 'json',
        list: 'categorymembers',
        cmtitle: fullCategoryName,
        cmnamespace: 0, // Only main articles
        cmlimit: Math.min(500, fetchTarget - allArticles.length),
        cmtype: 'page',
        redirects: 1
      };
      
      // Add continuation token if we have one
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
      const newArticles = members.map(m => m.title);
      allArticles = [...allArticles, ...newArticles];
      
      // Check if there are more results
      if (response.data.continue && response.data.continue.cmcontinue && allArticles.length < fetchTarget) {
        continueToken = response.data.continue.cmcontinue;
        // Be respectful with rate limiting
        await new Promise(resolve => setTimeout(resolve, API_DELAY));
      } else {
        break; // No more results or we have enough
      }
    }
    
    // Remove duplicates
    const uniqueArticles = [...new Set(allArticles)];
    
    if (uniqueArticles.length === 0) {
      return [];
    }
    
    // If we have fewer articles than requested, just return them all
    if (uniqueArticles.length <= count) {
      return uniqueArticles;
    }
    
    // Get pageviews for articles using Wikipedia's Pageviews REST API
    // This API provides view counts for articles
    console.log(`   Getting pageviews for ${uniqueArticles.length} articles to find most viewed...`);
    
    const articlesWithViews = await getArticlesWithPageviews(uniqueArticles);
    
    // Sort by pageviews (highest first) and take top N
    articlesWithViews.sort((a, b) => (b.views || 0) - (a.views || 0));
    
    const topArticles = articlesWithViews
      .slice(0, count)
      .map(item => item.title)
      .filter(title => title); // Remove any null/undefined
    
    console.log(`   Found top ${topArticles.length} most viewed articles (out of ${uniqueArticles.length})`);
    
    return topArticles;
  } catch (error) {
    console.error(`Error fetching articles from category ${categoryName}:`, error.message);
    // Fallback: return first N articles if pageview fetching fails
    return [];
  }
};

/**
 * Get pageview counts for a list of articles using Wikipedia's REST API
 * Uses the last 60 days of pageviews to determine popularity
 */
const getArticlesWithPageviews = async (articleTitles) => {
  const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';
  
  // Calculate date range (last 60 days for better data)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 60);
  
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  
  const articlesWithViews = [];
  
  // Process articles in smaller batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < articleTitles.length; i += batchSize) {
    const batch = articleTitles.slice(i, i + batchSize);
    
    // Fetch pageviews for each article in the batch
    for (const title of batch) {
      try {
        // Format title: replace spaces with underscores and URL encode
        const formattedTitle = title.replace(/ /g, '_');
        const encodedTitle = encodeURIComponent(formattedTitle);
        
        // Use daily granularity to get better data
        const url = `${PAGEVIEWS_API}/${encodedTitle}/daily/${start}/${end}`;
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
          },
          timeout: 10000 // 10 second timeout
        });
        
        // Sum up all pageviews for the period
        const items = response.data.items || [];
        const totalViews = items.reduce((sum, item) => sum + (item.views || 0), 0);
        
        articlesWithViews.push({ title, views: totalViews });
      } catch (error) {
        // If pageview API fails for an article, assign 0 views
        // (article might not exist, be too new, be deleted, or API might be rate-limited)
        articlesWithViews.push({ title, views: 0 });
      }
      
      // Rate limiting between requests
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
    
    // Extra delay between batches
    if (i + batchSize < articleTitles.length) {
      await new Promise(resolve => setTimeout(resolve, API_DELAY * 2));
    }
  }
  
  return articlesWithViews;
};

/**
 * Search Unsplash for an image by title
 * Falls back gracefully if API key is not set or if search fails
 */
const searchUnsplashImage = async (searchQuery) => {
  // If no API key is set, skip Unsplash (graceful degradation)
  if (!UNSPLASH_ACCESS_KEY) {
    return null;
  }

  try {
    // Clean up the search query - remove Wikipedia disambiguation text and extra info
    let cleanQuery = searchQuery
      .replace(/\(.*?\)/g, '') // Remove parentheses content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 50); // Limit length

    if (!cleanQuery || cleanQuery.length < 2) {
      return null;
    }

    const response = await axios.get(`${UNSPLASH_API}/search/photos`, {
      params: {
        query: cleanQuery,
        per_page: 1, // We only need one image
        orientation: 'landscape' // Prefer landscape images for better display
      },
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
      },
      timeout: 5000 // 5 second timeout
    });

    const results = response.data?.results || [];
    if (results.length > 0 && results[0]?.urls?.regular) {
      return results[0].urls.regular; // Use regular size (good quality, reasonable size)
    }

    return null;
  } catch (error) {
    // Silently fail - Unsplash is optional
    // Don't log errors unless it's a config issue
    if (error.response?.status === 401 || error.response?.status === 403) {
      // API key issue - only log once to avoid spam
      if (!searchUnsplashImage._loggedApiKeyWarning) {
        console.warn('⚠️  Unsplash API key is invalid or rate limit exceeded. Skipping Unsplash fallback.');
        searchUnsplashImage._loggedApiKeyWarning = true;
      }
    }
    return null;
  }
};

/**
 * Generate a placeholder image URL
 * Uses a simple placeholder service with the item title
 */
const getPlaceholderImage = (title) => {
  // Create a simple placeholder using a placeholder service
  // Using placeholder.com with text showing the title
  const encodedTitle = encodeURIComponent(title.substring(0, 30));
  return `https://via.placeholder.com/600x400/4a5568/ffffff?text=${encodedTitle}`;
};

/**
 * Fetch page information including image
 * Tries multiple methods to get an image:
 * 1. Wikipedia (original source)
 * 2. Unsplash (fallback search)
 * 3. Placeholder (final fallback)
 */
const fetchPageInfo = async (title) => {
  try {
    // First try: Get page with images using multiple image properties
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        prop: 'pageimages|extracts|pageprops|images',
        piprop: 'original|thumbnail',
        pithumbsize: 500, // Larger size for better quality
        exintro: true,
        explaintext: true,
        redirects: 1,
        imlimit: 5 // Get up to 5 images to find a good one
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
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
    
    // Try multiple sources for image (original, thumbnail, or first image from images list)
    let imageUrl = null;
    let imageSource = null;
    
    // Step 1: Try Wikipedia images first
    if (page.original?.source) {
      imageUrl = page.original.source;
      imageSource = 'wikipedia';
    } else if (page.thumbnail?.source) {
      imageUrl = page.thumbnail.source;
      imageSource = 'wikipedia';
    }
    
    // Step 2: If no Wikipedia image, try Unsplash
    if (!imageUrl) {
      const unsplashImage = await searchUnsplashImage(page.title);
      if (unsplashImage) {
        imageUrl = unsplashImage;
        imageSource = 'unsplash';
      }
    }
    
    // Step 3: If still no image, use placeholder
    if (!imageUrl) {
      imageUrl = getPlaceholderImage(page.title);
      imageSource = 'placeholder';
    }
    
    return {
      wikipediaId,
      title: page.title,
      imageUrl,
      description: page.extract?.substring(0, 500) || '',
      hasImage: !!imageUrl,
      imageSource // Track where the image came from for debugging
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
    // Collect all page info first, then prioritize those with images
    const pageInfos = [];
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
      
      pageInfos.push(pageInfo);
    }
    
    // Prioritize items with images when inserting
    // Sort: items with images first, then items without
    pageInfos.sort((a, b) => {
      if (a.hasImage && !b.hasImage) return -1;
      if (!a.hasImage && b.hasImage) return 1;
      return 0;
    });
    
    // Process sorted items (those with images will be inserted first)
    for (const pageInfo of pageInfos) {
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
              const imageStatus = pageInfo.hasImage ? '📷' : '❌';
              console.log(`${imageStatus} Added: ${pageInfo.title}${pageInfo.hasImage ? '' : ' (no image)'}`);
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
  getPopularArticles,
  getArticlesFromCategory,
  fetchPageInfo,
  getRandomArticles
};

