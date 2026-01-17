const db = require('../database');

/**
 * Run database migrations to add new columns if they don't exist
 */
const runMigrations = async () => {
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  if (dbType === 'postgres') {
    // PostgreSQL: Check if user_id column exists
    try {
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'comparisons' AND column_name = 'user_id'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding user_id column to comparisons table...');
        try {
          await db.query(`
            ALTER TABLE comparisons ADD COLUMN user_id INTEGER REFERENCES users(id)
          `);
          console.log('Successfully added user_id column');
        } catch (err) {
          // PostgreSQL error code 42701 is "duplicate_column"
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding user_id column:', err);
            throw err;
          }
        }
        
        // Create index
        try {
          await db.query(`
            CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id)
          `);
        } catch (err) {
          console.error('Error creating index:', err);
        }
      }
    } catch (err) {
      console.error('Migration error:', err);
      throw err;
    }
  } else {
    // SQLite: Use PRAGMA to check columns
    return new Promise((resolve, reject) => {
      dbInstance.serialize(() => {
        // First check if the table exists
        dbInstance.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='comparisons'
        `, (err, table) => {
          if (err) {
            console.error('Error checking if comparisons table exists:', err);
            return reject(err);
          }
          
          // If table doesn't exist, it will be created with the column by createTables()
          // So we don't need to add the column
          if (!table) {
            console.log('Comparisons table does not exist yet. Column will be added during table creation.');
            return resolve();
          }
          
          // Table exists, check if column exists
          dbInstance.all(`
            PRAGMA table_info(comparisons)
          `, (err, columns) => {
            if (err) {
              console.error('Error checking table info:', err);
              return reject(err);
            }
            
            const hasUserId = columns.some(col => col.name === 'user_id');
            
            if (!hasUserId) {
              console.log('Adding user_id column to comparisons table...');
              dbInstance.run(`
                ALTER TABLE comparisons ADD COLUMN user_id INTEGER REFERENCES users(id)
              `, (err) => {
                if (err) {
                  console.error('Error adding user_id column:', err);
                  // Don't fail if column already exists
                  if (!err.message.includes('duplicate column')) {
                    return reject(err);
                  }
                } else {
                  console.log('Successfully added user_id column');
                }
                
                // Create index for user_id if it doesn't exist
                dbInstance.run(`
                  CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id)
                `, (err) => {
                  if (err) {
                    console.error('Error creating index:', err);
                  }
                  resolve();
                });
              });
            } else {
              resolve();
            }
          });
        });
      });
    });
  }
  
  // Migration: Add categories table and category_id column to items
  if (dbType === 'postgres') {
    try {
      // Check if categories table exists, if not create it
      const categoriesCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'categories'
      `);
      
      if (categoriesCheck.rows.length === 0) {
        console.log('Creating categories table...');
        await db.query(`
          CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            slug VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('Categories table created');
      }
      
      // Check if category_id column exists in items
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'items' AND column_name = 'category_id'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding category_id column to items table...');
        try {
          await db.query(`
            ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES categories(id)
          `);
          console.log('Successfully added category_id column');
        } catch (err) {
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding category_id column:', err);
            // Don't throw - allow server to continue
          }
        }
        
        // Create index after column is added
        try {
          await db.query(`
            CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)
          `);
          console.log('Successfully created category index');
        } catch (err) {
          // If index creation fails, log but don't fail - column might not exist yet
          if (!err.message.includes('does not exist')) {
            console.error('Error creating category index:', err);
          }
        }
      }
    } catch (err) {
      console.error('Category migration error:', err);
      // Don't throw - allow server to continue
    }
  } else {
    // SQLite: Check and add category_id column
    return new Promise((resolve) => {
      dbInstance.serialize(() => {
        // Check if categories table exists
        dbInstance.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='categories'
        `, (err, table) => {
          if (!table && !err) {
            console.log('Creating categories table...');
            dbInstance.run(`CREATE TABLE IF NOT EXISTS categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              slug TEXT NOT NULL UNIQUE,
              description TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, () => {
              console.log('Categories table created');
              checkCategoryColumn();
            });
          } else {
            checkCategoryColumn();
          }
        });
        
        function checkCategoryColumn() {
          dbInstance.all(`
            PRAGMA table_info(items)
          `, (err, columns) => {
            if (err) {
              console.error('Error checking items table info:', err);
              return resolve();
            }
            
            const hasCategoryId = columns.some(col => col.name === 'category_id');
            
            if (!hasCategoryId) {
              console.log('Adding category_id column to items table...');
              dbInstance.run(`
                ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES categories(id)
              `, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error('Error adding category_id column:', err);
                } else {
                  console.log('Successfully added category_id column');
                }
                
                // Create index
                dbInstance.run(`
                  CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)
                `, () => {
                  resolve();
                });
              });
            } else {
              resolve();
            }
          });
        }
      });
    });
  }
  
  // Migration: Add photo_submissions table
  if (dbType === 'postgres') {
    try {
      // Check if photo_submissions table exists
      const tableCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'photo_submissions'
      `);
      
      if (tableCheck.rows.length === 0) {
        console.log('Creating photo_submissions table...');
        await db.query(`
          CREATE TABLE IF NOT EXISTS photo_submissions (
            id SERIAL PRIMARY KEY,
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            user_session_id VARCHAR(255),
            image_url TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
          )
        `);
        
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_photo_submissions_item_id ON photo_submissions(item_id)
        `);
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_photo_submissions_status ON photo_submissions(status)
        `);
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_photo_submissions_submitted_at ON photo_submissions(submitted_at DESC)
        `);
        
        console.log('Photo submissions table created');
      }
    } catch (err) {
      console.error('Photo submissions migration error:', err);
      // Don't throw - allow server to continue
    }
  } else {
    // SQLite: Check and create photo_submissions table
    return new Promise((resolve) => {
      dbInstance.serialize(() => {
        dbInstance.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='photo_submissions'
        `, (err, table) => {
          if (!table && !err) {
            console.log('Creating photo_submissions table...');
            dbInstance.run(`CREATE TABLE IF NOT EXISTS photo_submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              user_session_id TEXT,
              image_url TEXT NOT NULL,
              status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
              submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              reviewed_at DATETIME,
              reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
            )`, () => {
              dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_photo_submissions_item_id ON photo_submissions(item_id)`, () => {
                dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_photo_submissions_status ON photo_submissions(status)`, () => {
                  dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_photo_submissions_submitted_at ON photo_submissions(submitted_at DESC)`, () => {
                    console.log('Photo submissions table created');
                    resolve();
                  });
                });
              });
            });
          } else {
            resolve();
          }
        });
      });
    });
  }

  // Migration: Add item_submissions table
  if (dbType === 'postgres') {
    try {
      // Check if item_submissions table exists
      const tableCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'item_submissions'
      `);
      
      if (tableCheck.rows.length === 0) {
        console.log('Creating item_submissions table...');
        await db.query(`
          CREATE TABLE IF NOT EXISTS item_submissions (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url TEXT,
            wikipedia_url TEXT,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            user_session_id VARCHAR(255),
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            rejection_reason TEXT
          )
        `);
        
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_item_submissions_status ON item_submissions(status)
        `);
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_item_submissions_submitted_at ON item_submissions(submitted_at DESC)
        `);
        
        console.log('Item submissions table created');
      }
    } catch (err) {
      console.error('Item submissions migration error:', err);
      // Don't throw - allow server to continue
    }
  } else {
    // SQLite: Check and create item_submissions table
    await new Promise((resolve) => {
      dbInstance.serialize(() => {
        dbInstance.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='item_submissions'
        `, (err, table) => {
          if (!table && !err) {
            console.log('Creating item_submissions table...');
            dbInstance.run(`CREATE TABLE IF NOT EXISTS item_submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              description TEXT,
              image_url TEXT,
              wikipedia_url TEXT,
              category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
              user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
              user_session_id TEXT,
              status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
              submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              reviewed_at DATETIME,
              reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
              rejection_reason TEXT
            )`, () => {
              dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_item_submissions_status ON item_submissions(status)`, () => {
                dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_item_submissions_submitted_at ON item_submissions(submitted_at DESC)`, () => {
                  console.log('Item submissions table created');
                  resolve();
                });
              });
            });
          } else {
            resolve();
          }
        });
      });
    });
  }
};

module.exports = {
  runMigrations
};

