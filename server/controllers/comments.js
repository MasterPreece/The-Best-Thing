const db = require('../database');

/**
 * Get comments for an item
 */
const getComments = async (req, res) => {
  const { itemId } = req.params;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  try {
    let comments = [];
    
    if (dbType === 'postgres') {
      const result = await dbInstance.query(`
        SELECT 
          c.id,
          c.content,
          c.created_at,
          c.updated_at,
          c.user_id,
          COALESCE(u.username, 'Anonymous') as username,
          c.user_session_id
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.item_id = $1
        ORDER BY c.created_at DESC
        LIMIT 100
      `, [itemId]);
      comments = result.rows || [];
    } else {
      comments = await new Promise((resolve, reject) => {
        dbInstance.all(`
          SELECT 
            c.id,
            c.content,
            c.created_at,
            c.updated_at,
            c.user_id,
            COALESCE(u.username, 'Anonymous') as username,
            c.user_session_id
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.item_id = ?
          ORDER BY c.created_at DESC
          LIMIT 100
        `, [itemId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }

    res.json({ comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
};

/**
 * Create a new comment
 */
const createComment = async (req, res) => {
  const { itemId } = req.params;
  const { content } = req.body;
  const userId = req.userId || null;
  const userSessionId = req.body.userSessionId || null;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  if (content.length > 1000) {
    return res.status(400).json({ error: 'Comment must be 1000 characters or less' });
  }

  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  try {
    let comment = null;
    
    if (dbType === 'postgres') {
      const result = await dbInstance.query(`
        INSERT INTO comments (item_id, user_id, user_session_id, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id, content, created_at, updated_at, user_id, user_session_id
      `, [itemId, userId, userSessionId, content.trim()]);
      
      if (result.rows[0]) {
        const commentData = result.rows[0];
        // Get username
        let username = 'Anonymous';
        if (commentData.user_id) {
          const userResult = await dbInstance.query('SELECT username FROM users WHERE id = $1', [commentData.user_id]);
          username = userResult.rows[0]?.username || 'Anonymous';
        }
        
        comment = {
          ...commentData,
          username
        };
      }
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          INSERT INTO comments (item_id, user_id, user_session_id, content)
          VALUES (?, ?, ?, ?)
        `, [itemId, userId, userSessionId, content.trim()], function(err) {
          if (err) reject(err);
          else {
            // Get the created comment
            dbInstance.get(`
              SELECT 
                c.id,
                c.content,
                c.created_at,
                c.updated_at,
                c.user_id,
                COALESCE(u.username, 'Anonymous') as username,
                c.user_session_id
              FROM comments c
              LEFT JOIN users u ON c.user_id = u.id
              WHERE c.id = ?
            `, [this.lastID], (err, row) => {
              if (err) reject(err);
              else {
                comment = row;
                resolve();
              }
            });
          }
        });
      });
    }

    if (!comment) {
      return res.status(500).json({ error: 'Failed to create comment' });
    }

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

/**
 * Delete a comment (only by owner or admin)
 */
const deleteComment = async (req, res) => {
  const { commentId } = req.params;
  const userId = req.userId;
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Check if comment exists and user owns it
    let comment = null;
    if (dbType === 'postgres') {
      const result = await dbInstance.query(`
        SELECT user_id FROM comments WHERE id = $1
      `, [commentId]);
      comment = result.rows[0];
    } else {
      comment = await new Promise((resolve, reject) => {
        dbInstance.get('SELECT user_id FROM comments WHERE id = ?', [commentId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    // Delete the comment
    if (dbType === 'postgres') {
      await dbInstance.query('DELETE FROM comments WHERE id = $1', [commentId]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run('DELETE FROM comments WHERE id = ?', [commentId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};

module.exports = {
  getComments,
  createComment,
  deleteComment
};

