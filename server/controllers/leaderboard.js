const db = require('../database');

const getLeaderboard = (req, res) => {
  let limit = parseInt(req.query.limit) || 100;
  
  // Cap at 10,000 to prevent performance issues
  if (limit > 10000) {
    limit = 10000;
  }
  
  const dbInstance = db.getDb();
  
  // If limit is very large, get all (no LIMIT clause)
  if (limit >= 10000) {
    dbInstance.all(`
      SELECT session_id, comparisons_count, last_active
      FROM user_sessions
      ORDER BY comparisons_count DESC
    `, [], (err, rows) => {
      if (err) {
        console.error('Error fetching leaderboard:', err);
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
      
      res.json({
        leaderboard: rows.map((row, index) => ({
          rank: index + 1,
          sessionId: row.session_id,
          comparisonsCount: row.comparisons_count,
          lastActive: row.last_active
        })),
        total: rows.length
      });
    });
  } else {
    dbInstance.all(`
      SELECT session_id, comparisons_count, last_active
      FROM user_sessions
      ORDER BY comparisons_count DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) {
        console.error('Error fetching leaderboard:', err);
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
      
      // Get total count for info
      dbInstance.get(`SELECT COUNT(*) as total FROM user_sessions`, [], (err, countRow) => {
        const total = countRow ? countRow.total : rows.length;
        
        res.json({
          leaderboard: rows.map((row, index) => ({
            rank: index + 1,
            sessionId: row.session_id,
            comparisonsCount: row.comparisons_count,
            lastActive: row.last_active
          })),
          total
        });
      });
    });
  }
};

module.exports = {
  getLeaderboard
};

