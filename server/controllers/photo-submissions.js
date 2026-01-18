const db = require('../database');

/**
 * Submit a photo for an item
 * POST /api/photo-submissions
 * Body: { itemId, imageUrl, userSessionId?, userId? }
 */
const submitPhoto = async (req, res) => {
  try {
    const { itemId, imageUrl } = req.body;
    const userId = req.user?.id || null;
    const userSessionId = req.body.userSessionId || null;

    if (!itemId || !imageUrl) {
      return res.status(400).json({ error: 'itemId and imageUrl are required' });
    }

    // Validate image URL
    try {
      new URL(imageUrl);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    // Check if item exists
    const dbType = db.getDbType();
    const dbInstance = db.getDb();
    
    let itemExists = false;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT id FROM items WHERE id = $1', [itemId]);
      itemExists = result.rows.length > 0;
    } else {
      itemExists = await new Promise((resolve) => {
        dbInstance.get('SELECT id FROM items WHERE id = ?', [itemId], (err, row) => {
          resolve(!err && !!row);
        });
      });
    }

    if (!itemExists) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if there's already a pending submission for this item from this user
    let existingSubmission = null;
    if (dbType === 'postgres') {
      const query = userId
        ? 'SELECT id FROM photo_submissions WHERE item_id = $1 AND user_id = $2 AND status = $3 LIMIT 1'
        : 'SELECT id FROM photo_submissions WHERE item_id = $1 AND user_session_id = $2 AND status = $3 LIMIT 1';
      const params = userId
        ? [itemId, userId, 'pending']
        : [itemId, userSessionId, 'pending'];
      const result = await db.query(query, params);
      existingSubmission = result.rows[0] || null;
    } else {
      existingSubmission = await new Promise((resolve) => {
        const query = userId
          ? 'SELECT id FROM photo_submissions WHERE item_id = ? AND user_id = ? AND status = ? LIMIT 1'
          : 'SELECT id FROM photo_submissions WHERE item_id = ? AND user_session_id = ? AND status = ? LIMIT 1';
        const params = userId
          ? [itemId, userId, 'pending']
          : [itemId, userSessionId, 'pending'];
        dbInstance.get(query, params, (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (existingSubmission) {
      return res.status(400).json({ error: 'You already have a pending submission for this item' });
    }

    // Insert submission
    if (dbType === 'postgres') {
      const result = await db.query(`
        INSERT INTO photo_submissions (item_id, user_id, user_session_id, image_url, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id, submitted_at
      `, [itemId, userId, userSessionId, imageUrl]);
      
      res.json({
        success: true,
        submission: {
          id: result.rows[0].id,
          submittedAt: result.rows[0].submitted_at
        },
        message: 'Photo submitted successfully! It will be reviewed by an admin.'
      });
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          INSERT INTO photo_submissions (item_id, user_id, user_session_id, image_url, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, [itemId, userId, userSessionId, imageUrl], function(err) {
          if (err) reject(err);
          else {
            res.json({
              success: true,
              submission: {
                id: this.lastID,
                submittedAt: new Date().toISOString()
              },
              message: 'Photo submitted successfully! It will be reviewed by an admin.'
            });
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error('Error submitting photo:', error);
    res.status(500).json({ error: 'Failed to submit photo', message: error.message });
  }
};

/**
 * Get pending photo submissions (admin only)
 * GET /api/admin/photo-submissions?status=pending
 */
const getPhotoSubmissions = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    let submissions = [];
    let total = 0;

    try {
      if (dbType === 'postgres') {
        const result = await db.query(`
          SELECT ps.id, ps.item_id, ps.user_id, ps.user_session_id, ps.image_url, ps.status,
                 ps.submitted_at, ps.reviewed_at, ps.reviewed_by,
                 i.title as item_title, i.image_url as current_image_url,
                 u.username as submitter_username
          FROM photo_submissions ps
          JOIN items i ON ps.item_id = i.id
          LEFT JOIN users u ON ps.user_id = u.id
          WHERE ps.status = $1
          ORDER BY ps.submitted_at DESC
          LIMIT $2 OFFSET $3
        `, [status, limit, offset]);

        submissions = result.rows || [];

        const countResult = await db.query(`
          SELECT COUNT(*) as total FROM photo_submissions WHERE status = $1
        `, [status]);
        total = parseInt(countResult.rows[0]?.total || 0);
      } else {
        submissions = await new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT ps.id, ps.item_id, ps.user_id, ps.user_session_id, ps.image_url, ps.status,
                   ps.submitted_at, ps.reviewed_at, ps.reviewed_by,
                   i.title as item_title, i.image_url as current_image_url,
                   u.username as submitter_username
            FROM photo_submissions ps
            JOIN items i ON ps.item_id = i.id
            LEFT JOIN users u ON ps.user_id = u.id
            WHERE ps.status = ?
            ORDER BY ps.submitted_at DESC
            LIMIT ? OFFSET ?
          `, [status, limit, offset], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        const countRow = await new Promise((resolve) => {
          dbInstance.get('SELECT COUNT(*) as total FROM photo_submissions WHERE status = ?', [status], (err, row) => {
            resolve(err ? null : row);
          });
        });
        total = countRow ? countRow.total : 0;
      }
    } catch (tableError) {
      // Table doesn't exist yet - return empty results
      const errorStr = tableError.message || tableError.toString() || '';
      if (errorStr.includes('no such table') || errorStr.includes('photo_submissions') ||
          (tableError.code === 'SQLITE_ERROR' && errorStr.includes('photo'))) {
        console.log('[Photo Submissions] Table not available yet, returning empty results');
        submissions = [];
        total = 0;
      } else {
        throw tableError;
      }
    }

    res.json({
      submissions,
      pagination: {
        total,
        limit,
        offset,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching photo submissions:', error);
    res.status(500).json({ error: 'Failed to fetch photo submissions', message: error.message });
  }
};

/**
 * Approve a photo submission (admin only)
 * POST /api/admin/photo-submissions/:id/approve
 */
const approvePhoto = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const reviewerId = null; // Admin approval - could track admin user if needed

    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    // Get submission details
    let submission = null;
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id, item_id, image_url, status FROM photo_submissions WHERE id = $1
      `, [submissionId]);
      submission = result.rows[0] || null;
    } else {
      submission = await new Promise((resolve) => {
        dbInstance.get('SELECT id, item_id, image_url, status FROM photo_submissions WHERE id = ?', [submissionId], (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'pending') {
      return res.status(400).json({ error: 'Submission has already been reviewed' });
    }

    // Update submission status
    if (dbType === 'postgres') {
      await db.query(`
        UPDATE photo_submissions 
        SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
        WHERE id = $2
      `, [reviewerId, submissionId]);

      // Update item image
      await db.query(`
        UPDATE items SET image_url = $1 WHERE id = $2
      `, [submission.image_url, submission.item_id]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          UPDATE photo_submissions 
          SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
          WHERE id = ?
        `, [reviewerId, submissionId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await new Promise((resolve, reject) => {
        dbInstance.run('UPDATE items SET image_url = ? WHERE id = ?', [submission.image_url, submission.item_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({
      success: true,
      message: 'Photo approved and item image updated'
    });
  } catch (error) {
    console.error('Error approving photo:', error);
    res.status(500).json({ error: 'Failed to approve photo', message: error.message });
  }
};

/**
 * Reject a photo submission (admin only)
 * POST /api/admin/photo-submissions/:id/reject
 */
const rejectPhoto = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const reviewerId = null; // Admin rejection - could track admin user if needed

    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    // Check if submission exists and is pending
    let submission = null;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT id, status FROM photo_submissions WHERE id = $1', [submissionId]);
      submission = result.rows[0] || null;
    } else {
      submission = await new Promise((resolve) => {
        dbInstance.get('SELECT id, status FROM photo_submissions WHERE id = ?', [submissionId], (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'pending') {
      return res.status(400).json({ error: 'Submission has already been reviewed' });
    }

    // Update submission status
    if (dbType === 'postgres') {
      await db.query(`
        UPDATE photo_submissions 
        SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
        WHERE id = $2
      `, [reviewerId, submissionId]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          UPDATE photo_submissions 
          SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
          WHERE id = ?
        `, [reviewerId, submissionId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({
      success: true,
      message: 'Photo rejected'
    });
  } catch (error) {
    console.error('Error rejecting photo:', error);
    res.status(500).json({ error: 'Failed to reject photo', message: error.message });
  }
};

module.exports = {
  submitPhoto,
  getPhotoSubmissions,
  approvePhoto,
  rejectPhoto
};

