const db = require('../database');
const { updateEloRatings } = require('../utils/elo');
const wikipediaFetcher = require('../services/wikipedia-fetcher');
const { getSelectionThresholds, getCooldownPeriod } = require('../utils/selection-config');
const { updateFamiliarityMetrics } = require('../utils/familiarity-calculator');
const { updateItemMetricsAfterVote } = require('../utils/item-metrics-updater');
const { updateUserStatsInDatabase } = require('../utils/user-stats-calculator');
const settings = require('../utils/settings');

const getRandomComparison = async (req, res) => {
  const dbInstance = db.getDb();
  
  // Check if we need to fetch more items (do this in background, don't block)
  wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
    console.error('Error checking/fetching Wikipedia items:', err);
  });
  
  // Helper function to fetch items by familiarity (50% of selections)
  // Uses familiarity_score for weighted selection
  // Excludes items from recent comparisons (cooldown period)
  const fetchByFamiliarity = async () => {
    const dbType = db.getDbType();
    const cooldownPeriod = await getCooldownPeriod();
    
    if (dbType === 'postgres') {
      // First, get item IDs from recent comparisons to exclude
      // Get items from the last N comparisons (each comparison has 2 items)
      return db.query(`
        SELECT DISTINCT item_id
        FROM (
          SELECT item1_id as item_id FROM comparisons
          WHERE id IN (SELECT id FROM comparisons ORDER BY created_at DESC LIMIT $1)
          UNION
          SELECT item2_id as item_id FROM comparisons
          WHERE id IN (SELECT id FROM comparisons ORDER BY created_at DESC LIMIT $1)
        ) recent_items
      `, [cooldownPeriod]).then(recentItemsResult => {
        const excludedIds = recentItemsResult.rows.map(row => row.item_id).filter(id => id !== null);
        
        // Build query with exclusion
        let exclusionClause = '';
        let queryParams = [];
        
        if (excludedIds.length > 0) {
          exclusionClause = `AND i.id NOT IN (${excludedIds.map((_, i) => `$${i + 1}`).join(', ')})`;
          queryParams = excludedIds;
        }
        
        return db.query(`
          SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
                 i.familiarity_score, i.rating_confidence,
                 c.id as category_id, c.name as category_name, c.slug as category_slug
          FROM items i
          LEFT JOIN categories c ON i.category_id = c.id
          WHERE i.comparison_count >= 0 ${exclusionClause}
          ORDER BY (COALESCE(i.familiarity_score, 0) + 1) * RANDOM() DESC
          LIMIT 20
        `, queryParams).then(result => {
          // If cooldown excluded too many items, try without cooldown
          if (result.rows.length < 2 && excludedIds.length > 0) {
            console.log(`Cooldown excluded ${excludedIds.length} items, retrying without cooldown...`);
            return db.query(`
              SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
                     i.familiarity_score, i.rating_confidence,
                     c.id as category_id, c.name as category_name, c.slug as category_slug
              FROM items i
              LEFT JOIN categories c ON i.category_id = c.id
              WHERE i.comparison_count >= 0
              ORDER BY (COALESCE(i.familiarity_score, 0) + 1) * RANDOM() DESC
              LIMIT 20
            `).then(fallbackResult => {
              if (fallbackResult.rows.length < 2) {
                return res.status(404).json({ error: 'Not enough items in database' });
              }
              const shuffled = fallbackResult.rows.sort(() => Math.random() - 0.5);
              let item1 = shuffled[0];
              let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
              if (item1.id === item2.id && shuffled.length > 1) {
                item2 = shuffled[1];
              }
              res.json({ item1, item2 });
            });
          }
          
          if (result.rows.length < 2) {
            return res.status(404).json({ error: 'Not enough items in database' });
          }
          const shuffled = result.rows.sort(() => Math.random() - 0.5);
          let item1 = shuffled[0];
          let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
          if (item1.id === item2.id && shuffled.length > 1) {
            item2 = shuffled[1];
          }
          res.json({ item1, item2 });
        });
      }).catch(err => {
        // Fallback if familiarity_score column doesn't exist yet
        if (err.code === '42703' || err.message.includes('familiarity_score')) {
          return fetchFromAllItems();
        }
        console.error('Error fetching by familiarity:', err);
        return fetchFromAllItems();
      });
    }
    
    // SQLite version
    // First, get item IDs from recent comparisons to exclude
    // Get items from the last N comparisons (each comparison has 2 items)
    dbInstance.all(`
      SELECT DISTINCT item_id
      FROM (
        SELECT item1_id as item_id FROM comparisons
        WHERE id IN (SELECT id FROM comparisons ORDER BY created_at DESC LIMIT ?)
        UNION
        SELECT item2_id as item_id FROM comparisons
        WHERE id IN (SELECT id FROM comparisons ORDER BY created_at DESC LIMIT ?)
      )
    `, [cooldownPeriod, cooldownPeriod], (err, recentItems) => {
      if (err) {
        console.error('Error fetching recent items for cooldown:', err);
        // Continue without cooldown if query fails
        recentItems = [];
      }
      
      const excludedIds = (recentItems || []).map(row => row.item_id).filter(id => id !== null);
      
      // Build query with exclusion
      let exclusionClause = '';
      let queryParams = [];
      
      if (excludedIds.length > 0) {
        const placeholders = excludedIds.map(() => '?').join(', ');
        exclusionClause = `AND i.id NOT IN (${placeholders})`;
        queryParams = excludedIds;
      }
      
      dbInstance.all(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
               i.familiarity_score, i.rating_confidence,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.comparison_count >= 0 ${exclusionClause}
        ORDER BY (COALESCE(i.familiarity_score, 0) + 1) * (ABS(RANDOM()) % 1000000) DESC
        LIMIT 20
      `, queryParams, (err, rows) => {
        if (err) {
          const errorStr = err.message || err.toString() || '';
          if (errorStr.includes('familiarity_score') || errorStr.includes('no such column')) {
            return fetchFromAllItems();
          }
          console.error('Error fetching by familiarity:', err);
          return fetchFromAllItems();
        }
        
        // If cooldown excluded too many items, try without cooldown
        if (rows.length < 2 && excludedIds.length > 0) {
          console.log(`Cooldown excluded ${excludedIds.length} items, retrying without cooldown...`);
          dbInstance.all(`
            SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
                   i.familiarity_score, i.rating_confidence,
                   c.id as category_id, c.name as category_name, c.slug as category_slug
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.comparison_count >= 0
            ORDER BY (COALESCE(i.familiarity_score, 0) + 1) * (ABS(RANDOM()) % 1000000) DESC
            LIMIT 20
          `, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              return fetchFromAllItems();
            }
            
            if (fallbackRows.length < 2) {
              return res.status(404).json({ error: 'Not enough items in database' });
            }
            
            const shuffled = fallbackRows.sort(() => Math.random() - 0.5);
            let item1 = shuffled[0];
            let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
            if (item1.id === item2.id && shuffled.length > 1) {
              item2 = shuffled[1];
            }
            res.json({ item1, item2 });
          });
          return;
        }
        
        if (rows.length < 2) {
          return res.status(404).json({ error: 'Not enough items in database' });
        }
        
        const shuffled = rows.sort(() => Math.random() - 0.5);
        let item1 = shuffled[0];
        let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
        if (item1.id === item2.id && shuffled.length > 1) {
          item2 = shuffled[1];
        }
        res.json({ item1, item2 });
      });
    });
  };
  
  // Helper function to fetch from all items (weighted toward familiar items)
  // Ensures item1 != item2 and better variety
  // Fallback function used when familiarity_score is not available
  const fetchFromAllItems = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      // Get more items (10) and randomly pick 2 to ensure variety
      db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.comparison_count >= 1 OR RANDOM() < 0.1
        ORDER BY (i.comparison_count + 1) * RANDOM() DESC
        LIMIT 10
      `).then(result => {
        if (result.rows.length < 2) {
          return res.status(404).json({ error: 'Not enough items in database' });
        }
        // Shuffle and pick 2 different items
        const shuffled = result.rows.sort(() => Math.random() - 0.5);
        let item1 = shuffled[0];
        let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
        
        // Ensure they're different
        if (item1.id === item2.id && shuffled.length > 1) {
          item2 = shuffled[1];
        }
        
        res.json({
          item1,
          item2
        });
      }).catch(err => {
        // If categories table doesn't exist, fallback to simple query
        if (err.code === '42P01' || err.message.includes('does not exist')) {
          console.log('Categories table not found, using simple query');
          return db.query(`
            SELECT id, title, image_url, description, elo_rating, comparison_count
            FROM items
            WHERE comparison_count >= 1 OR RANDOM() < 0.1
            ORDER BY (comparison_count + 1) * RANDOM() DESC
            LIMIT 10
          `).then(result => {
            if (result.rows.length < 2) {
              return res.status(404).json({ error: 'Not enough items in database' });
            }
            const shuffled = result.rows.sort(() => Math.random() - 0.5);
            let item1 = shuffled[0];
            let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
            if (item1.id === item2.id && shuffled.length > 1) {
              item2 = shuffled[1];
            }
            res.json({
              item1,
              item2
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
    // Weight selection toward items with more comparisons (more familiar/recognizable)
    dbInstance.all(`
      SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.comparison_count >= 1 OR (ABS(RANDOM()) % 10) < 1
      ORDER BY (i.comparison_count + 1) * (ABS(RANDOM()) % 1000000) DESC
      LIMIT 10
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
            SELECT id, title, image_url, description, elo_rating, comparison_count
            FROM items
            WHERE comparison_count >= 1 OR (ABS(RANDOM()) % 10) < 1
            ORDER BY (comparison_count + 1) * (ABS(RANDOM()) % 1000000) DESC
            LIMIT 10
          `, (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
              console.error('Error fetching comparison:', fallbackErr);
              return res.status(500).json({ error: 'Failed to fetch comparison' });
            }
            if (fallbackRows.length < 2) {
              return res.status(404).json({ error: 'Not enough items in database' });
            }
            const shuffled = fallbackRows.sort(() => Math.random() - 0.5);
            let item1 = shuffled[0];
            let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
            if (item1.id === item2.id && shuffled.length > 1) {
              item2 = shuffled[1];
            }
            res.json({
              item1,
              item2
            });
          });
        }
        console.error('Error fetching comparison:', err);
        return res.status(500).json({ error: 'Failed to fetch comparison' });
      }
      
      if (rows.length < 2) {
        return res.status(404).json({ error: 'Not enough items in database' });
      }
      
      // Shuffle and pick 2 different items
      const shuffled = rows.sort(() => Math.random() - 0.5);
      let item1 = shuffled[0];
      let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
      if (item1.id === item2.id && shuffled.length > 1) {
        item2 = shuffled[1];
      }
      
      res.json({
        item1,
        item2
      });
    });
  };
  
  // Get two random items with smart prioritization based on familiarity
  // 70% chance: familiarity-weighted selection (items with higher familiarity_score)
  // 15% chance: items needing more votes (low confidence, low comparison_count)
  // 15% chance: completely random (variety)
  const thresholds = getSelectionThresholds();
  const selectionType = Math.random();
  
  // Helper to fetch items needing more comparisons (low confidence)
  const fetchItemsNeedingVotes = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      // Get items with low rating confidence, weighted by needing more data
      return db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.rating_confidence,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE COALESCE(i.rating_confidence, 0) < 0.8 OR i.comparison_count < 20
        ORDER BY (1.0 - COALESCE(i.rating_confidence, 0)) * (1.0 / (i.comparison_count + 1)) DESC, RANDOM()
        LIMIT 20
      `).then(result => {
        if (result.rows.length >= 2) {
          // Randomly pick 2 from the top candidates, ensuring they're different
          const shuffled = result.rows.sort(() => Math.random() - 0.5);
          let item1 = shuffled[0];
          let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
          if (item1.id === item2.id && shuffled.length > 1) {
            item2 = shuffled[1];
          }
          return res.json({
            item1,
            item2
          });
        }
        return fetchFromAllItems();
      }).catch(() => fetchFromAllItems());
    }
    
    // SQLite version
    dbInstance.all(`
      Promise.all([
        settings.getItemsNeedingVotesConfidenceThreshold(),
        settings.getItemsNeedingVotesComparisonThreshold()
      ]).then(([confidenceThreshold, comparisonThreshold]) => {
        return new Promise((resolve, reject) => {
          dbInstance.all(`
            SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.rating_confidence,
                   c.id as category_id, c.name as category_name, c.slug as category_slug
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE COALESCE(i.rating_confidence, 0) < ? OR i.comparison_count < ?
            ORDER BY (1.0 - COALESCE(i.rating_confidence, 0)) * (1.0 / (i.comparison_count + 1)) DESC, RANDOM()
            LIMIT 20
          `, [confidenceThreshold, comparisonThreshold], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      }).then(rows => {
    `, (err, rows) => {
      if (err || !rows || rows.length < 2) {
        return fetchFromAllItems();
      }
      const shuffled = rows.sort(() => Math.random() - 0.5);
      let item1 = shuffled[0];
      let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
      if (item1.id === item2.id && shuffled.length > 1) {
        item2 = shuffled[1];
      }
      res.json({
        item1,
        item2
      });
    });
  };
  
  // Helper to fetch truly random items (pure variety)
  const fetchRandomItems = () => {
    const dbType = db.getDbType();
    if (dbType === 'postgres') {
      return db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
               c.id as category_id, c.name as category_name, c.slug as category_slug
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        ORDER BY RANDOM()
        LIMIT 20
      `).then(result => {
        if (result.rows.length >= 2) {
          const shuffled = result.rows.sort(() => Math.random() - 0.5);
          let item1 = shuffled[0];
          let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
          if (item1.id === item2.id && shuffled.length > 1) {
            item2 = shuffled[1];
          }
          res.json({ item1, item2 });
        } else {
          return fetchFromAllItems();
        }
      }).catch(() => fetchFromAllItems());
    }
    
    // SQLite version
    dbInstance.all(`
      SELECT i.id, i.title, i.image_url, i.description, i.elo_rating,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY RANDOM()
      LIMIT 20
    `, (err, rows) => {
      if (err || !rows || rows.length < 2) {
        return fetchFromAllItems();
      }
      const shuffled = rows.sort(() => Math.random() - 0.5);
      let item1 = shuffled[0];
      let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
      if (item1.id === item2.id && shuffled.length > 1) {
        item2 = shuffled[1];
      }
      res.json({ item1, item2 });
    });
  };
  
  // Main selection logic: 50% familiarity, 50% variety (25% items needing votes, 25% random)
  if (selectionType < thresholds.familiarityThreshold) {
    // 50%: Familiarity-weighted selection
    fetchByFamiliarity();
  } else if (selectionType < thresholds.itemsNeedingVotesThreshold) {
    // 25%: Items needing more votes (low confidence)
    fetchItemsNeedingVotes();
  } else {
    // 25%: True random variety
    fetchRandomItems();
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
  
  // Get current Elo ratings and confidence (rating_confidence may not exist yet if migration hasn't run)
  // Try to get both columns, but handle gracefully if rating_confidence doesn't exist
  dbInstance.get(`
    SELECT elo_rating, rating_confidence FROM items WHERE id = ?
  `, [item1Id], (err, item1) => {
    if (err) {
      // If rating_confidence column doesn't exist, try without it
      if (err.message && err.message.includes('rating_confidence')) {
        return dbInstance.get(`
          SELECT elo_rating FROM items WHERE id = ?
        `, [item1Id], (err, item1) => {
          if (err) {
            console.error('Error fetching item1:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          item1.rating_confidence = 0;
          fetchItem2(item1);
        });
      }
      console.error('Error fetching item1:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!item1.rating_confidence) item1.rating_confidence = 0;
    fetchItem2(item1);
  });
  
  const fetchItem2 = (item1Data) => {
    dbInstance.get(`
      SELECT elo_rating, rating_confidence FROM items WHERE id = ?
    `, [item2Id], (err, item2) => {
      if (err) {
        // If rating_confidence column doesn't exist, try without it
        if (err.message && err.message.includes('rating_confidence')) {
          return dbInstance.get(`
            SELECT elo_rating FROM items WHERE id = ?
          `, [item2Id], (err, item2) => {
            if (err) {
              console.error('Error fetching item2:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            item2.rating_confidence = 0;
            processVote(item1Data, item2);
          });
        }
        console.error('Error fetching item2:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!item2.rating_confidence) item2.rating_confidence = 0;
      processVote(item1Data, item2).catch(err => {
        console.error('Error in processVote:', err);
        return res.status(500).json({ error: 'Failed to process vote' });
      });
    });
  };
  
  const processVote = async (item1Data, item2Data) => {
    // Calculate new Elo ratings with dynamic K-factor based on confidence
    const item1Won = winnerId === item1Id;
    const confidence1 = item1Data.rating_confidence || 0;
    const confidence2 = item2Data.rating_confidence || 0;
    const { newRating1, newRating2 } = await updateEloRatings(
      item1Data.elo_rating,
      item2Data.elo_rating,
      item1Won,
      confidence1,
      confidence2
    );

    // Calculate rating difference and detect upsets
    const ratingDiff = Math.abs(item1Data.elo_rating - item2Data.elo_rating);
    const winnerRating = item1Won ? item1Data.elo_rating : item2Data.elo_rating;
    const loserRating = item1Won ? item2Data.elo_rating : item1Data.elo_rating;
    const upsetThreshold = await settings.getUpsetThreshold();
    const wasUpset = ratingDiff > upsetThreshold && winnerRating < loserRating;
    
    // Insert comparison record with rating_difference and was_upset (include user_id if authenticated)
    const dbType = db.getDbType();
    const insertSql = dbType === 'postgres'
      ? `INSERT INTO comparisons (item1_id, item2_id, winner_id, user_id, user_session_id, rating_difference, was_upset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`
      : `INSERT INTO comparisons (item1_id, item2_id, winner_id, user_id, user_session_id, rating_difference, was_upset)
         VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    const insertParams = dbType === 'postgres'
      ? [item1Id, item2Id, winnerId, userId, userSessionId || null, ratingDiff, wasUpset]
      : [item1Id, item2Id, winnerId, userId, userSessionId || null, ratingDiff, wasUpset ? 1 : 0];

    dbInstance.run(insertSql, insertParams, function(err) {
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
        const now = new Date().toISOString();
        
        // Store wasUpset in response for frontend feedback
        const responseData = {
          success: true,
          newRatings: {
            item1: newRating1,
            item2: newRating2
          },
          wasUpset: wasUpset
        };
        
        // Update item metrics (peak rating, streaks, upsets) - async, non-blocking
        const winnerIdFinal = item1Won ? item1Id : item2Id;
        const loserIdFinal = item1Won ? item2Id : item1Id;
        updateItemMetricsAfterVote(winnerIdFinal, loserIdFinal, 
          item1Won ? newRating1 : newRating2, 
          item1Won ? newRating2 : newRating1, 
          wasUpset
        ).catch(err => {
          console.error('Error updating item metrics:', err);
        });
        
        updates.forEach(update => {
          // Update item with new rating, stats, and last_compared_at
          // Build SQL without last_compared_at to avoid errors if column doesn't exist
          // last_compared_at is handled separately by updateFamiliarityMetrics
          const updateSql = dbType === 'postgres'
            ? `UPDATE items
               SET elo_rating = $1,
                   comparison_count = comparison_count + 1,
                   wins = wins + $2,
                   losses = losses + $3
               WHERE id = $4`
            : `UPDATE items
               SET elo_rating = ?,
                   comparison_count = comparison_count + 1,
                   wins = wins + ?,
                   losses = losses + ?
               WHERE id = ?`;
          
          const updateParams = dbType === 'postgres'
            ? [update.rating, update.wins, update.losses, update.id]
            : [update.rating, update.wins, update.losses, update.id];
          
          dbInstance.run(updateSql, updateParams, (err) => {
            if (err) {
              // Silently ignore "column doesn't exist" errors - migrations haven't run yet
              if (!err.message || !err.message.includes('no such column')) {
                console.error('Error updating item:', err);
              }
            }
            completed++;
            if (completed === 2) {
              // Update familiarity and rating confidence for both items (async, non-blocking)
              updateFamiliarityMetrics(db, item1Id, {
                lastComparedAt: now,
                familiarityScore: true,
                ratingConfidence: true
              }).catch(err => {
                // Silently ignore "column doesn't exist" errors - migrations haven't run yet
                if (!err.message || !err.message.includes('no such column')) {
                  console.error('Error updating familiarity for item1:', err);
                }
              });
              
              updateFamiliarityMetrics(db, item2Id, {
                lastComparedAt: now,
                familiarityScore: true,
                ratingConfidence: true
              }).catch(err => {
                // Silently ignore "column doesn't exist" errors - migrations haven't run yet
                if (!err.message || !err.message.includes('no such column')) {
                  console.error('Error updating familiarity for item2:', err);
                }
              });
              // Update user account if authenticated
              if (userId) {
                dbInstance.run(`
                  UPDATE users 
                  SET comparisons_count = comparisons_count + 1,
                      last_active = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [userId], () => {});
                
                // Update user statistics (upset picks, patterns) - async, non-blocking
                updateUserStatsInDatabase(userId).catch(err => {
                  // Silently ignore "column doesn't exist" errors - migrations haven't run yet
                  if (!err.message || !err.message.includes('no such column')) {
                    console.error('Error updating user stats:', err);
                  }
                });
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
                  console.log('[PostgreSQL] Updating user session:', userSessionId);
                  db.query(upsertSql, upsertParams).then((insertResult) => {
                    console.log('[PostgreSQL] User session upsert successful, rows:', insertResult.rowCount);
                    // Get updated count
                    return db.query('SELECT comparisons_count FROM user_sessions WHERE session_id = $1', [userSessionId]);
                  }).then(result => {
                    console.log('[PostgreSQL] Fetched session count:', result.rows[0]);
                    const comparisonCount = result.rows[0] ? result.rows[0].comparisons_count : 0;
                    const shouldPromptAccount = comparisonCount >= 10;
                    
                    res.json({
                      ...responseData,
                      shouldPromptAccount,
                      comparisonCount
                    });
                  }).catch(err => {
                    console.error('[PostgreSQL] Error updating user session:', err);
                    console.error('[PostgreSQL] SQL:', upsertSql);
                    console.error('[PostgreSQL] Params:', upsertParams);
                    // Continue anyway - don't fail the vote if session update fails
                    res.json({
                      ...responseData,
                      shouldPromptAccount: false
                    });
                  });
                } else {
                  // Use SQLite callback API
                  // Note: upsertSql already has correct SQLite syntax for this branch
                  dbInstance.run(upsertSql, upsertParams, function(err) {
                    if (err) {
                      console.error('[SQLite] Error updating user session:', err);
                      console.error('[SQLite] SQL:', upsertSql);
                      console.error('[SQLite] Params:', upsertParams);
                      // Continue anyway - don't fail the vote if session update fails
                      // Still send response even if session update failed
                      return res.json({
                        ...responseData,
                        shouldPromptAccount: false
                      });
                    }
                    
                    // Get updated count to determine if we should prompt
                    dbInstance.get(`
                      SELECT comparisons_count FROM user_sessions WHERE session_id = ?
                    `, [userSessionId], (err, row) => {
                      if (err) {
                        console.error('[SQLite] Error getting user session count:', err);
                      }
                      const comparisonCount = row ? row.comparisons_count : 0;
                      const shouldPromptAccount = comparisonCount >= 10;
                      
                      res.json({
                        ...responseData,
                        shouldPromptAccount,
                        comparisonCount
                      });
                    });
                  });
                }
              } else {
                res.json({
                  ...responseData,
                  shouldPromptAccount: false
                });
              }
            }
          });
        });
      });
    };
  };

/**
 * Handle skip comparison - update skip_count and last_compared_at for both items
 */
const submitSkip = (req, res) => {
  const { item1Id, item2Id, userSessionId } = req.body;
  
  if (!item1Id || !item2Id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  const now = new Date().toISOString();
  
  // Update both items: increment skip_count and update last_compared_at
  // This doesn't affect ELO ratings, but does track engagement
  let completed = 0;
  
  [item1Id, item2Id].forEach(itemId => {
    // Only update skip_count - last_compared_at is handled by updateFamiliarityMetrics
    // This avoids errors if columns don't exist yet
    const updateSql = dbType === 'postgres'
      ? `UPDATE items
         SET skip_count = COALESCE(skip_count, 0) + 1
         WHERE id = $1`
      : `UPDATE items
         SET skip_count = COALESCE(skip_count, 0) + 1
         WHERE id = ?`;
    
    const updateParams = dbType === 'postgres' ? [itemId] : [itemId];
    
    dbInstance.run(updateSql, updateParams, (err) => {
      if (err) {
        // Silently ignore "column doesn't exist" errors - migrations haven't run yet
        if (!err.message || !err.message.includes('no such column')) {
          console.error('Error updating skip count:', err);
        }
      }
      completed++;
      
      if (completed === 2) {
        // Update familiarity metrics for both items (async, non-blocking)
        // Skip reduces engagement factor, so familiarity may decrease slightly
        updateFamiliarityMetrics(db, item1Id, {
          lastComparedAt: now,
          skipCount: true,
          familiarityScore: true
        }).catch(err => {
          // Silently ignore "column doesn't exist" errors - migrations haven't run yet
          if (!err.message || !err.message.includes('no such column')) {
            console.error('Error updating familiarity after skip for item1:', err);
          }
        });
        
        updateFamiliarityMetrics(db, item2Id, {
          lastComparedAt: now,
          skipCount: true,
          familiarityScore: true
        }).catch(err => {
          // Silently ignore "column doesn't exist" errors - migrations haven't run yet
          if (!err.message || !err.message.includes('no such column')) {
            console.error('Error updating familiarity after skip for item2:', err);
          }
        });
        
        res.json({
          success: true,
          message: 'Comparison skipped'
        });
      }
    });
  });
};

module.exports = {
  getRandomComparison,
  getSessionComparisonCount,
  submitVote,
  submitSkip
};
