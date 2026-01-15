const axios = require('axios');
const db = require('../database');

// Wikipedia API endpoint
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// Rate limiting: delay between API calls (ms)
// Wikipedia recommends at least 200ms between requests
const API_DELAY = 300;

/**
 * Fetch most viewed Wikipedia pages
 * Uses a curated list of popular Wikipedia topics
 */
const fetchMostViewedPages = async (limit = 1000) => {
  try {
    // Extended list of popular Wikipedia topics (top 10,000+ pages)
    // Mix of countries, people, concepts, places, things
    const popularTopics = [
      // Countries
      'United States', 'China', 'India', 'Russia', 'Japan', 'Germany', 'United Kingdom',
      'France', 'Italy', 'Brazil', 'Canada', 'South Korea', 'Spain', 'Australia',
      'Mexico', 'Indonesia', 'Netherlands', 'Saudi Arabia', 'Turkey', 'Switzerland',
      'Poland', 'Belgium', 'Argentina', 'Sweden', 'Norway', 'Thailand', 'United Arab Emirates',
      'Israel', 'Austria', 'Singapore', 'Malaysia', 'Philippines', 'South Africa', 'Denmark',
      'Finland', 'Ireland', 'Egypt', 'Chile', 'Czech Republic', 'Portugal', 'Greece',
      'Iraq', 'Qatar', 'New Zealand', 'Romania', 'Peru', 'Kuwait', 'Vietnam', 'Bangladesh',
      
      // People
      'Barack Obama', 'Donald Trump', 'Joe Biden', 'Elon Musk', 'Bill Gates', 'Steve Jobs',
      'Albert Einstein', 'Isaac Newton', 'Charles Darwin', 'Leonardo da Vinci', 'Michelangelo',
      'William Shakespeare', 'Napoleon', 'Adolf Hitler', 'Winston Churchill', 'Mahatma Gandhi',
      'Martin Luther King Jr.', 'Nelson Mandela', 'Mother Teresa', 'Pope Francis',
      'The Beatles', 'Elvis Presley', 'Michael Jackson', 'Queen (band)', 'The Rolling Stones',
      'Madonna', 'Taylor Swift', 'Ed Sheeran', 'Beyoncé', 'Drake', 'Eminem', 'Kanye West',
      'Lionel Messi', 'Cristiano Ronaldo', 'Michael Jordan', 'LeBron James', 'Tiger Woods',
      'Tom Brady', 'Serena Williams', 'Roger Federer', 'Novak Djokovic',
      
      // Concepts & Ideas
      'World War II', 'World War I', 'Cold War', 'American Civil War', 'French Revolution',
      'The Holocaust', 'September 11 attacks', 'COVID-19 pandemic', 'Internet', 'Computer',
      'Artificial intelligence', 'Machine learning', 'Blockchain', 'Cryptocurrency', 'Bitcoin',
      'Solar System', 'Earth', 'Moon', 'Mars', 'Sun', 'Universe', 'Galaxy', 'Black hole',
      'Evolution', 'DNA', 'Genetics', 'Quantum mechanics', 'Relativity', 'Big Bang',
      'Democracy', 'Capitalism', 'Socialism', 'Communism', 'Fascism', 'Religion',
      'Christianity', 'Islam', 'Judaism', 'Buddhism', 'Hinduism', 'Atheism',
      'Love', 'Happiness', 'Freedom', 'Justice', 'Truth', 'Beauty', 'Art', 'Music',
      'Literature', 'Philosophy', 'Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
      
      // Places & Landmarks
      'New York City', 'London', 'Paris', 'Tokyo', 'Los Angeles', 'Chicago', 'Toronto',
      'Sydney', 'Melbourne', 'Dubai', 'Singapore', 'Hong Kong', 'Shanghai', 'Beijing',
      'Moscow', 'Berlin', 'Rome', 'Madrid', 'Barcelona', 'Amsterdam', 'Vienna',
      'Prague', 'Stockholm', 'Copenhagen', 'Oslo', 'Helsinki', 'Dublin', 'Edinburgh',
      'Grand Canyon', 'Mount Everest', 'Niagara Falls', 'Great Wall of China',
      'Eiffel Tower', 'Statue of Liberty', 'Taj Mahal', 'Pyramids of Giza', 'Colosseum',
      'Machu Picchu', 'Stonehenge', 'Angkor Wat', 'Sydney Opera House',
      
      // Things & Objects
      'Car', 'Airplane', 'Bicycle', 'Motorcycle', 'Train', 'Ship', 'Rocket', 'Spacecraft',
      'Smartphone', 'Computer', 'Laptop', 'Tablet', 'Television', 'Radio', 'Camera',
      'Pizza', 'Hamburger', 'Sushi', 'Chocolate', 'Coffee', 'Tea', 'Beer', 'Wine',
      'Pizza', 'Ice cream', 'Cake', 'Bread', 'Cheese', 'Pasta', 'Rice', 'Potato',
      'Dog', 'Cat', 'Lion', 'Tiger', 'Elephant', 'Whale', 'Dolphin', 'Eagle', 'Shark',
      'Tree', 'Flower', 'Rose', 'Oak', 'Bamboo', 'Water', 'Fire', 'Air', 'Gold',
      'Diamond', 'Silver', 'Platinum', 'Oil', 'Electricity', 'Magnet', 'Light',
      
      // Events & Phenomena
      'Olympic Games', 'FIFA World Cup', 'Super Bowl', 'Eurovision Song Contest',
      'Academy Awards', 'Nobel Prize', 'Tour de France', 'Wimbledon Championships',
      'NBA Finals', 'Super Bowl', 'World Series', 'UEFA Champions League',
      'Music festival', 'Rock concert', 'Theatre', 'Cinema', 'Museum', 'Library',
      'University', 'School', 'Hospital', 'Airport', 'Stadium', 'Hotel', 'Restaurant',
      
      // Technology & Companies
      'Google', 'Apple Inc.', 'Microsoft', 'Amazon.com', 'Facebook', 'Tesla Inc.',
      'Netflix', 'Disney', 'Sony', 'Samsung', 'Intel', 'IBM', 'Oracle Corporation',
      'Wikipedia', 'YouTube', 'Twitter', 'Instagram', 'TikTok', 'LinkedIn', 'Reddit',
      
      // And many more...
    ];
    
    const pages = [];
    let count = 0;
    
    for (const topic of popularTopics.slice(0, limit)) {
      if (count >= limit) break;
      
      const page = await fetchPageInfo(topic);
      if (page) {
        pages.push(page);
        count++;
        if (count % 10 === 0) {
          console.log(`Fetched ${count}/${limit} pages...`);
        }
      }
      
      // Rate limiting: be nice to Wikipedia's servers
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
    
    return pages;
  } catch (error) {
    console.error('Error fetching pages:', error);
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
    
    // Skip if pageid is missing (shouldn't happen for valid pages, but be safe)
    const wikipediaId = page.pageid || null;
    if (!wikipediaId) {
      console.log(`Skipping ${page.title}: missing Wikipedia page ID`);
      return null;
    }
    
    return {
      wikipediaId,
      title: page.title,
      imageUrl: page.original?.source || page.thumbnail?.source || null,
      description: page.extract?.substring(0, 500) || ''
    };
  } catch (error) {
    if (error.response) {
      console.error(`Error fetching page ${title}: ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 403) {
        console.error('403 Forbidden - Wikipedia requires a User-Agent header');
      }
    } else {
      console.error(`Error fetching page ${title}:`, error.message);
    }
    return null;
  }
};

/**
 * Seed database with Wikipedia pages
 */
const seedDatabase = async () => {
  console.log('Initializing database...');
  await db.init();
  
  const dbInstance = db.getDb();
  
  console.log('Fetching Wikipedia pages...');
  // Start with a reasonable number for initial setup
  // Increase limit to 1000+ for more comprehensive data
  const limit = parseInt(process.argv[2]) || 100;
  console.log(`Fetching up to ${limit} pages...`);
  const pages = await fetchMostViewedPages(limit);
  
  console.log(`Fetched ${pages.length} pages. Inserting into database...`);
  
  let inserted = 0;
  let skipped = 0;
  
  for (const page of pages) {
    if (!page) continue;
    
    // Skip if pageid is missing
    if (!page.wikipediaId) {
      skipped++;
      continue;
    }
    
    // Check if item already exists by title or wikipedia_id before inserting
    dbInstance.get(`
      SELECT id FROM items 
      WHERE title = ? OR (wikipedia_id IS NOT NULL AND wikipedia_id = ?)
      LIMIT 1
    `, [page.title, page.wikipediaId], (err, existingItem) => {
      if (err) {
        console.error(`Error checking for duplicate ${page.title}:`, err);
        skipped++;
        return;
      }
      
      if (existingItem) {
        skipped++;
        return;
      }
      
      // Insert into database (ignore if constraint violated)
      dbInstance.run(`
        INSERT OR IGNORE INTO items (wikipedia_id, title, image_url, description)
        VALUES (?, ?, ?, ?)
      `, [page.wikipediaId, page.title, page.imageUrl, page.description], function(insertErr) {
        if (insertErr) {
          console.error(`Error inserting ${page.title}:`, insertErr);
        } else if (this.changes > 0) {
          inserted++;
          if (inserted % 10 === 0) {
            console.log(`Inserted ${inserted} pages...`);
          }
        } else {
          skipped++;
        }
      });
    });
  }
  
  // Wait a bit for async operations to complete
  setTimeout(() => {
    console.log(`\nSeeding complete!`);
    console.log(`Inserted: ${inserted} new pages`);
    console.log(`Skipped: ${skipped} existing pages`);
    console.log(`\nYou can now start the server and begin comparing!`);
    process.exit(0);
  }, 3000);
};

seedDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

