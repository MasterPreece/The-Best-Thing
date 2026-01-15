const db = require('../database');

/**
 * Run database migrations to add new columns if they don't exist
 */
const runMigrations = () => {
  return new Promise((resolve, reject) => {
    const dbInstance = db.getDb();
    
    dbInstance.serialize(() => {
      // Check if user_id column exists in comparisons table
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
};

module.exports = {
  runMigrations
};

