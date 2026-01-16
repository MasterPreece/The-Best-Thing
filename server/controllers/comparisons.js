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
    dbInstance.all(`
      SELECT id, title, image_url, description, elo_rating
      FROM items
      ORDER BY RANDOM()
      LIMIT 2
    `, (err, rows) => {
      if (err) {
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
  
  // Get two random items with better distribution
  // Use a weighted random approach: 50% chance from items with descriptions, 50% from all items
  // This ensures much better variety while still sometimes preferring items with descriptions
  const useWeightedRandom = Math.random() < 0.5;
  
  if (useWeightedRandom) {
    // Try to get items with descriptions first, but fall back to all items if needed
    dbInstance.all(`
      SELECT id, title, image_url, description, elo_rating
      FROM items
      WHERE description IS NOT NULL AND description != ''
      ORDER BY RANDOM()
      LIMIT 2
    `, (err, rows) => {
      if (err) {
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
                dbInstance.run(`
                  INSERT INTO user_sessions (session_id, comparisons_count, last_active)
                  VALUES (?, 1, CURRENT_TIMESTAMP)
                  ON CONFLICT(session_id) DO UPDATE SET
                    comparisons_count = comparisons_count + 1,
                    last_active = CURRENT_TIMESTAMP
                `, [userSessionId], function(err) {
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
