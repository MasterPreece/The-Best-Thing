/**
 * Script to intelligently assign categories to items based on Wikipedia categories
 * Fetches categories from Wikipedia API and maps them to our category system
 * Usage: node server/scripts/assign-intelligent-categories.js [limit]
 */

const db = require('../database');
const axios = require('axios');
const slugify = require('slugify');

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const API_DELAY = 300; // Rate limiting

/**
 * Map Wikipedia category keywords to our categories
 * This mapping tries to match common Wikipedia category patterns to our category names
 */
const CATEGORY_MAPPING = {
  // Food & Drinks
  'food': 'Food & Drinks',
  'beverage': 'Food & Drinks',
  'drink': 'Food & Drinks',
  'cuisine': 'Food & Drinks',
  'recipe': 'Food & Drinks',
  'restaurant': 'Food & Drinks',
  'candy': 'Food & Drinks',
  'chocolate': 'Food & Drinks',
  'soda': 'Food & Drinks',
  'coffee': 'Food & Drinks',
  'tea': 'Food & Drinks',
  'wine': 'Food & Drinks',
  'beer': 'Food & Drinks',
  
  // Movies & TV
  'film': 'Movies & TV',
  'movie': 'Movies & TV',
  'television': 'Movies & TV',
  'tv series': 'Movies & TV',
  'tv show': 'Movies & TV',
  'actor': 'Movies & TV',
  'actress': 'Movies & TV',
  'director': 'Movies & TV',
  'cinema': 'Movies & TV',
  'animated': 'Movies & TV',
  'documentary': 'Movies & TV',
  'comedy film': 'Movies & TV',
  'drama film': 'Movies & TV',
  
  // Music
  'music': 'Music',
  'album': 'Music',
  'song': 'Music',
  'singer': 'Music',
  'musician': 'Music',
  'band': 'Music',
  'composer': 'Music',
  'pianist': 'Music',
  'guitarist': 'Music',
  'record label': 'Music',
  'music genre': 'Music',
  'pop music': 'Music',
  'rock music': 'Music',
  'jazz': 'Music',
  'classical': 'Music',
  
  // Video Games
  'video game': 'Video Games',
  'gaming': 'Video Games',
  'game developer': 'Video Games',
  'game series': 'Video Games',
  'nintendo': 'Video Games',
  'playstation': 'Video Games',
  'xbox': 'Video Games',
  
  // Sports
  'sport': 'Sports',
  'football': 'Sports',
  'basketball': 'Sports',
  'baseball': 'Sports',
  'soccer': 'Sports',
  'tennis': 'Sports',
  'olympics': 'Sports',
  'athlete': 'Sports',
  'player': 'Sports',
  'coach': 'Sports',
  'team': 'Sports',
  'league': 'Sports',
  
  // Technology
  'technology': 'Technology',
  'software': 'Technology',
  'computer': 'Technology',
  'internet': 'Technology',
  'programming': 'Technology',
  'apple': 'Technology',
  'microsoft': 'Technology',
  'google': 'Technology',
  'ai': 'Technology',
  'artificial intelligence': 'Technology',
  'gadget': 'Technology',
  'smartphone': 'Technology',
  'app': 'Technology',
  
  // Places
  'city': 'Places',
  'country': 'Places',
  'state': 'Places',
  'province': 'Places',
  'region': 'Places',
  'continent': 'Places',
  'island': 'Places',
  'mountain': 'Places',
  'river': 'Places',
  'landmark': 'Places',
  'capital': 'Places',
  'town': 'Places',
  'village': 'Places',
  'geography': 'Places',
  
  // People
  'person': 'People',
  'biography': 'People',
  'politician': 'People',
  'president': 'People',
  'author': 'People',
  'writer': 'People',
  'scientist': 'People',
  'inventor': 'People',
  'philosopher': 'People',
  'artist': 'People',
  'painter': 'People',
  'sculptor': 'People',
  'poet': 'People',
  
  // Brands
  'brand': 'Brands',
  'company': 'Brands',
  'corporation': 'Brands',
  'business': 'Brands',
  'automobile': 'Brands',
  'car': 'Brands',
  'vehicle': 'Brands',
  
  // Animals
  'animal': 'Animals',
  'mammal': 'Animals',
  'bird': 'Animals',
  'dog': 'Animals',
  'cat': 'Animals',
  'fish': 'Animals',
  'reptile': 'Animals',
  'insect': 'Animals',
  'species': 'Animals',
  'wildlife': 'Animals',
  
  // Vehicles
  'vehicle': 'Vehicles',
  'automobile': 'Vehicles',
  'car': 'Vehicles',
  'truck': 'Vehicles',
  'motorcycle': 'Vehicles',
  'aircraft': 'Vehicles',
  'airplane': 'Vehicles',
  'ship': 'Vehicles',
  'boat': 'Vehicles',
  'train': 'Vehicles',
  'transportation': 'Vehicles',
  
  // Science
  'science': 'Science',
  'physics': 'Science',
  'chemistry': 'Science',
  'biology': 'Science',
  'mathematics': 'Science',
  'medicine': 'Science',
  'discovery': 'Science',
  'theory': 'Science',
  'research': 'Science',
  'experiment': 'Science',
  
  // History
  'history': 'History',
  'historical': 'History',
  'war': 'History',
  'battle': 'History',
  'ancient': 'History',
  'medieval': 'History',
  'empire': 'History',
  'civilization': 'History',
  'archaeology': 'History',
  
  // Art & Culture
  'art': 'Art & Culture',
  'culture': 'Art & Culture',
  'literature': 'Art & Culture',
  'novel': 'Art & Culture',
  'theatre': 'Art & Culture',
  'theater': 'Art & Culture',
  'dance': 'Art & Culture',
  'sculpture': 'Art & Culture',
  'painting': 'Art & Culture',
  'museum': 'Art & Culture',
  'philosophy': 'Art & Culture',
};

/**
 * Fetch categories for a Wikipedia article
 */
async function fetchWikipediaCategories(title) {
  try {
    const response = await axios.get(WIKIPEDIA_API, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        prop: 'categories',
        cllimit: 50, // Get up to 50 categories
        clshow: '!hidden', // Exclude hidden categories
        redirects: 1
      },
      headers: {
        'User-Agent': 'TheBestThing/1.0 (https://github.com/MasterPreece/The-Best-Thing; contact@example.com)'
      }
    });

    const pages = response.data.query?.pages;
    if (!pages) return [];

    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    
    if (page.missing || !page.categories) return [];

    // Extract category names (remove "Category:" prefix)
    const categories = page.categories.map(cat => {
      const name = cat.title.replace(/^Category:/, '').toLowerCase();
      return name;
    });

    return categories;
  } catch (error) {
    console.error(`Error fetching categories for ${title}:`, error.message);
    return [];
  }
}

/**
 * Match Wikipedia categories to our category system
 * Returns the best matching category name or null
 */
function matchCategory(wikipediaCategories) {
  if (!wikipediaCategories || wikipediaCategories.length === 0) {
    return null;
  }

  // Score each of our categories based on keyword matches
  const categoryScores = {};
  
  for (const wikiCategory of wikipediaCategories) {
    const lowerWikiCat = wikiCategory.toLowerCase();
    
    // Check each mapping
    for (const [keyword, ourCategory] of Object.entries(CATEGORY_MAPPING)) {
      if (lowerWikiCat.includes(keyword.toLowerCase())) {
        categoryScores[ourCategory] = (categoryScores[ourCategory] || 0) + 1;
      }
    }
  }

  // Return the category with the highest score
  if (Object.keys(categoryScores).length === 0) {
    return null;
  }

  const bestMatch = Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])[0];

  return bestMatch[0]; // Return category name
}

/**
 * Get category ID by name
 */
async function getCategoryIdByName(name, dbType, dbInstance) {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [name]);
    return result.rows[0]?.id || null;
  } else {
    return new Promise((resolve) => {
      dbInstance.get('SELECT id FROM categories WHERE name = ? LIMIT 1', [name], (err, row) => {
        if (err) {
          console.error('Error getting category:', err);
          resolve(null);
        } else {
          resolve(row ? row.id : null);
        }
      });
    });
  }
}

/**
 * Main function to assign categories intelligently
 */
async function assignIntelligentCategories(limit = null) {
  console.log('\n🧠 Starting intelligent category assignment...\n');
  console.log(`Limit: ${limit || 'All uncategorized items'}\n`);

  await db.init();
  const dbType = db.getDbType();
  const dbInstance = db.getDb();

  try {
    // Get uncategorized items
    let items = [];
    if (dbType === 'postgres') {
      const query = limit 
        ? `SELECT id, title, wikipedia_id FROM items WHERE category_id IS NULL LIMIT $1`
        : `SELECT id, title, wikipedia_id FROM items WHERE category_id IS NULL`;
      
      const result = await db.query(query, limit ? [limit] : []);
      items = result.rows || [];
    } else {
      items = await new Promise((resolve, reject) => {
        const query = limit 
          ? `SELECT id, title, wikipedia_id FROM items WHERE category_id IS NULL LIMIT ?`
          : `SELECT id, title, wikipedia_id FROM items WHERE category_id IS NULL`;
        
        dbInstance.all(query, limit ? [limit] : [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }

    console.log(`📊 Found ${items.length} uncategorized items to process\n`);

    if (items.length === 0) {
      console.log('✅ All items already have categories!\n');
      return { assigned: 0, failed: 0, skipped: 0 };
    }

    let assigned = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`[${i + 1}/${items.length}] Processing: ${item.title}`);

      try {
        // Fetch Wikipedia categories
        const wikipediaCategories = await fetchWikipediaCategories(item.title);
        
        if (wikipediaCategories.length === 0) {
          console.log(`   ⏭️  No categories found, skipping`);
          skipped++;
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
          continue;
        }

        // Match to our category
        const matchedCategory = matchCategory(wikipediaCategories);

        if (!matchedCategory) {
          console.log(`   ⏭️  Could not match categories: ${wikipediaCategories.slice(0, 3).join(', ')}`);
          skipped++;
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
          continue;
        }

        // Get category ID
        const categoryId = await getCategoryIdByName(matchedCategory, dbType, dbInstance);

        if (!categoryId) {
          console.log(`   ⚠️  Category "${matchedCategory}" not found in database, skipping`);
          skipped++;
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
          continue;
        }

        // Update item
        if (dbType === 'postgres') {
          await db.query('UPDATE items SET category_id = $1 WHERE id = $2', [categoryId, item.id]);
        } else {
          await new Promise((resolve, reject) => {
            dbInstance.run('UPDATE items SET category_id = ? WHERE id = ?', [categoryId, item.id], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }

        console.log(`   ✅ Assigned to "${matchedCategory}" (matched from: ${wikipediaCategories.slice(0, 3).join(', ')})`);
        assigned++;

      } catch (error) {
        console.error(`   ❌ Error processing ${item.title}:`, error.message);
        failed++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }

    console.log(`\n✅ Category assignment complete!`);
    console.log(`   ✅ Assigned: ${assigned} items`);
    console.log(`   ⏭️  Skipped: ${skipped} items (no match or no categories)`);
    console.log(`   ❌ Failed: ${failed} items\n`);

    return { assigned, skipped, failed };
  } catch (error) {
    console.error('❌ Error assigning categories:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : null;
  
  assignIntelligentCategories(limit).catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }).then(() => {
    process.exit(0);
  });
}

module.exports = { assignIntelligentCategories };

