const db = require('../database');

const getLeaderboard = (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const dbInstance = db.getDb();
  
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
    
    res.json({
      leaderboard: rows.map((row, index) => ({
        rank: index + 1,
        sessionId: row.session_id,
        comparisonsCount: row.comparisons_count,
        lastActive: row.last_active
      }))
    });
  });
};

module.exports = {
  getLeaderboard
};

