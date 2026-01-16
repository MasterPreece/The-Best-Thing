const path = require('path');
const fs = require('fs');

// Detect database type from environment
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const USE_POSTGRES = !!DATABASE_URL;

let db = null;
let dbType = null;

// SQLite setup (for development)
let sqlite3 = null;
let DB_PATH = null;

if (!USE_POSTGRES) {
  sqlite3 = require('sqlite3').verbose();
  
  // Use persistent storage path on Railway, or local path for development
  const PERSISTENT_STORAGE_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || '/data';
  const LOCAL_DB_PATH = path.join(__dirname, 'database.sqlite');
  
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    DB_PATH = path.join(PERSISTENT_STORAGE_PATH, 'database.sqlite');
    
    // Ensure persistent storage directory exists
    try {
      if (!fs.existsSync(PERSISTENT_STORAGE_PATH)) {
        fs.mkdirSync(PERSISTENT_STORAGE_PATH, { recursive: true });
        console.log(`Created persistent storage directory: ${PERSISTENT_STORAGE_PATH}`);
      }
    } catch (err) {
      console.error(`ERROR: Could not create persistent storage directory: ${err.message}`);
      DB_PATH = LOCAL_DB_PATH;
      console.warn(`Falling back to local database path: ${LOCAL_DB_PATH}`);
    }
  } else {
    DB_PATH = LOCAL_DB_PATH;
  }
}

const init = async () => {
  if (USE_POSTGRES) {
    // PostgreSQL initialization
    const { Pool } = require('pg');
    dbType = 'postgres';
    
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Test connection
    try {
      await pool.query('SELECT NOW()');
      console.log('Connected to PostgreSQL database');
      db = pool;
    } catch (err) {
      console.error('PostgreSQL connection error:', err);
      throw err;
    }
    
    // Create tables for PostgreSQL
    await createTables();
  } else {
    // SQLite initialization
    dbType = 'sqlite';
    
    // Connect to database first
    await new Promise((resolve, reject) => {
      db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`Connected to SQLite database at ${DB_PATH}`);
        resolve();
      });
    });
    
    // Create tables for SQLite (must wait for this to complete)
    await createTables();
  }
};

const createTables = async () => {
  if (USE_POSTGRES) {
    // PostgreSQL table creation
    const client = await db.connect();
    try {
      // Categories table - must be created before items
      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          slug VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Items table
      await client.query(`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          wikipedia_id INTEGER UNIQUE,
          title VARCHAR(500) NOT NULL UNIQUE,
          image_url TEXT,
          description TEXT,
          category_id INTEGER REFERENCES categories(id),
          elo_rating DOUBLE PRECISION DEFAULT 1500,
          comparison_count INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_items_title ON items(title)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)
      `);
      
      // Users table - must be created before comparisons (which references it)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          comparisons_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // User sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          session_id VARCHAR(255) PRIMARY KEY,
          comparisons_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Comparisons table - must be created after items and users (references both)
      await client.query(`
        CREATE TABLE IF NOT EXISTS comparisons (
          id SERIAL PRIMARY KEY,
          item1_id INTEGER NOT NULL REFERENCES items(id),
          item2_id INTEGER NOT NULL REFERENCES items(id),
          winner_id INTEGER NOT NULL REFERENCES items(id),
          user_session_id VARCHAR(255),
          user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_items_elo ON items(elo_rating DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comparisons_winner ON comparisons(winner_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_sessions_comparisons ON user_sessions(comparisons_count DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comparisons_user_session_id ON comparisons(user_session_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_comparisons ON users(comparisons_count DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id)
      `);

      // Comments table - for discussions on items
      await client.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          user_session_id VARCHAR(255),
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comments_item_id ON comments(item_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC)
      `);

      // Collections table - for saving favorite comparisons
      await client.query(`
        CREATE TABLE IF NOT EXISTS collections (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          comparison_id INTEGER NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, comparison_id)
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_collections_comparison_id ON collections(comparison_id)
      `);
      
      console.log('PostgreSQL tables created successfully');
    } finally {
      client.release();
    }
  } else {
    // SQLite table creation - use serialize() for sequential execution
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Categories table - must be created before items
        db.run(`CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.error('Error creating categories table:', err);
            return reject(err);
          }
          console.log('✓ Created categories table');
          
          // Items table - must be after categories
          db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wikipedia_id INTEGER UNIQUE,
            title TEXT NOT NULL UNIQUE,
            image_url TEXT,
            description TEXT,
            category_id INTEGER REFERENCES categories(id),
            elo_rating REAL DEFAULT 1500,
            comparison_count INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err) => {
            if (err) {
              console.error('Error creating items table:', err);
              return reject(err);
            }
            console.log('✓ Created items table');
            
            // Indexes for items
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_items_title ON items(title)`, (err) => {
              if (err) console.error('Error creating idx_items_title:', err);
              
              db.run(`CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id)`, (err) => {
                if (err) console.error('Error creating idx_items_category_id:', err);
                
                // Comparisons table - depends on items
                db.run(`CREATE TABLE IF NOT EXISTS comparisons (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              item1_id INTEGER NOT NULL,
              item2_id INTEGER NOT NULL,
              winner_id INTEGER NOT NULL,
              user_session_id TEXT,
              user_id INTEGER REFERENCES users(id),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (item1_id) REFERENCES items(id),
              FOREIGN KEY (item2_id) REFERENCES items(id),
              FOREIGN KEY (winner_id) REFERENCES items(id)
            )`, (err) => {
              if (err) {
                console.error('Error creating comparisons table:', err);
                return reject(err);
              }
              console.log('✓ Created comparisons table');
              
              // User sessions table
              db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
                session_id TEXT PRIMARY KEY,
                comparisons_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP
              )`, (err) => {
                if (err) {
                  console.error('Error creating user_sessions table:', err);
                  return reject(err);
                }
                console.log('✓ Created user_sessions table');
                
                // Users table
                db.run(`CREATE TABLE IF NOT EXISTS users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  email TEXT UNIQUE NOT NULL,
                  username TEXT UNIQUE NOT NULL,
                  password_hash TEXT NOT NULL,
                  comparisons_count INTEGER DEFAULT 0,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                  if (err) {
                    console.error('Error creating users table:', err);
                    return reject(err);
                  }
                  console.log('✓ Created users table');
                  
                  // Create indexes sequentially
                  db.run(`CREATE INDEX IF NOT EXISTS idx_items_elo ON items(elo_rating DESC)`, () => {
                    db.run(`CREATE INDEX IF NOT EXISTS idx_comparisons_winner ON comparisons(winner_id)`, () => {
                      db.run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_comparisons ON user_sessions(comparisons_count DESC)`, () => {
                        db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`, () => {
                          db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`, () => {
                            db.run(`CREATE INDEX IF NOT EXISTS idx_comparisons_user_session_id ON comparisons(user_session_id)`, () => {
                              db.run(`CREATE INDEX IF NOT EXISTS idx_users_comparisons ON users(comparisons_count DESC)`, () => {
                                db.run(`CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id)`, () => {
                                  // Comments table
                                  db.run(`CREATE TABLE IF NOT EXISTS comments (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                                    user_session_id TEXT,
                                    content TEXT NOT NULL,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                  )`, () => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_comments_item_id ON comments(item_id)`, () => {
                                      db.run(`CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)`, () => {
                                        db.run(`CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC)`, () => {
                                          // Collections table
                                          db.run(`CREATE TABLE IF NOT EXISTS collections (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                            comparison_id INTEGER NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
                                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                            UNIQUE(user_id, comparison_id)
                                          )`, () => {
                                            db.run(`CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)`, () => {
                                              db.run(`CREATE INDEX IF NOT EXISTS idx_collections_comparison_id ON collections(comparison_id)`, () => {
                                                // Enable foreign keys for SQLite
                                                db.run(`PRAGMA foreign_keys = ON`, (err) => {
                                                  if (err) {
                                                    console.error('Error enabling foreign keys:', err);
                                                    return reject(err);
                                                  }
                                                  console.log('SQLite tables created successfully');
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
        });
      });
    });
  }
};

// Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
const convertPlaceholders = (sql) => {
  if (!USE_POSTGRES) return sql;
  
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
};

// Convert INSERT OR IGNORE to PostgreSQL ON CONFLICT
const convertInsertOrIgnore = (sql) => {
  if (!USE_POSTGRES) return sql;
  
  // Match: INSERT OR IGNORE INTO table ...
  const match = sql.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES/i);
  if (!match) return convertPlaceholders(sql);
  
  const table = match[1];
  const columns = match[2].split(',').map(c => c.trim());
  
  // Determine conflict column based on table
  let conflictColumn = null;
  if (table === 'items') conflictColumn = 'title';
  else if (table === 'users') conflictColumn = 'email';
  else if (table === 'user_sessions') conflictColumn = 'session_id';
  
  if (conflictColumn && columns.includes(conflictColumn)) {
    // Replace INSERT OR IGNORE with INSERT ... ON CONFLICT
    const newSql = sql.replace(
      /INSERT\s+OR\s+IGNORE\s+INTO/i,
      `INSERT INTO`
    ) + ` ON CONFLICT (${conflictColumn}) DO NOTHING`;
    return convertPlaceholders(newSql);
  }
  
  return convertPlaceholders(sql);
};

// Convert SQL to PostgreSQL-compatible syntax
const convertSql = (sql) => {
  if (!USE_POSTGRES) return sql;
  
  // Ensure sql is a string
  if (!sql || typeof sql !== 'string') {
    throw new Error(`convertSql received invalid input: ${typeof sql}`);
  }
  
  try {
    // Handle PRAGMA statements (PostgreSQL doesn't use PRAGMA)
    if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
      // PRAGMA foreign_keys = ON is always on in PostgreSQL, so return a no-op query
      if (sql.includes('foreign_keys')) {
        return 'SELECT 1'; // No-op query
      }
      // For PRAGMA table_info, we'll handle it separately in the migration code
      return sql;
    }
    
    // Convert INSERT OR IGNORE
    if (sql.includes('INSERT OR IGNORE')) {
      return convertInsertOrIgnore(sql);
    }
    
    // Convert SQLite date functions to PostgreSQL
    let converted = sql;
    
    // Convert date('now') to CURRENT_DATE or NOW()
    converted = converted.replace(/date\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_DATE');
    
    // RANDOM() works in both, but ensure consistency
    converted = converted.replace(/\bRANDOM\(\)/gi, 'RANDOM()');
    
    // Convert placeholders
    converted = convertPlaceholders(converted);
    
    return converted;
  } catch (err) {
    console.error('Error in convertSql:', err, 'SQL:', sql.substring(0, 100));
    throw err;
  }
};

// Database wrapper to provide a unified interface
// For backward compatibility, returns an object that works like SQLite's Database
const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  if (USE_POSTGRES) {
    // Ensure db is a Pool instance
    if (!db) {
      throw new Error('PostgreSQL database not initialized (db is null/undefined)');
    }
    if (typeof db.query !== 'function') {
      console.error('Database type check failed:', {
        dbType: typeof db,
        dbConstructor: db?.constructor?.name,
        hasQuery: 'query' in db,
        dbKeys: db ? Object.keys(db).slice(0, 10) : []
      });
      throw new Error(`PostgreSQL database not properly initialized. db.query is not a function. db type: ${typeof db}, constructor: ${db?.constructor?.name}`);
    }
    
    // Return a wrapper that makes PostgreSQL Pool look like SQLite Database
    return {
      run: function(sql, paramsOrCallback, callbackOrUndefined) {
        // Handle SQLite-style call: run(sql, callback) - params are optional
        let params, callback;
        if (typeof paramsOrCallback === 'function') {
          // Called as run(sql, callback) - no params
          params = [];
          callback = paramsOrCallback;
        } else {
          // Called as run(sql, params, callback)
          params = paramsOrCallback || [];
          callback = callbackOrUndefined;
        }
        
        try {
          const normalizedSql = convertSql(sql);
          
          // Skip no-op queries (like PRAGMA conversions)
          if (normalizedSql === 'SELECT 1' && sql.includes('PRAGMA')) {
            if (callback) {
              callback(null);
            }
            return;
          }
          
          // Ensure params is an array
          if (!Array.isArray(params)) {
            params = [];
          }
          
          const queryPromise = db.query(normalizedSql, params);
          if (!queryPromise || typeof queryPromise.then !== 'function') {
            throw new Error('db.query did not return a Promise');
          }
          
          queryPromise
            .then(result => {
              if (callback) {
                // SQLite's run callback gets (err) and `this` context with changes and lastID
                const context = {
                  changes: result.rowCount || 0,
                  lastID: result.rows[0]?.id || null
                };
                callback.call(context, null);
              }
            })
            .catch(err => {
              if (callback) {
                callback(err);
              } else {
                console.error('Database query error (no callback):', err);
              }
            });
        } catch (err) {
          if (callback) {
            callback(err);
          } else {
            console.error('Database query setup error:', err);
            throw err;
          }
        }
      },
      get: (sql, paramsOrCallback, callbackOrUndefined) => {
        // Handle SQLite-style call: get(sql, callback) - params are optional
        let params, callback;
        if (typeof paramsOrCallback === 'function') {
          // Called as get(sql, callback) - no params
          params = [];
          callback = paramsOrCallback;
        } else {
          // Called as get(sql, params, callback)
          params = paramsOrCallback || [];
          callback = callbackOrUndefined;
        }
        
        try {
          if (!db || typeof db.query !== 'function') {
            const err = new Error('PostgreSQL database not initialized properly');
            if (callback) return callback(err);
            throw err;
          }
          
          const normalizedSql = convertSql(sql);
          
          // Ensure we have valid SQL
          if (!normalizedSql || typeof normalizedSql !== 'string') {
            const err = new Error('Invalid SQL after conversion');
            if (callback) return callback(err);
            throw err;
          }
          
          // Ensure params is an array
          if (!Array.isArray(params)) {
            params = [];
          }
          
          let queryPromise;
          
          try {
            queryPromise = db.query(normalizedSql, params);
          } catch (queryErr) {
            // db.query() threw synchronously (shouldn't happen, but catch it)
            if (callback) return callback(queryErr);
            throw queryErr;
          }
          
          if (!queryPromise || typeof queryPromise.then !== 'function') {
            const err = new Error(`db.query did not return a Promise. Got: ${typeof queryPromise}`);
            if (callback) return callback(err);
            throw err;
          }
          
          queryPromise
            .then(result => {
              if (callback) {
                callback(null, result.rows[0] || null);
              }
            })
            .catch(err => {
              if (callback) {
                callback(err);
              } else {
                console.error('Database query error (no callback):', err);
              }
            });
        } catch (err) {
          if (callback) {
            callback(err);
          } else {
            console.error('Database query setup error:', err);
            throw err;
          }
        }
      },
      all: (sql, paramsOrCallback, callbackOrUndefined) => {
        // Handle SQLite-style call: all(sql, callback) - params are optional
        let params, callback;
        if (typeof paramsOrCallback === 'function') {
          // Called as all(sql, callback) - no params
          params = [];
          callback = paramsOrCallback;
        } else {
          // Called as all(sql, params, callback)
          params = paramsOrCallback || [];
          callback = callbackOrUndefined;
        }
        
        try {
          if (!db || typeof db.query !== 'function') {
            const err = new Error('PostgreSQL database not initialized properly');
            if (callback) return callback(err);
            throw err;
          }
          
          const normalizedSql = convertSql(sql);
          
          // Ensure we have valid SQL
          if (!normalizedSql || typeof normalizedSql !== 'string') {
            const err = new Error('Invalid SQL after conversion');
            if (callback) return callback(err);
            throw err;
          }
          
          // Ensure params is an array
          if (!Array.isArray(params)) {
            params = [];
          }
          
          let queryPromise;
          
          try {
            queryPromise = db.query(normalizedSql, params);
          } catch (queryErr) {
            // db.query() threw synchronously (shouldn't happen, but catch it)
            if (callback) return callback(queryErr);
            throw queryErr;
          }
          
          if (!queryPromise || typeof queryPromise.then !== 'function') {
            const err = new Error(`db.query did not return a Promise. Got: ${typeof queryPromise}`);
            if (callback) return callback(err);
            throw err;
          }
          
          queryPromise
            .then(result => {
              if (callback) {
                callback(null, result.rows || []);
              }
            })
            .catch(err => {
              if (callback) {
                callback(err);
              } else {
                console.error('Database query error (no callback):', err);
              }
            });
        } catch (err) {
          if (callback) {
            callback(err);
          } else {
            console.error('Database query setup error:', err);
            throw err;
          }
        }
      },
      serialize: (callback) => {
        // PostgreSQL doesn't need serialize, just run the callback
        if (callback) callback();
      },
      close: (callback) => {
        if (db && typeof db.end === 'function') {
          db.end().then(() => {
            if (callback) callback(null);
          }).catch(err => {
            if (callback) callback(err);
          });
        } else {
          if (callback) callback(null);
        }
      }
    };
  }
  
  // Return SQLite Database as-is
  return db;
};

// Get database type
const getDbType = () => {
  return dbType;
};

// Helper to run queries (abstracts SQLite vs PostgreSQL differences)
const query = (sql, params = []) => {
  if (USE_POSTGRES) {
    return db.query(sql, params);
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows });
      });
    });
  }
};

// Helper to run single query (returns single row)
const queryOne = async (sql, params = []) => {
  if (USE_POSTGRES) {
    const result = await db.query(sql, params);
    return result.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
};

// Helper to run insert/update/delete (returns changes/rows)
const run = (sql, params = []) => {
  if (USE_POSTGRES) {
    return db.query(sql, params);
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }
};

// Helper for SQLite serialize (not needed for PostgreSQL)
const serialize = (callback) => {
  if (USE_POSTGRES) {
    // PostgreSQL doesn't need serialize, just run the callback
    return callback();
  } else {
    db.serialize(callback);
  }
};

// Helper for INSERT OR IGNORE (PostgreSQL uses ON CONFLICT)
const insertOrIgnore = (table, columns, values) => {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const columnList = columns.join(', ');
  
  if (USE_POSTGRES) {
    // PostgreSQL: Use ON CONFLICT DO NOTHING
    const uniqueCol = table === 'items' ? 'title' : 
                     table === 'users' ? 'email' :
                     null;
    
    if (uniqueCol) {
      const sql = `
        INSERT INTO ${table} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT (${uniqueCol}) DO NOTHING
      `;
      return run(sql, values);
    } else {
      const sql = `
        INSERT INTO ${table} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;
      return run(sql, values);
    }
  } else {
    // SQLite: Use INSERT OR IGNORE
    const sql = `
      INSERT OR IGNORE INTO ${table} (${columnList})
      VALUES (${placeholders})
    `;
    return run(sql, values);
  }
};

const close = async () => {
  if (USE_POSTGRES) {
    await db.end();
  } else {
    return new Promise((resolve, reject) => {
      if (db) {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
};

module.exports = {
  init,
  getDb,
  getDbType,
  query,
  queryOne,
  run,
  serialize,
  insertOrIgnore,
  close
};
