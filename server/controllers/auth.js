const db = require('../database');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');
const { calculateUserStats } = require('../utils/user-stats-calculator');

/**
 * Register a new user
 */
const register = async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Username validation (alphanumeric and underscore, 3-20 chars)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscore only)' });
  }

  const dbType = db.getDbType();
  const dbInstance = db.getDb();

  try {
    // Hash password first
    const passwordHash = await hashPassword(password);

    if (dbType === 'postgres') {
      // PostgreSQL: Use async/await
      try {
        // Check if email or username already exists
        const existingResult = await dbInstance.query(`
          SELECT id, email, username FROM users WHERE email = $1 OR username = $2
        `, [email, username]);
        
        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];
          if (existing.email === email) {
            return res.status(400).json({ error: 'Email already registered' });
          } else {
            return res.status(400).json({ error: 'Username already taken' });
          }
        }

        // Insert user
        const insertResult = await dbInstance.query(`
          INSERT INTO users (email, username, password_hash)
          VALUES ($1, $2, $3)
          RETURNING id
        `, [email, username, passwordHash]);
        
        const userId = insertResult.rows[0].id;

        // Link anonymous session votes to new user account
        const sessionId = req.body.sessionId;
        if (sessionId) {
          await dbInstance.query(`
            UPDATE comparisons
            SET user_id = $1
            WHERE user_session_id = $2 AND user_id IS NULL
          `, [userId, sessionId]).catch(err => {
            console.error('Error linking anonymous votes:', err);
          });

          // Update user comparisons count
          const countResult = await dbInstance.query(`
            SELECT COUNT(*) as count FROM comparisons WHERE user_id = $1
          `, [userId]).catch(() => ({ rows: [{ count: '0' }] }));
          
          if (countResult.rows[0]) {
            await dbInstance.query(`
              UPDATE users SET comparisons_count = $1 WHERE id = $2
            `, [countResult.rows[0].count, userId]).catch(() => {});
          }
        }

        // Generate token
        const token = generateToken(userId);

        // Get user data
        const userResult = await dbInstance.query(`
          SELECT id, email, username, comparisons_count, created_at
          FROM users WHERE id = $1
        `, [userId]);
        
        const user = userResult.rows[0];
        
        res.json({
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            comparisonsCount: parseInt(user.comparisons_count) || 0,
            createdAt: user.created_at
          }
        });
      } catch (dbErr) {
        console.error('Error creating user (PostgreSQL):', dbErr);
        
        // Check for duplicate email/username
        if (dbErr.code === '23505') { // Unique violation
          try {
            const emailCheck = await dbInstance.query('SELECT id FROM users WHERE email = $1', [email]);
            if (emailCheck.rows.length > 0) {
              return res.status(400).json({ error: 'Email already registered' });
            }
            const usernameCheck = await dbInstance.query('SELECT id FROM users WHERE username = $1', [username]);
            if (usernameCheck.rows.length > 0) {
              return res.status(400).json({ error: 'Username already taken' });
            }
          } catch (checkErr) {
            // Fall through to generic error
          }
        }
        
        return res.status(500).json({ error: 'Failed to create account' });
      }
    } else {
      // SQLite: Use callback-style API
      // Check if email or username already exists
      dbInstance.get(`
        SELECT id FROM users WHERE email = ? OR username = ?
      `, [email, username], async (err, existingUser) => {
        if (err) {
          console.error('Error checking existing user:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (existingUser) {
          // Check which one is duplicate
          dbInstance.get(`
            SELECT id FROM users WHERE email = ?
          `, [email], (err, emailUser) => {
            if (emailUser) {
              return res.status(400).json({ error: 'Email already registered' });
            } else {
              return res.status(400).json({ error: 'Username already taken' });
            }
          });
          return;
        }

        // Create user
        dbInstance.run(`
          INSERT INTO users (email, username, password_hash)
          VALUES (?, ?, ?)
        `, [email, username, passwordHash], async function(err) {
          if (err) {
            console.error('Error creating user:', err);
            return res.status(500).json({ error: 'Failed to create account' });
          }

          const userId = this.lastID;

          // Link anonymous session votes to new user account
          const sessionId = req.body.sessionId;
          if (sessionId) {
            dbInstance.run(`
              UPDATE comparisons
              SET user_id = ?
              WHERE user_session_id = ? AND user_id IS NULL
            `, [userId, sessionId], (err) => {
              if (err) {
                console.error('Error linking anonymous votes:', err);
              }
            });

            // Update user comparisons count
            dbInstance.get(`
              SELECT COUNT(*) as count FROM comparisons WHERE user_id = ?
            `, [userId], (err, row) => {
              if (!err && row) {
                dbInstance.run(`
                  UPDATE users SET comparisons_count = ? WHERE id = ?
                `, [row.count, userId], () => {});
              }
            });
          }

          // Generate token
          const token = generateToken(userId);

          // Get user stats
          dbInstance.get(`
            SELECT id, email, username, comparisons_count, created_at
            FROM users WHERE id = ?
          `, [userId], (err, user) => {
            if (err) {
              console.error('Error fetching user after registration:', err);
              return res.status(500).json({ error: 'Failed to fetch user data' });
            }

            res.json({
              success: true,
              token,
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                comparisonsCount: user.comparisons_count,
                createdAt: user.created_at
              }
            });
          });
        });
      });
    }
  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Login user
 */
const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const dbInstance = db.getDb();

  dbInstance.get(`
    SELECT id, email, username, password_hash, comparisons_count, created_at
    FROM users WHERE email = ?
  `, [email], async (err, user) => {
    if (err) {
      console.error('Error finding user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last active
    dbInstance.run(`
      UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?
    `, [user.id], () => {});

    // Generate token
    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        comparisonsCount: user.comparisons_count,
        createdAt: user.created_at
      }
    });
  });
};

/**
 * Get current user
 */
const getCurrentUser = (req, res) => {
  const dbInstance = db.getDb();

  dbInstance.get(`
    SELECT id, email, username, comparisons_count, created_at, last_active
    FROM users WHERE id = ?
  `, [req.userId], (err, user) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      comparisonsCount: user.comparisons_count,
      createdAt: user.created_at,
      lastActive: user.last_active
    });
  });
};

/**
 * Get user stats (enhanced with upset statistics and patterns)
 */
const getUserStats = async (req, res) => {
  const dbInstance = db.getDb();

  try {
    // Get basic stats - handle missing columns gracefully
    const statsResult = await new Promise((resolve, reject) => {
      // Try to get all columns, but if they don't exist, just get basic ones
      dbInstance.get(`
        SELECT 
          id,
          username,
          comparisons_count,
          created_at
        FROM users
        WHERE id = ?
      `, [req.userId], (err, stats) => {
        if (err) return reject(err);
        
        // Try to get new columns if they exist (won't fail if they don't)
        dbInstance.get(`
          SELECT 
            upset_picks_count,
            total_upsets_available,
            average_rating_difference,
            favorite_category_id,
            consistency_score,
            longest_correct_streak
          FROM users
          WHERE id = ?
        `, [req.userId], (err2, extraStats) => {
          if (!err2 && extraStats) {
            resolve({ ...stats, ...extraStats });
          } else {
            // Columns don't exist yet, return with defaults
            resolve({
              ...stats,
              upset_picks_count: 0,
              total_upsets_available: 0,
              average_rating_difference: null,
              favorite_category_id: null,
              consistency_score: null,
              longest_correct_streak: 0
            });
          }
        });
      });
    });
    
    // Calculate detailed stats from comparisons table (this works even if user columns don't exist)
    const detailedStats = await calculateUserStats(req.userId).catch(err => {
      console.error('Error calculating user stats from comparisons:', err);
      return {
        upsetPicks: 0,
        totalUpsetsAvailable: 0,
        upsetPickRate: 0,
        averageRatingDifference: 0,
        favoriteCategoryId: null,
        longestCorrectStreak: 0
      };
    });

    const stats = statsResult || {};
    
    // Get category name if favorite_category_id exists
    let favoriteCategoryName = null;
    if (stats.favorite_category_id) {
      try {
        favoriteCategoryName = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT name FROM categories WHERE id = ?
          `, [stats.favorite_category_id], (err, category) => {
            if (err || !category) {
              resolve(null);
            } else {
              resolve(category.name);
            }
          });
        });
      } catch (catErr) {
        // If category lookup fails, continue without it
      }
    }
    
    res.json({
      comparisonsCount: stats.comparisons_count || 0,
      createdAt: stats.created_at,
      // Upset statistics
      upsetPicks: detailedStats.upsetPicks || stats.upset_picks_count || 0,
      totalUpsetsAvailable: detailedStats.totalUpsetsAvailable || stats.total_upsets_available || 0,
      upsetPickRate: detailedStats.upsetPickRate || 0,
      // Voting patterns
      averageRatingDifference: detailedStats.averageRatingDifference || stats.average_rating_difference || 0,
      favoriteCategoryId: detailedStats.favoriteCategoryId || stats.favorite_category_id || null,
      favoriteCategoryName: favoriteCategoryName,
      // Achievements
      longestCorrectStreak: detailedStats.longestCorrectStreak || stats.longest_correct_streak || 0,
      consistencyScore: stats.consistency_score || null
    });
  } catch (error) {
    console.error('Error in getUserStats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  getUserStats
};

