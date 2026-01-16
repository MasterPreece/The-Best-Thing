const db = require('../database');

const getLeaderboard = async (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  
  // Cap at 10,000 to prevent performance issues
  if (limit > 10000) {
    limit = 10000;
  }
  
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  try {
    let rows = [];
    let total = 0;
    
    if (dbType === 'postgres') {
      // PostgreSQL: Use async/await with db.query()
      if (limit >= 10000) {
        // Get all
        const result = await db.query(`
          SELECT session_id, comparisons_count, last_active
          FROM user_sessions
          ORDER BY comparisons_count DESC
        `);
        rows = result.rows || [];
        
        // Get total count
        const countResult = await db.query('SELECT COUNT(*) as total FROM user_sessions');
        total = parseInt(countResult.rows[0]?.total || 0);
      } else {
        // Get with limit
        const result = await db.query(`
          SELECT session_id, comparisons_count, last_active
          FROM user_sessions
          ORDER BY comparisons_count DESC
          LIMIT $1
        `, [limit]);
        rows = result.rows || [];
        
        // Get total count
        const countResult = await db.query('SELECT COUNT(*) as total FROM user_sessions');
        total = parseInt(countResult.rows[0]?.total || 0);
      }
    } else {
      // SQLite: Use callback-style
      if (limit >= 10000) {
        // Get all
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT session_id, comparisons_count, last_active
            FROM user_sessions
            ORDER BY comparisons_count DESC
          `, [], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get('SELECT COUNT(*) as total FROM user_sessions', [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      } else {
        // Get with limit
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT session_id, comparisons_count, last_active
            FROM user_sessions
            ORDER BY comparisons_count DESC
            LIMIT ?
          `, [limit], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get('SELECT COUNT(*) as total FROM user_sessions', [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      }
    }
    
    console.log(`[Leaderboard] Fetched ${rows.length} user sessions (limit: ${limit >= 10000 ? 'all' : limit}), total: ${total}`);
    
    res.json({
      leaderboard: rows.map((row, index) => ({
        rank: index + 1,
        sessionId: row.session_id,
        comparisonsCount: parseInt(row.comparisons_count || 0),
        lastActive: row.last_active
      })),
      total
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard', 
      details: error.message 
    });
  }
};

module.exports = {
  getLeaderboard
};

