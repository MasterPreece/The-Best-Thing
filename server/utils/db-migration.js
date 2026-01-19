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

  // Migration: Add familiarity and rating confidence columns to items table
  if (dbType === 'postgres') {
    try {
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'items' AND column_name = 'familiarity_score'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding familiarity and rating columns to items table...');
        try {
          // Add all new columns
          await db.query(`
            ALTER TABLE items 
            ADD COLUMN familiarity_score DOUBLE PRECISION DEFAULT 0.0,
            ADD COLUMN rating_confidence DOUBLE PRECISION DEFAULT 0.0,
            ADD COLUMN last_compared_at TIMESTAMP,
            ADD COLUMN first_seen_at TIMESTAMP,
            ADD COLUMN skip_count INTEGER DEFAULT 0
          `);
          console.log('Successfully added familiarity columns');
        } catch (err) {
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding familiarity columns:', err);
            throw err;
          }
        }
        
        // Create indexes
        try {
          await db.query(`
            CREATE INDEX IF NOT EXISTS idx_items_familiarity ON items(familiarity_score DESC)
          `);
          await db.query(`
            CREATE INDEX IF NOT EXISTS idx_items_confidence ON items(rating_confidence ASC)
          `);
          console.log('Successfully created familiarity indexes');
        } catch (err) {
          console.error('Error creating familiarity indexes:', err);
        }

        // Initialize existing items: set first_seen_at = created_at, calculate initial familiarity
        try {
          await db.query(`
            UPDATE items 
            SET first_seen_at = created_at 
            WHERE first_seen_at IS NULL
          `);
          
          // Calculate initial familiarity_score based on comparison_count (normalized 0-100)
          // Get max comparison_count first
          const maxResult = await db.query(`
            SELECT COALESCE(MAX(comparison_count), 1) as max_count FROM items
          `);
          const maxCount = maxResult.rows[0]?.max_count || 1;
          
          // Initialize familiarity_score for existing items
          await db.query(`
            UPDATE items 
            SET familiarity_score = CASE 
              WHEN comparison_count > 0 THEN (comparison_count::DOUBLE PRECISION / $1) * 100.0
              ELSE 0.0
            END,
            rating_confidence = CASE
              WHEN comparison_count >= 30 THEN 1.0
              WHEN comparison_count > 0 THEN (comparison_count::DOUBLE PRECISION / 30.0)
              ELSE 0.0
            END
          `, [maxCount]);
          
          console.log('Successfully initialized familiarity scores for existing items');
        } catch (err) {
          console.error('Error initializing familiarity scores:', err);
        }
      }
    } catch (err) {
      console.error('Familiarity migration error:', err);
      // Don't throw - allow server to continue
    }

    // Migration: Add advanced item metrics columns
    try {
      const advancedMetricsCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'items' AND column_name = 'peak_rating'
      `);
      
      if (advancedMetricsCheck.rows.length === 0) {
        console.log('Adding advanced item metrics columns...');
        try {
          await db.query(`
            ALTER TABLE items 
            ADD COLUMN peak_rating DOUBLE PRECISION,
            ADD COLUMN peak_rating_date TIMESTAMP,
            ADD COLUMN rating_7days_ago DOUBLE PRECISION,
            ADD COLUMN rating_30days_ago DOUBLE PRECISION,
            ADD COLUMN first_vote_date TIMESTAMP,
            ADD COLUMN current_streak_wins INTEGER DEFAULT 0,
            ADD COLUMN current_streak_losses INTEGER DEFAULT 0,
            ADD COLUMN longest_win_streak INTEGER DEFAULT 0,
            ADD COLUMN rating_volatility DOUBLE PRECISION,
            ADD COLUMN view_count INTEGER DEFAULT 0,
            ADD COLUMN most_common_opponent_id INTEGER,
            ADD COLUMN upset_win_count INTEGER DEFAULT 0,
            ADD COLUMN win_rate_last_100 DOUBLE PRECISION,
            ADD COLUMN rating_change_last_7days DOUBLE PRECISION,
            ADD COLUMN consistency_score DOUBLE PRECISION,
            ADD COLUMN wikipedia_article_length INTEGER,
            ADD COLUMN wikipedia_last_updated TIMESTAMP
          `);
          console.log('Successfully added advanced item metrics columns');
          
          // Initialize peak_rating = elo_rating for existing items
          await db.query(`
            UPDATE items 
            SET peak_rating = elo_rating,
                peak_rating_date = created_at
            WHERE peak_rating IS NULL AND elo_rating IS NOT NULL
          `);
          
          // Initialize first_vote_date = created_at for items with votes
          await db.query(`
            UPDATE items 
            SET first_vote_date = created_at
            WHERE first_vote_date IS NULL AND comparison_count > 0
          `);
          
          console.log('Successfully initialized advanced item metrics');
        } catch (err) {
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding advanced item metrics columns:', err);
          }
        }
      }
    } catch (err) {
      console.error('Advanced metrics migration error:', err);
    }

    // Migration: Add user statistics columns
    try {
      const userStatsCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'upset_picks_count'
      `);
      
      if (userStatsCheck.rows.length === 0) {
        console.log('Adding user statistics columns...');
        try {
          await db.query(`
            ALTER TABLE users 
            ADD COLUMN upset_picks_count INTEGER DEFAULT 0,
            ADD COLUMN total_upsets_available INTEGER DEFAULT 0,
            ADD COLUMN average_rating_difference DOUBLE PRECISION,
            ADD COLUMN favorite_category_id INTEGER,
            ADD COLUMN consistency_score DOUBLE PRECISION,
            ADD COLUMN longest_correct_streak INTEGER DEFAULT 0
          `);
          console.log('Successfully added user statistics columns');
        } catch (err) {
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding user statistics columns:', err);
          }
        }
      }
    } catch (err) {
      console.error('User stats migration error:', err);
    }

    // Migration: Add comparison-level fields
    try {
      const comparisonCheck = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'comparisons' AND column_name = 'rating_difference'
      `);
      
      if (comparisonCheck.rows.length === 0) {
        console.log('Adding comparison-level fields...');
        try {
          await db.query(`
            ALTER TABLE comparisons 
            ADD COLUMN rating_difference DOUBLE PRECISION,
            ADD COLUMN was_upset BOOLEAN DEFAULT FALSE
          `);
          console.log('Successfully added comparison-level fields');
        } catch (err) {
          if (err.code !== '42701' && !err.message.includes('duplicate')) {
            console.error('Error adding comparison-level fields:', err);
          }
        }
      } else {
        // Column exists - check if it's the wrong type (INTEGER instead of DOUBLE PRECISION)
        const existingColumn = comparisonCheck.rows[0];
        if (existingColumn.data_type === 'integer' || existingColumn.data_type === 'smallint' || existingColumn.data_type === 'bigint') {
          console.log('Fixing rating_difference column type (INTEGER -> DOUBLE PRECISION)...');
          try {
            await db.query(`
              ALTER TABLE comparisons 
              ALTER COLUMN rating_difference TYPE DOUBLE PRECISION USING rating_difference::DOUBLE PRECISION
            `);
            console.log('Successfully updated rating_difference column type');
          } catch (err) {
            console.error('Error updating rating_difference column type:', err);
          }
        }
        
        // Check if was_upset exists
        const wasUpsetCheck = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'comparisons' AND column_name = 'was_upset'
        `);
        
        if (wasUpsetCheck.rows.length === 0) {
          try {
            await db.query(`
              ALTER TABLE comparisons 
              ADD COLUMN was_upset BOOLEAN DEFAULT FALSE
            `);
            console.log('Successfully added was_upset column');
          } catch (err) {
            if (err.code !== '42701' && !err.message.includes('duplicate')) {
              console.error('Error adding was_upset column:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Comparison fields migration error:', err);
    }
  } else {
    // SQLite: Check and add familiarity columns, then advanced metrics
    return new Promise((resolve) => {
      // SQLite helper function to check and add advanced metrics
      const checkAndAddAdvancedMetrics = (callback) => {
        dbInstance.all(`
          PRAGMA table_info(items)
        `, (err, columns) => {
          if (err) {
            console.error('Error checking items table info:', err);
            return callback();
          }
          
          const hasPeakRating = columns.some(col => col.name === 'peak_rating');
          
          if (!hasPeakRating) {
            console.log('Adding advanced item metrics columns...');
            
            // Add all columns sequentially
            const columnsToAdd = [
              { name: 'peak_rating', sql: 'ALTER TABLE items ADD COLUMN peak_rating REAL' },
              { name: 'peak_rating_date', sql: 'ALTER TABLE items ADD COLUMN peak_rating_date DATETIME' },
              { name: 'rating_7days_ago', sql: 'ALTER TABLE items ADD COLUMN rating_7days_ago REAL' },
              { name: 'rating_30days_ago', sql: 'ALTER TABLE items ADD COLUMN rating_30days_ago REAL' },
              { name: 'first_vote_date', sql: 'ALTER TABLE items ADD COLUMN first_vote_date DATETIME' },
              { name: 'current_streak_wins', sql: 'ALTER TABLE items ADD COLUMN current_streak_wins INTEGER DEFAULT 0' },
              { name: 'current_streak_losses', sql: 'ALTER TABLE items ADD COLUMN current_streak_losses INTEGER DEFAULT 0' },
              { name: 'longest_win_streak', sql: 'ALTER TABLE items ADD COLUMN longest_win_streak INTEGER DEFAULT 0' },
              { name: 'rating_volatility', sql: 'ALTER TABLE items ADD COLUMN rating_volatility REAL' },
              { name: 'view_count', sql: 'ALTER TABLE items ADD COLUMN view_count INTEGER DEFAULT 0' },
              { name: 'most_common_opponent_id', sql: 'ALTER TABLE items ADD COLUMN most_common_opponent_id INTEGER' },
              { name: 'upset_win_count', sql: 'ALTER TABLE items ADD COLUMN upset_win_count INTEGER DEFAULT 0' },
              { name: 'win_rate_last_100', sql: 'ALTER TABLE items ADD COLUMN win_rate_last_100 REAL' },
              { name: 'rating_change_last_7days', sql: 'ALTER TABLE items ADD COLUMN rating_change_last_7days REAL' },
              { name: 'consistency_score', sql: 'ALTER TABLE items ADD COLUMN consistency_score REAL' },
              { name: 'wikipedia_article_length', sql: 'ALTER TABLE items ADD COLUMN wikipedia_article_length INTEGER' },
              { name: 'wikipedia_last_updated', sql: 'ALTER TABLE items ADD COLUMN wikipedia_last_updated DATETIME' }
            ];
            
            let index = 0;
            const addNextColumn = () => {
              if (index >= columnsToAdd.length) {
                // Initialize values
                dbInstance.run(`
                  UPDATE items 
                  SET peak_rating = elo_rating,
                      peak_rating_date = created_at
                  WHERE peak_rating IS NULL AND elo_rating IS NOT NULL
                `, () => {
                  dbInstance.run(`
                    UPDATE items 
                    SET first_vote_date = created_at
                    WHERE first_vote_date IS NULL AND comparison_count > 0
                  `, () => {
                    console.log('Successfully added and initialized advanced item metrics');
                    checkAndAddUserStats(callback);
                  });
                });
                return;
              }
              
              const col = columnsToAdd[index];
              dbInstance.run(col.sql, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error(`Error adding ${col.name}:`, err);
                }
                index++;
                addNextColumn();
              });
            };
            
            addNextColumn();
          } else {
            checkAndAddUserStats(callback);
          }
        });
      };

      // SQLite helper function to check and add user stats
      const checkAndAddUserStats = (callback) => {
        dbInstance.all(`
          PRAGMA table_info(users)
        `, (err, columns) => {
          if (err) {
            console.error('Error checking users table info:', err);
            return callback();
          }
          
          const hasUpsetPicks = columns.some(col => col.name === 'upset_picks_count');
          
          if (!hasUpsetPicks) {
            console.log('Adding user statistics columns...');
            
            const userColumns = [
              { name: 'upset_picks_count', sql: 'ALTER TABLE users ADD COLUMN upset_picks_count INTEGER DEFAULT 0' },
              { name: 'total_upsets_available', sql: 'ALTER TABLE users ADD COLUMN total_upsets_available INTEGER DEFAULT 0' },
              { name: 'average_rating_difference', sql: 'ALTER TABLE users ADD COLUMN average_rating_difference REAL' },
              { name: 'favorite_category_id', sql: 'ALTER TABLE users ADD COLUMN favorite_category_id INTEGER' },
              { name: 'consistency_score', sql: 'ALTER TABLE users ADD COLUMN consistency_score REAL' },
              { name: 'longest_correct_streak', sql: 'ALTER TABLE users ADD COLUMN longest_correct_streak INTEGER DEFAULT 0' }
            ];
            
            let index = 0;
            const addNextUserColumn = () => {
              if (index >= userColumns.length) {
                console.log('Successfully added user statistics columns');
                checkAndAddComparisonFields(callback);
                return;
              }
              
              const col = userColumns[index];
              dbInstance.run(col.sql, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error(`Error adding ${col.name}:`, err);
                }
                index++;
                addNextUserColumn();
              });
            };
            
            addNextUserColumn();
          } else {
            checkAndAddComparisonFields(callback);
          }
        });
      };

      // SQLite helper function to check and add comparison fields
      const checkAndAddComparisonFields = (callback) => {
        dbInstance.all(`
          PRAGMA table_info(comparisons)
        `, (err, columns) => {
          if (err) {
            console.error('Error checking comparisons table info:', err);
            return callback();
          }
          
          const ratingDiffCol = columns.find(col => col.name === 'rating_difference');
          const hasRatingDiff = !!ratingDiffCol;
          
          if (!hasRatingDiff) {
            console.log('Adding comparison-level fields...');
            
            dbInstance.run(`
              ALTER TABLE comparisons ADD COLUMN rating_difference REAL
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding rating_difference:', err);
              }
              
              dbInstance.run(`
                ALTER TABLE comparisons ADD COLUMN was_upset INTEGER DEFAULT 0
              `, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error('Error adding was_upset:', err);
                }
                console.log('Successfully added comparison-level fields');
                callback();
              });
            });
          } else {
            // Column exists - check if it's the wrong type (INTEGER instead of REAL)
            // SQLite doesn't have strict types, but we can check the column type
            if (ratingDiffCol.type && ratingDiffCol.type.toLowerCase().includes('int')) {
              console.log('Fixing rating_difference column type (INTEGER -> REAL)...');
              // SQLite doesn't support ALTER COLUMN TYPE directly, so we need to recreate the table
              // For now, just log a warning - SQLite is more forgiving with type coercion
              console.log('Note: SQLite will coerce INTEGER to REAL automatically');
            }
            
            // Check if was_upset exists
            const hasWasUpset = columns.some(col => col.name === 'was_upset');
            if (!hasWasUpset) {
              dbInstance.run(`
                ALTER TABLE comparisons ADD COLUMN was_upset INTEGER DEFAULT 0
              `, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error('Error adding was_upset:', err);
                }
                callback();
              });
            } else {
              callback();
            }
          }
        });
      };

      dbInstance.serialize(() => {
        dbInstance.all(`
          PRAGMA table_info(items)
        `, (err, columns) => {
          if (err) {
            console.error('Error checking items table info:', err);
            return resolve();
          }
          
          const hasFamiliarityScore = columns.some(col => col.name === 'familiarity_score');
          
          if (!hasFamiliarityScore) {
            console.log('Adding familiarity and rating columns to items table...');
            dbInstance.run(`
              ALTER TABLE items ADD COLUMN familiarity_score REAL DEFAULT 0.0
            `, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding familiarity_score:', err);
              }
              
              dbInstance.run(`
                ALTER TABLE items ADD COLUMN rating_confidence REAL DEFAULT 0.0
              `, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error('Error adding rating_confidence:', err);
                }
                
                dbInstance.run(`
                  ALTER TABLE items ADD COLUMN last_compared_at DATETIME
                `, (err) => {
                  if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding last_compared_at:', err);
                  }
                  
                  dbInstance.run(`
                    ALTER TABLE items ADD COLUMN first_seen_at DATETIME
                  `, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                      console.error('Error adding first_seen_at:', err);
                    }
                    
                    dbInstance.run(`
                      ALTER TABLE items ADD COLUMN skip_count INTEGER DEFAULT 0
                    `, (err) => {
                      if (err && !err.message.includes('duplicate column')) {
                        console.error('Error adding skip_count:', err);
                      }
                      
                      // Create indexes
                      dbInstance.run(`
                        CREATE INDEX IF NOT EXISTS idx_items_familiarity ON items(familiarity_score DESC)
                      `, () => {
                        dbInstance.run(`
                          CREATE INDEX IF NOT EXISTS idx_items_confidence ON items(rating_confidence ASC)
                        `, () => {
                          console.log('Successfully added familiarity columns and indexes');
                          
                          // Initialize existing items: set first_seen_at = created_at, calculate initial familiarity
                          dbInstance.run(`
                            UPDATE items 
                            SET first_seen_at = created_at 
                            WHERE first_seen_at IS NULL
                          `, (err) => {
                            if (err) {
                              console.error('Error setting first_seen_at:', err);
                            }
                            
                            // Get max comparison_count
                            dbInstance.get(`
                              SELECT COALESCE(MAX(comparison_count), 1) as max_count FROM items
                            `, (err, row) => {
                              const maxCount = row?.max_count || 1;
                              
                              // Initialize familiarity_score and rating_confidence
                              dbInstance.run(`
                                UPDATE items 
                                SET familiarity_score = CASE 
                                  WHEN comparison_count > 0 THEN (CAST(comparison_count AS REAL) / ?) * 100.0
                                  ELSE 0.0
                                END,
                                rating_confidence = CASE
                                  WHEN comparison_count >= 30 THEN 1.0
                                  WHEN comparison_count > 0 THEN (CAST(comparison_count AS REAL) / 30.0)
                                  ELSE 0.0
                                END
                              `, [maxCount], (err) => {
                                if (err) {
                                  console.error('Error initializing familiarity scores:', err);
                                } else {
                                  console.log('Successfully initialized familiarity scores for existing items');
                                }
                                // After familiarity migration, add advanced metrics migration
                                checkAndAddAdvancedMetrics(() => {
                                  resolve();
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          } else {
            // Familiarity columns already exist, check for advanced metrics
            checkAndAddAdvancedMetrics(() => {
              resolve();
            });
          }
        });
      });
    });
  }
};

module.exports = {
  runMigrations
};

