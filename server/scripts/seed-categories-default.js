const db = require('../database');

/**
 * Seed default categories
 */
const seedDefaultCategories = async () => {
  const dbType = db.getDbType();
  
  const defaultCategories = [
    { name: 'Food & Drinks', slug: 'food-drinks', description: 'Food, beverages, and culinary items' },
    { name: 'Movies & TV', slug: 'movies-tv', description: 'Films, television shows, and entertainment' },
    { name: 'Music', slug: 'music', description: 'Artists, songs, albums, and musical genres' },
    { name: 'Video Games', slug: 'video-games', description: 'Games, consoles, and gaming culture' },
    { name: 'Sports', slug: 'sports', description: 'Athletes, teams, sports, and competitions' },
    { name: 'Technology', slug: 'technology', description: 'Gadgets, software, and tech innovations' },
    { name: 'Places', slug: 'places', description: 'Cities, countries, landmarks, and locations' },
    { name: 'People', slug: 'people', description: 'Celebrities, historical figures, and personalities' },
    { name: 'Brands', slug: 'brands', description: 'Companies, products, and commercial brands' },
    { name: 'Animals', slug: 'animals', description: 'Wildlife, pets, and creatures' },
    { name: 'Vehicles', slug: 'vehicles', description: 'Cars, planes, boats, and transportation' },
    { name: 'Science', slug: 'science', description: 'Scientific concepts, discoveries, and phenomena' },
    { name: 'History', slug: 'history', description: 'Historical events, periods, and artifacts' },
    { name: 'Art & Culture', slug: 'art-culture', description: 'Art, literature, and cultural works' },
    { name: 'Other', slug: 'other', description: 'Miscellaneous items that don\'t fit other categories' }
  ];
  
  let inserted = 0;
  let skipped = 0;
  
  for (const category of defaultCategories) {
    try {
      if (dbType === 'postgres') {
        const result = await db.query(`
          INSERT INTO categories (name, slug, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (slug) DO NOTHING
          RETURNING id
        `, [category.name, category.slug, category.description]);
        
        if (result.rowCount > 0) {
          inserted++;
          console.log(`✓ Added category: ${category.name}`);
        } else {
          skipped++;
        }
      } else {
        const dbInstance = db.getDb();
        await new Promise((resolve, reject) => {
          dbInstance.run(`
            INSERT OR IGNORE INTO categories (name, slug, description)
            VALUES (?, ?, ?)
          `, [category.name, category.slug, category.description], function(err) {
            if (err) reject(err);
            else {
              if (this.changes > 0) {
                inserted++;
                console.log(`✓ Added category: ${category.name}`);
              } else {
                skipped++;
              }
              resolve();
            }
          });
        });
      }
    } catch (err) {
      if (err.code === '23505' || err.message.includes('UNIQUE')) {
        skipped++;
      } else {
        console.error(`Error adding category ${category.name}:`, err);
      }
    }
  }
  
  console.log(`\nCategory seeding complete: ${inserted} added, ${skipped} skipped (already exist)`);
};

// Run if called directly
if (require.main === module) {
  db.init().then(() => {
    return seedDefaultCategories();
  }).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Error seeding categories:', err);
    process.exit(1);
  });
}

module.exports = seedDefaultCategories;

