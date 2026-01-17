const db = require('../database');

/**
 * Submit a new item for approval
 * POST /api/item-submissions
 * Body: { title: string, description?: string, imageUrl?: string, wikipediaUrl?: string, categoryId?: number }
 */
const submitItem = async (req, res) => {
  try {
    const { title, description, imageUrl, wikipediaUrl, categoryId } = req.body;
    const userId = req.userId || null; // From optionalAuthenticate middleware
    const userSessionId = req.userSessionId || null; // From optionalAuthenticate middleware

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Check for duplicate pending submissions with same title
    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    let existingSubmission = null;
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id FROM item_submissions 
        WHERE LOWER(title) = LOWER($1) AND status = 'pending'
        LIMIT 1
      `, [title.trim()]);
      existingSubmission = result.rows[0] || null;
    } else {
      existingSubmission = await new Promise((resolve) => {
        dbInstance.get(`
          SELECT id FROM item_submissions 
          WHERE LOWER(title) = LOWER(?) AND status = 'pending'
          LIMIT 1
        `, [title.trim()], (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (existingSubmission) {
      return res.status(409).json({ error: 'An item with this title is already pending approval.' });
    }

    // Check if item already exists in items table
    let existingItem = null;
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id FROM items WHERE LOWER(title) = LOWER($1) LIMIT 1
      `, [title.trim()]);
      existingItem = result.rows[0] || null;
    } else {
      existingItem = await new Promise((resolve) => {
        dbInstance.get('SELECT id FROM items WHERE LOWER(title) = LOWER(?) LIMIT 1', [title.trim()], (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (existingItem) {
      return res.status(409).json({ error: 'An item with this title already exists in the database.' });
    }

    // Insert submission
    if (dbType === 'postgres') {
      const result = await db.query(`
        INSERT INTO item_submissions (title, description, image_url, wikipedia_url, category_id, user_id, user_session_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id, submitted_at
      `, [title.trim(), description?.trim() || null, imageUrl?.trim() || null, wikipediaUrl?.trim() || null, categoryId || null, userId, userSessionId]);
      
      res.json({
        success: true,
        submission: {
          id: result.rows[0].id,
          submittedAt: result.rows[0].submitted_at
        },
        message: 'Item submitted successfully! It will be reviewed by an admin.'
      });
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          INSERT INTO item_submissions (title, description, image_url, wikipedia_url, category_id, user_id, user_session_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [title.trim(), description?.trim() || null, imageUrl?.trim() || null, wikipediaUrl?.trim() || null, categoryId || null, userId, userSessionId], function(err) {
          if (err) reject(err);
          else {
            res.json({
              success: true,
              submission: {
                id: this.lastID,
                submittedAt: new Date().toISOString()
              },
              message: 'Item submitted successfully! It will be reviewed by an admin.'
            });
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error('Error submitting item:', error);
    res.status(500).json({ error: 'Failed to submit item', message: error.message });
  }
};

/**
 * Get item submissions (admin only)
 * GET /api/admin/item-submissions?status=pending
 */
const getItemSubmissions = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    let submissions = [];
    let total = 0;

    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT is.id, is.title, is.description, is.image_url, is.wikipedia_url, is.status,
               is.submitted_at, is.reviewed_at, is.reviewed_by, is.rejection_reason,
               is.category_id, c.name as category_name,
               u.username as submitter_username
        FROM item_submissions is
        LEFT JOIN categories c ON is.category_id = c.id
        LEFT JOIN users u ON is.user_id = u.id
        WHERE is.status = $1
        ORDER BY is.submitted_at DESC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      submissions = result.rows || [];

      const countResult = await db.query(`
        SELECT COUNT(*) as total FROM item_submissions WHERE status = $1
      `, [status]);
      total = parseInt(countResult.rows[0]?.total || 0);
    } else {
      submissions = await new Promise((resolve, reject) => {
        dbInstance.all(`
          SELECT is.id, is.title, is.description, is.image_url, is.wikipedia_url, is.status,
                 is.submitted_at, is.reviewed_at, is.reviewed_by, is.rejection_reason,
                 is.category_id, c.name as category_name,
                 u.username as submitter_username
          FROM item_submissions is
          LEFT JOIN categories c ON is.category_id = c.id
          LEFT JOIN users u ON is.user_id = u.id
          WHERE is.status = ?
          ORDER BY is.submitted_at DESC
          LIMIT ? OFFSET ?
        `, [status, limit, offset], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const countRow = await new Promise((resolve) => {
        dbInstance.get('SELECT COUNT(*) as total FROM item_submissions WHERE status = ?', [status], (err, row) => {
          resolve(err ? null : row);
        });
      });
      total = countRow ? countRow.total : 0;
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
    console.error('Error fetching item submissions:', error);
    res.status(500).json({ error: 'Failed to fetch item submissions', message: error.message });
  }
};

/**
 * Approve an item submission (admin only)
 * POST /api/admin/item-submissions/:id/approve
 */
const approveItem = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const reviewerId = req.user?.id || null;

    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    // Get submission details
    let submission = null;
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT id, title, description, image_url, wikipedia_url, category_id, status 
        FROM item_submissions WHERE id = $1
      `, [submissionId]);
      submission = result.rows[0] || null;
    } else {
      submission = await new Promise((resolve) => {
        dbInstance.get('SELECT id, title, description, image_url, wikipedia_url, category_id, status FROM item_submissions WHERE id = ?', [submissionId], (err, row) => {
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

    // Check for duplicate in items table
    let existingItem = null;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT id FROM items WHERE LOWER(title) = LOWER($1) LIMIT 1', [submission.title]);
      existingItem = result.rows[0] || null;
    } else {
      existingItem = await new Promise((resolve) => {
        dbInstance.get('SELECT id FROM items WHERE LOWER(title) = LOWER(?) LIMIT 1', [submission.title], (err, row) => {
          resolve(!err && row ? row : null);
        });
      });
    }

    if (existingItem) {
      // Update submission status to rejected
      if (dbType === 'postgres') {
        await db.query(`
          UPDATE item_submissions 
          SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1, rejection_reason = $2
          WHERE id = $3
        `, [reviewerId, 'An item with this title already exists in the database.', submissionId]);
      } else {
        await new Promise((resolve, reject) => {
          dbInstance.run(`
            UPDATE item_submissions 
            SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, rejection_reason = ?
            WHERE id = ?
          `, [reviewerId, 'An item with this title already exists in the database.', submissionId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      return res.status(409).json({ error: 'An item with this title already exists in the database.' });
    }

    // Extract Wikipedia ID from URL if provided
    let wikipediaId = null;
    if (submission.wikipedia_url) {
      try {
        // Try to extract page ID from Wikipedia URL
        // This is optional - we can fetch it later if needed
      } catch (e) {
        // Ignore
      }
    }

    // Insert into items table
    if (dbType === 'postgres') {
      await db.query(`
        INSERT INTO items (title, description, image_url, category_id, wikipedia_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [submission.title, submission.description, submission.image_url, submission.category_id, wikipediaId]);

      // Update submission status
      await db.query(`
        UPDATE item_submissions 
        SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1
        WHERE id = $2
      `, [reviewerId, submissionId]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          INSERT OR IGNORE INTO items (title, description, image_url, category_id, wikipedia_id)
          VALUES (?, ?, ?, ?, ?)
        `, [submission.title, submission.description, submission.image_url, submission.category_id, wikipediaId], function(insertErr) {
          if (insertErr) {
            reject(insertErr);
            return;
          }
          
          // Update submission status
          dbInstance.run(`
            UPDATE item_submissions 
            SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
            WHERE id = ?
          `, [reviewerId, submissionId], (updateErr) => {
            if (updateErr) reject(updateErr);
            else resolve();
          });
        });
      });
    }

    res.json({
      success: true,
      message: 'Item approved and added to database'
    });
  } catch (error) {
    console.error('Error approving item:', error);
    res.status(500).json({ error: 'Failed to approve item', message: error.message });
  }
};

/**
 * Reject an item submission (admin only)
 * POST /api/admin/item-submissions/:id/reject
 */
const rejectItem = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    const reviewerId = req.user?.id || null;
    const { reason } = req.body;

    if (!submissionId) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const dbType = db.getDbType();
    const dbInstance = db.getDb();

    // Check if submission exists and is pending
    let submission = null;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT id, status FROM item_submissions WHERE id = $1', [submissionId]);
      submission = result.rows[0] || null;
    } else {
      submission = await new Promise((resolve) => {
        dbInstance.get('SELECT id, status FROM item_submissions WHERE id = ?', [submissionId], (err, row) => {
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
        UPDATE item_submissions 
        SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $1, rejection_reason = $2
        WHERE id = $3
      `, [reviewerId, reason, submissionId]);
    } else {
      await new Promise((resolve, reject) => {
        dbInstance.run(`
          UPDATE item_submissions 
          SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, rejection_reason = ?
          WHERE id = ?
        `, [reviewerId, reason, submissionId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({
      success: true,
      message: 'Item rejected'
    });
  } catch (error) {
    console.error('Error rejecting item:', error);
    res.status(500).json({ error: 'Failed to reject item', message: error.message });
  }
};

module.exports = {
  submitItem,
  getItemSubmissions,
  approveItem,
  rejectItem
};
