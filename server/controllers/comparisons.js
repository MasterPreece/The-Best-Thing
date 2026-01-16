const db = require('../database');
const { updateEloRatings } = require('../utils/elo');
const wikipediaFetcher = require('../services/wikipedia-fetcher');

const getRandomComparison = (req, res) => {
  const dbInstance = db.getDb();
  
  // Check if we need to fetch more items (do this in background, don't block)
  wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
    console.error('Error checking/fetching Wikipedia items:', err);
  });
  
  // Helper function to fetch from all items (truly random)
  const fetchFromAllItems = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      // Try with categories join first, fallback to simple query if categories table doesn't exist
      db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        ORDER BY RANDOM()
        LIMIT 2
      `).then(result => {
        if (result.rows.length < 2) {
          return res.status(404).json({ error: 'Not enough items in database' });
        }
        res.json({
          item1: result.rows[0],
          item2: result.rows[1]
        });
      }).catch(err => {
        // If categories table doesn't exist, fallback to simple query
        if (err.code === '42P01' || err.message.includes('does not exist')) {
          console.log('Categories table not found, using simple query');
          return db.query(`
            SELECT id, title, image_url, description, elo_rating
            FROM items
            ORDER BY RANDOM()
            LIMIT 2
          `).then(result => {
            if (result.rows.length < 2) {
              return res.status(404).json({ error: 'Not enough items in database' });
            }
            res.json({
              item1: result.rows[0],
              item2: result.rows[1]
            });
          }).catch(fallbackErr => {
            console.error('Error fetching comparison:', fallbackErr);
            res.status(500).json({ error: 'Failed to fetch comparison' });
          });
        }
        console.error('Error fetching comparison:', err);
        res.status(500).json({ error: 'Failed to fetch comparison' });
      });
      return;
    }
    
    // SQLite - try with categories join, fallback if needed
    dbInstance.all(`
      SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY RANDOM()
      LIMIT 2
    `, (err, rows) => {
      if (err) {
        // If categories table/column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such table: categories') || 
            errorStr.includes('no such column') || 
            errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('Categories not available, using simple query');
          return dbInstance.all(`
            SELECT id, title, image_url, description, elo_rating
            FROM items
            ORDER BY RANDOM()
            LIMIT 2
          `, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              console.error('Error fetching comparison:', fallbackErr);
              return res.status(500).json({ error: 'Failed to fetch comparison' });
            }
            if (fallbackRows.length < 2) {
              return res.status(404).json({ error: 'Not enough items in database' });
            }
            res.json({
              item1: fallbackRows[0],
              item2: fallbackRows[1]
            });
          });
        }
        console.error('Error fetching comparison:', err);
        return res.status(500).json({ error: 'Failed to fetch comparison' });
      }
      
      if (rows.length < 2) {
        return res.status(404).json({ error: 'Not enough items in database' });
      }
      
      res.json({
        item1: rows[0],
        item2: rows[1]
      });
    });
  };
  
  // Get two random items with smart prioritization
  // 40% chance: items needing more comparisons (low comparison_count)
  // 40% chance: items with recent activity (hot/trending)
  // 20% chance: completely random (variety)
  const selectionType = Math.random();
  const usePrioritySelection = selectionType < 0.8;
  
  // Helper to fetch items needing more comparisons
  const fetchItemsNeedingVotes = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      // Get items with fewer comparisons, weighted by their current rating
      // This prioritizes promising items that need more data
      return db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.comparison_count < (SELECT AVG(comparison_count) * 1.5 FROM items)
        ORDER BY (1.0 / (i.comparison_count + 1)) * LOG(i.elo_rating + 1) DESC, RANDOM()
        LIMIT 20
      `).then(result => {
        if (result.rows.length >= 2) {
          // Randomly pick 2 from the top candidates
          const shuffled = result.rows.sort(() => 0.5 - Math.random());
          return res.json({
            item1: shuffled[0],
            item2: shuffled[1]
          });
        }
        return fetchFromAllItems();
      }).catch(() => fetchFromAllItems());
    }
    
    // SQLite version
    dbInstance.all(`
      SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.comparison_count < (SELECT AVG(comparison_count) * 1.5 FROM items)
      ORDER BY (1.0 / (i.comparison_count + 1)) * LOG(i.elo_rating + 1) DESC, RANDOM()
      LIMIT 20
    `, (err, rows) => {
      if (err || !rows || rows.length < 2) {
        return fetchFromAllItems();
      }
      const shuffled = rows.sort(() => 0.5 - Math.random());
      res.json({
        item1: shuffled[0],
        item2: shuffled[1]
      });
    });
  };
  
  // Helper to fetch hot/trending items (recently compared)
  const fetchHotItems = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      // Get items that were compared recently (last 24 hours)
      return db.query(`
        SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
               c.id as category_id, c.name as category_name, c.slug as category_slug,
               COUNT(cmp.id) as recent_comparisons
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
          AND cmp.created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY i.id, c.id
        HAVING COUNT(cmp.id) > 0
        ORDER BY recent_comparisons DESC, RANDOM()
        LIMIT 20
      `).then(result => {
        if (result.rows.length >= 2) {
          const shuffled = result.rows.sort(() => 0.5 - Math.random());
          return res.json({
            item1: shuffled[0],
            item2: shuffled[1]
          });
        }
        // Fallback to items needing votes if no recent activity
        return fetchItemsNeedingVotes();
      }).catch(() => fetchItemsNeedingVotes());
    }
    
    // SQLite version
    dbInstance.all(`
      SELECT DISTINCT i.id, i.title, i.image_url, i.description, i.elo_rating,
             c.id as category_id, c.name as category_name, c.slug as category_slug,
             COUNT(cmp.id) as recent_comparisons
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN comparisons cmp ON (cmp.item1_id = i.id OR cmp.item2_id = i.id)
        AND datetime(cmp.created_at) >= datetime('now', '-24 hours')
      GROUP BY i.id, c.id
      HAVING COUNT(cmp.id) > 0
      ORDER BY recent_comparisons DESC, RANDOM()
      LIMIT 20
    `, (err, rows) => {
      if (err || !rows || rows.length < 2) {
        return fetchItemsNeedingVotes();
      }
      const shuffled = rows.sort(() => 0.5 - Math.random());
      res.json({
        item1: shuffled[0],
        item2: shuffled[1]
      });
    });
  };
  
  // Priority selection logic (80% of the time)
  if (usePrioritySelection) {
    if (selectionType < 0.4) {
      // 40% chance: items needing more votes
      fetchItemsNeedingVotes();
      return;
    } else {
      // 40% chance: hot/trending items
      fetchHotItems();
      return;
    }
  }
  
  // Fall back to existing weighted random logic (20% of the time, or if priority fails)
  // Use a weighted random approach: 50% chance from items with descriptions, 50% from all items
  // This ensures much better variety while still sometimes preferring items with descriptions
  const useWeightedRandom = Math.random() < 0.5;
  
  if (useWeightedRandom) {
    // Try to get items with descriptions first, but fall back to all items if needed
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.description IS NOT NULL AND i.description != ''
        ORDER BY RANDOM()
        LIMIT 2
      `).then(result => {
        if (result.rows.length >= 2) {
          res.json({
            item1: result.rows[0],
            item2: result.rows[1]
          });
        } else {
          fetchFromAllItems();
        }
      }).catch(err => {
        // If categories table doesn't exist, try simple query
        if (err.code === '42P01' || err.message.includes('does not exist')) {
          console.log('Categories table not found, using simple query');
          return db.query(`
            SELECT id, title, image_url, description, elo_rating
            FROM items
            WHERE description IS NOT NULL AND description != ''
            ORDER BY RANDOM()
            LIMIT 2
          `).then(result => {
            if (result.rows.length >= 2) {
              res.json({
                item1: result.rows[0],
                item2: result.rows[1]
              });
            } else {
              fetchFromAllItems();
            }
          }).catch(fallbackErr => {
            console.error('Error fetching comparison:', fallbackErr);
            fetchFromAllItems();
          });
        }
        console.error('Error fetching comparison:', err);
        fetchFromAllItems();
      });
      return;
    }
    
    dbInstance.all(`
      SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.description IS NOT NULL AND i.description != ''
      ORDER BY RANDOM()
      LIMIT 2
    `, (err, rows) => {
      if (err) {
        // If categories table/column doesn't exist, fallback to simple query
        const errorStr = err.message || err.toString() || '';
        if (errorStr.includes('no such table: categories') || 
            errorStr.includes('no such column') || 
            errorStr.includes('category_id') ||
            (err.code === 'SQLITE_ERROR' && errorStr.includes('category'))) {
          console.log('Categories not available, using simple query');
          return dbInstance.all(`
            SELECT id, title, image_url, description, elo_rating
            FROM items
            WHERE description IS NOT NULL AND description != ''
            ORDER BY RANDOM()
            LIMIT 2
          `, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              console.error('Error fetching comparison:', fallbackErr);
              return res.status(500).json({ error: 'Failed to fetch comparison' });
            }
            if (fallbackRows.length >= 2) {
              return res.json({
                item1: fallbackRows[0],
                item2: fallbackRows[1]
              });
            }
            fetchFromAllItems();
          });
        }
        console.error('Error fetching comparison:', err);
        return res.status(500).json({ error: 'Failed to fetch comparison' });
      }
      
      // If we got 2 items with descriptions, use them
      if (rows.length >= 2) {
        return res.json({
          item1: rows[0],
          item2: rows[1]
        });
      }
      
      // Otherwise, fall back to all items
      fetchFromAllItems();
    });
  } else {
    // Get truly random items from all items (50% of the time)
    fetchFromAllItems();
  }
};

/**
 * Get comparison count for a session (to check if account prompt should show)
 */
const getSessionComparisonCount = (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.json({ count: 0 });
  }
  
  const dbInstance = db.getDb();
  
  dbInstance.get(`
    SELECT comparisons_count FROM user_sessions WHERE session_id = ?
  `, [sessionId], (err, row) => {
    if (err) {
      console.error('Error fetching session count:', err);
      return res.json({ count: 0 });
    }
    
    res.json({ count: row ? row.comparisons_count : 0 });
  });
};

const submitVote = (req, res) => {
  const { item1Id, item2Id, winnerId, userSessionId } = req.body;
  
  if (!item1Id || !item2Id || !winnerId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (winnerId !== item1Id && winnerId !== item2Id) {
    return res.status(400).json({ error: 'Winner must be one of the two items' });
  }
  
  const dbInstance = db.getDb();
  const userId = req.userId || null;
  
  // Get current Elo ratings
  dbInstance.get(`
    SELECT elo_rating FROM items WHERE id = ?
  `, [item1Id], (err, item1) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    dbInstance.get(`
      SELECT elo_rating FROM items WHERE id = ?
    `, [item2Id], (err, item2) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Calculate new Elo ratings
      const item1Won = winnerId === item1Id;
      const { newRating1, newRating2 } = updateEloRatings(
        item1.elo_rating,
        item2.elo_rating,
        item1Won
      );
      
      // Insert comparison record (include user_id if authenticated)
      dbInstance.run(`
        INSERT INTO comparisons (item1_id, item2_id, winner_id, user_id, user_session_id)
        VALUES (?, ?, ?, ?, ?)
      `, [item1Id, item2Id, winnerId, userId, userSessionId || null], function(err) {
        if (err) {
          console.error('Error inserting comparison:', err);
          return res.status(500).json({ error: 'Failed to record comparison' });
        }
        
        // Update item ratings and stats
        const updates = [
          {
            rating: newRating1,
            wins: item1Won ? 1 : 0,
            losses: item1Won ? 0 : 1,
            id: item1Id
          },
          {
            rating: newRating2,
            wins: !item1Won ? 1 : 0,
            losses: !item1Won ? 0 : 1,
            id: item2Id
          }
        ];
        
        let completed = 0;
        updates.forEach(update => {
          dbInstance.run(`
            UPDATE items
            SET elo_rating = ?,
                comparison_count = comparison_count + 1,
                wins = wins + ?,
                losses = losses + ?
            WHERE id = ?
          `, [update.rating, update.wins, update.losses, update.id], (err) => {
            if (err) {
              console.error('Error updating item:', err);
            }
            completed++;
            if (completed === 2) {
              // Update user account if authenticated
              if (userId) {
                dbInstance.run(`
                  UPDATE users 
                  SET comparisons_count = comparisons_count + 1,
                      last_active = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [userId], () => {});
              }
              
              // Update user session if provided (for anonymous users) and check if should prompt
              if (userSessionId && !userId) {
                const dbType = db.getDbType();
                // PostgreSQL requires table qualification in ON CONFLICT UPDATE
                const upsertSql = dbType === 'postgres'
                  ? `INSERT INTO user_sessions (session_id, comparisons_count, last_active)
                     VALUES ($1, 1, CURRENT_TIMESTAMP)
                     ON CONFLICT(session_id) DO UPDATE SET
                       comparisons_count = user_sessions.comparisons_count + 1,
                       last_active = CURRENT_TIMESTAMP`
                  : `INSERT INTO user_sessions (session_id, comparisons_count, last_active)
                     VALUES (?, 1, CURRENT_TIMESTAMP)
                     ON CONFLICT(session_id) DO UPDATE SET
                       comparisons_count = comparisons_count + 1,
                       last_active = CURRENT_TIMESTAMP`;
                
                const upsertParams = dbType === 'postgres' ? [userSessionId] : [userSessionId];
                
                if (dbType === 'postgres') {
                  // Use db.query() for PostgreSQL
                  db.query(upsertSql, upsertParams).then(() => {
                    // Get updated count
                    return db.query('SELECT comparisons_count FROM user_sessions WHERE session_id = $1', [userSessionId]);
                  }).then(result => {
                    const comparisonCount = result.rows[0] ? result.rows[0].comparisons_count : 0;
                    const shouldPromptAccount = comparisonCount >= 10;
                    
                    res.json({
                      success: true,
                      newRatings: {
                        item1: newRating1,
                        item2: newRating2
                      },
                      shouldPromptAccount,
                      comparisonCount
                    });
                  }).catch(err => {
                    console.error('Error updating user session (PostgreSQL):', err);
                    // Continue anyway - don't fail the vote if session update fails
                    res.json({
                      success: true,
                      newRatings: {
                        item1: newRating1,
                        item2: newRating2
                      },
                      shouldPromptAccount: false
                    });
                  });
                } else {
                  // Use SQLite callback API
                  dbInstance.run(upsertSql, upsertParams, function(err) {
                  if (err) {
                    console.error('Error updating user session:', err);
                    // Continue anyway - don't fail the vote if session update fails
                  }
                  
                  // Get updated count to determine if we should prompt
                  dbInstance.get(`
                    SELECT comparisons_count FROM user_sessions WHERE session_id = ?
                  `, [userSessionId], (err, row) => {
                    if (err) {
                      console.error('Error getting user session count:', err);
                    }
                    const comparisonCount = row ? row.comparisons_count : 0;
                    const shouldPromptAccount = comparisonCount >= 10;
                    
                    res.json({
                      success: true,
                      newRatings: {
                        item1: newRating1,
                        item2: newRating2
                      },
                      shouldPromptAccount,
                      comparisonCount
                    });
                  });
                  });
                }
              } else {
                res.json({
                  success: true,
                  newRatings: {
                    item1: newRating1,
                    item2: newRating2
                  },
                  shouldPromptAccount: false
                });
              }
            }
          });
        });
      });
    });
  });
};

module.exports = {
  getRandomComparison,
  getSessionComparisonCount,
  submitVote
};
