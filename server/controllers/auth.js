const db = require('../database');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');

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

  const dbInstance = db.getDb();

  try {
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

      // Hash password
      const passwordHash = await hashPassword(password);

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
        const sessionId = req.body.sessionId; // Optional: link previous anonymous votes
        if (sessionId) {
          dbInstance.run(`
            UPDATE comparisons
            SET user_id = ?
            WHERE user_session_id = ? AND user_id IS NULL
          `, [userId, sessionId], (err) => {
            if (err) {
              console.error('Error linking anonymous votes:', err);
              // Don't fail registration if this fails
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
 * Get user stats
 */
const getUserStats = (req, res) => {
  const dbInstance = db.getDb();

  dbInstance.get(`
    SELECT 
      u.id,
      u.username,
      u.comparisons_count,
      u.created_at,
      COUNT(DISTINCT c.id) as total_votes,
      COUNT(DISTINCT CASE WHEN c.winner_id = c.item1_id AND i1.id = c.winner_id THEN c.id END) +
      COUNT(DISTINCT CASE WHEN c.winner_id = c.item2_id AND i2.id = c.winner_id THEN c.id END) as wins
    FROM users u
    LEFT JOIN comparisons c ON c.user_id = u.id
    LEFT JOIN items i1 ON c.item1_id = i1.id
    LEFT JOIN items i2 ON c.item2_id = i2.id
    WHERE u.id = ?
    GROUP BY u.id
  `, [req.userId], (err, stats) => {
    if (err) {
      console.error('Error fetching user stats:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({
      comparisonsCount: stats.comparisons_count || 0,
      totalVotes: stats.total_votes || 0,
      wins: stats.wins || 0,
      createdAt: stats.created_at
    });
  });
};

module.exports = {
  register,
  login,
  getCurrentUser,
  getUserStats
};

