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
      // PostgreSQL: Combine user_sessions (anonymous) and users (logged-in)
      // Use UNION ALL to combine both, then order by comparisons_count
      if (limit >= 10000) {
        // Get all - combine anonymous sessions and logged-in users
        const result = await db.query(`
          SELECT 
            COALESCE(session_id, username) as identifier,
            session_id,
            username,
            comparisons_count, 
            last_active,
            'anonymous' as user_type
          FROM user_sessions
          WHERE comparisons_count > 0
          
          UNION ALL
          
          SELECT 
            username as identifier,
            NULL as session_id,
            username,
            comparisons_count,
            last_active,
            'registered' as user_type
          FROM users
          WHERE comparisons_count > 0
          
          ORDER BY comparisons_count DESC
        `);
        rows = result.rows || [];
        
        // Get total count (combined)
        const countResult = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
            (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
        `);
        total = parseInt(countResult.rows[0]?.total || 0);
      } else {
        // Get with limit - combine and limit the combined result
        const result = await db.query(`
          SELECT * FROM (
            SELECT 
              COALESCE(session_id, username) as identifier,
              session_id,
              username,
              comparisons_count, 
              last_active,
              'anonymous' as user_type
            FROM user_sessions
            WHERE comparisons_count > 0
            
            UNION ALL
            
            SELECT 
              username as identifier,
              NULL as session_id,
              username,
              comparisons_count,
              last_active,
              'registered' as user_type
            FROM users
            WHERE comparisons_count > 0
          ) combined
          ORDER BY comparisons_count DESC
          LIMIT $1
        `, [limit]);
        rows = result.rows || [];
        
        // Get total count (combined)
        const countResult = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
            (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
        `);
        total = parseInt(countResult.rows[0]?.total || 0);
      }
    } else {
      // SQLite: Combine user_sessions and users
      if (limit >= 10000) {
        // Get all
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT 
              COALESCE(session_id, username) as identifier,
              session_id,
              username,
              comparisons_count, 
              last_active,
              'anonymous' as user_type
            FROM user_sessions
            WHERE comparisons_count > 0
            
            UNION ALL
            
            SELECT 
              username as identifier,
              NULL as session_id,
              username,
              comparisons_count,
              last_active,
              'registered' as user_type
            FROM users
            WHERE comparisons_count > 0
            
            ORDER BY comparisons_count DESC
          `, [], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT 
              (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
              (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
          `, [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      } else {
        // Get with limit
        rows = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT * FROM (
              SELECT 
                COALESCE(session_id, username) as identifier,
                session_id,
                username,
                comparisons_count, 
                last_active,
                'anonymous' as user_type
              FROM user_sessions
              WHERE comparisons_count > 0
              
              UNION ALL
              
              SELECT 
                username as identifier,
                NULL as session_id,
                username,
                comparisons_count,
                last_active,
                'registered' as user_type
              FROM users
              WHERE comparisons_count > 0
            )
            ORDER BY comparisons_count DESC
            LIMIT ?
          `, [limit], (err, resultRows) => {
            if (err) reject(err);
            else resolve(resultRows || []);
          });
        });
        
        // Get total count
        const countRow = await new Promise((resolve) => {
          dbInstance.get(`
            SELECT 
              (SELECT COUNT(*) FROM user_sessions WHERE comparisons_count > 0) +
              (SELECT COUNT(*) FROM users WHERE comparisons_count > 0) as total
          `, [], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : rows.length;
      }
    }
    
    console.log(`[Leaderboard] Fetched ${rows.length} users/sessions (limit: ${limit >= 10000 ? 'all' : limit}), total: ${total}`);
    
    res.json({
      leaderboard: rows.map((row, index) => ({
        rank: index + 1,
        identifier: row.identifier || row.session_id || row.username,
        username: row.username || null,
        sessionId: row.session_id || null,
        userType: row.user_type || (row.username ? 'registered' : 'anonymous'),
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

