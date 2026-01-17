/**
 * Script to assign default category to items without categories
 * Assigns all items with NULL category_id to "Other" category
 * Usage: node server/scripts/assign-default-categories.js
 */

const db = require('../database');

async function assignDefaultCategories() {
  console.log('\n🏷️  Starting to assign default categories to items...\n');
  
  await db.init();
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  try {
    // First, get the "Other" category ID
    let otherCategoryId = null;
    
    if (dbType === 'postgres') {
      const result = await db.query(`SELECT id FROM categories WHERE slug = 'other' OR name = 'Other' LIMIT 1`);
      otherCategoryId = result.rows[0]?.id || null;
    } else {
      otherCategoryId = await new Promise((resolve) => {
        dbInstance.get(`SELECT id FROM categories WHERE slug = 'other' OR name = 'Other' LIMIT 1`, [], (err, row) => {
          if (err) {
            console.error('Error fetching Other category:', err);
            resolve(null);
          } else {
            resolve(row ? row.id : null);
          }
        });
      });
    }
    
    if (!otherCategoryId) {
      console.log('⚠️  "Other" category not found. Creating it...');
      
      if (dbType === 'postgres') {
        const result = await db.query(`
          INSERT INTO categories (name, slug, description)
          VALUES ('Other', 'other', 'Miscellaneous and uncategorized items')
          ON CONFLICT (name) DO NOTHING
          RETURNING id
        `);
        if (result.rows.length > 0) {
          otherCategoryId = result.rows[0].id;
          console.log('✅ Created "Other" category');
        } else {
          // Try to get it again
          const getResult = await db.query(`SELECT id FROM categories WHERE slug = 'other' OR name = 'Other' LIMIT 1`);
          otherCategoryId = getResult.rows[0]?.id || null;
        }
      } else {
        await new Promise((resolve, reject) => {
          dbInstance.run(`
            INSERT OR IGNORE INTO categories (name, slug, description)
            VALUES ('Other', 'other', 'Miscellaneous and uncategorized items')
          `, [], function(err) {
            if (err) {
              reject(err);
            } else {
              // Get the ID
              dbInstance.get(`SELECT id FROM categories WHERE slug = 'other' OR name = 'Other' LIMIT 1`, [], (getErr, row) => {
                if (getErr) reject(getErr);
                else {
                  otherCategoryId = row ? row.id : null;
                  if (otherCategoryId) {
                    console.log('✅ Created "Other" category');
                  }
                  resolve();
                }
              });
            }
          });
        });
      }
    }
    
    if (!otherCategoryId) {
      console.error('❌ Could not find or create "Other" category. Aborting.');
      return;
    }
    
    console.log(`✅ Using "Other" category (ID: ${otherCategoryId})\n`);
    
    // Count items without categories
    let uncategorizedCount = 0;
    if (dbType === 'postgres') {
      const countResult = await db.query(`SELECT COUNT(*) as count FROM items WHERE category_id IS NULL`);
      uncategorizedCount = parseInt(countResult.rows[0]?.count || 0);
    } else {
      uncategorizedCount = await new Promise((resolve) => {
        dbInstance.get(`SELECT COUNT(*) as count FROM items WHERE category_id IS NULL`, [], (err, row) => {
          if (err) {
            console.error('Error counting uncategorized items:', err);
            resolve(0);
          } else {
            resolve(row ? row.count : 0);
          }
        });
      });
    }
    
    console.log(`📊 Found ${uncategorizedCount} items without categories\n`);
    
    if (uncategorizedCount === 0) {
      console.log('✅ All items already have categories assigned!\n');
      return;
    }
    
    // Update all uncategorized items to "Other"
    if (dbType === 'postgres') {
      const updateResult = await db.query(`
        UPDATE items 
        SET category_id = $1 
        WHERE category_id IS NULL
      `, [otherCategoryId]);
      
      console.log(`✅ Assigned ${updateResult.rowCount} items to "Other" category\n`);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          UPDATE items 
          SET category_id = ? 
          WHERE category_id IS NULL
        `, [otherCategoryId], function(err) {
          if (err) {
            reject(err);
          } else {
            console.log(`✅ Assigned ${this.changes} items to "Other" category\n`);
            resolve();
          }
        });
      });
    }
    
    // Verify the update
    let remainingUncategorized = 0;
    if (dbType === 'postgres') {
      const verifyResult = await db.query(`SELECT COUNT(*) as count FROM items WHERE category_id IS NULL`);
      remainingUncategorized = parseInt(verifyResult.rows[0]?.count || 0);
    } else {
      remainingUncategorized = await new Promise((resolve) => {
        dbInstance.get(`SELECT COUNT(*) as count FROM items WHERE category_id IS NULL`, [], (err, row) => {
          resolve(err ? 0 : (row ? row.count : 0));
        });
      });
    }
    
    console.log(`📊 Remaining uncategorized items: ${remainingUncategorized}`);
    console.log('✅ Category assignment complete!\n');
    
  } catch (error) {
    console.error('❌ Error assigning categories:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  assignDefaultCategories().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }).then(() => {
    process.exit(0);
  });
}

module.exports = { assignDefaultCategories };

