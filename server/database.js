const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use persistent storage path on Railway, or local path for development
// Railway volumes are mounted at /data by default, or use RAILWAY_VOLUME_MOUNT_PATH env var
const PERSISTENT_STORAGE_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || '/data';
const LOCAL_DB_PATH = path.join(__dirname, 'database.sqlite');

// Use persistent path in production (Railway), local path in development
let DB_PATH;
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
    console.error(`Database persistence will fail! Please configure Railway volume at ${PERSISTENT_STORAGE_PATH}`);
    // Fall back to local path but warn user
    DB_PATH = LOCAL_DB_PATH;
    console.warn(`Falling back to local database path: ${LOCAL_DB_PATH} (this will NOT persist between deployments)`);
  }
} else {
  DB_PATH = LOCAL_DB_PATH;
}

console.log(`Database will be stored at: ${DB_PATH}`);

let db = null;

const init = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
};

const createTables = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Items table - stores Wikipedia pages
      db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wikipedia_id INTEGER UNIQUE,
        title TEXT NOT NULL UNIQUE,
        image_url TEXT,
        description TEXT,
        elo_rating REAL DEFAULT 1500,
        comparison_count INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      // Add unique constraint on title if it doesn't exist (for existing databases)
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_items_title ON items(title)`);

      // Comparisons table - stores user votes
      db.run(`CREATE TABLE IF NOT EXISTS comparisons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item1_id INTEGER NOT NULL,
        item2_id INTEGER NOT NULL,
        winner_id INTEGER NOT NULL,
        user_session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item1_id) REFERENCES items(id),
        FOREIGN KEY (item2_id) REFERENCES items(id),
        FOREIGN KEY (winner_id) REFERENCES items(id)
      )`);

      // Users/Leaderboard table - tracks user scores
      db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
        session_id TEXT PRIMARY KEY,
        comparisons_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Users table - tracks registered users
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        comparisons_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Note: user_id column will be added via migration if needed
      // (ALTER TABLE ADD COLUMN cannot be run inside CREATE TABLE IF NOT EXISTS)

      // Indexes for performance
      db.run(`CREATE INDEX IF NOT EXISTS idx_items_elo ON items(elo_rating DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_comparisons_winner ON comparisons(winner_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_comparisons ON user_sessions(comparisons_count DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_comparisons_user_session_id ON comparisons(user_session_id)`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_users_comparisons ON users(comparisons_count DESC)`);

      db.run(`PRAGMA foreign_keys = ON`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const close = () => {
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
};

module.exports = {
  init,
  getDb,
  close
};

