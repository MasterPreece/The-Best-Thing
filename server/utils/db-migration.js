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
};

module.exports = {
  runMigrations
};

