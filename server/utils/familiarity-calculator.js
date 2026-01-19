// Familiarity score calculator
// Calculates familiarity_score using multiple factors: comparison_count, win_rate, recency, engagement

const MIN_COMPARISONS_FOR_CONFIDENCE = 30;
const COMPARISON_SATURATION_POINT = 50; // Familiarity saturates at 50 comparisons
const RECENCY_DECAY_DAYS = 30; // Recency factor decays over 30 days

/**
 * Calculate comparison factor (0-1)
 * Based on how many times the item has been compared
 * Saturates at COMPARISON_SATURATION_POINT comparisons
 */
const calculateComparisonFactor = (comparisonCount) => {
  return Math.min(1.0, comparisonCount / COMPARISON_SATURATION_POINT);
};

/**
 * Calculate win rate factor (0-1)
 * Based on the item's win rate (higher = more recognized/familiar)
 */
const calculateWinRateFactor = (wins, comparisonCount) => {
  if (comparisonCount === 0) return 0.0;
  return wins / comparisonCount;
};

/**
 * Calculate recency factor (0-1)
 * Based on how recently the item was compared
 * Decays over RECENCY_DECAY_DAYS days
 */
const calculateRecencyFactor = (lastComparedAt) => {
  if (!lastComparedAt) return 0.0;
  
  const now = new Date();
  const lastCompared = new Date(lastComparedAt);
  const daysSince = (now - lastCompared) / (1000 * 60 * 60 * 24);
  
  // Decay over RECENCY_DECAY_DAYS days
  const factor = Math.max(0.0, 1.0 - (daysSince / RECENCY_DECAY_DAYS));
  return factor;
};

/**
 * Calculate engagement factor (0-1)
 * Based on skip count (lower skips = better engagement = more familiar)
 */
const calculateEngagementFactor = (skipCount, comparisonCount) => {
  // Lower skip rate = better engagement
  const totalEngagements = comparisonCount + skipCount || 1;
  const engagementRate = 1.0 - (skipCount / totalEngagements);
  return Math.max(0.0, engagementRate);
};

/**
 * Calculate familiarity score (0-100)
 * Combines multiple factors with weighted formula:
 * - 40% comparison_factor (exposure)
 * - 25% win_rate_factor (recognition)
 * - 20% recency_factor (hotness)
 * - 15% engagement_factor (user engagement)
 */
const calculateFamiliarityScore = (item) => {
  const {
    comparison_count = 0,
    wins = 0,
    last_compared_at = null,
    skip_count = 0
  } = item;
  
  const comparisonFactor = calculateComparisonFactor(comparison_count);
  const winRateFactor = calculateWinRateFactor(wins, comparison_count);
  const recencyFactor = calculateRecencyFactor(last_compared_at);
  const engagementFactor = calculateEngagementFactor(skip_count, comparison_count);
  
  // Weighted combination
  const familiarityScore = (
    comparisonFactor * 0.40 +
    winRateFactor * 0.25 +
    recencyFactor * 0.20 +
    engagementFactor * 0.15
  ) * 100.0;
  
  return Math.max(0.0, Math.min(100.0, familiarityScore));
};

/**
 * Calculate rating confidence (0-1)
 * Based on how many comparisons the item has
 * High confidence at MIN_COMPARISONS_FOR_CONFIDENCE comparisons
 */
const calculateRatingConfidence = (comparisonCount) => {
  if (comparisonCount === 0) return 0.0;
  if (comparisonCount >= MIN_COMPARISONS_FOR_CONFIDENCE) return 1.0;
  return comparisonCount / MIN_COMPARISONS_FOR_CONFIDENCE;
};

/**
 * Incrementally update familiarity score and rating confidence
 * Called after a vote is submitted to update item metrics efficiently
 * @param {Object} db - Database instance from require('../database')
 * @param {number} itemId - Item ID to update
 * @param {Object} updates - Object with flags: familiarityScore, ratingConfidence, lastComparedAt, skipCount
 */
const updateFamiliarityMetrics = async (db, itemId, updates) => {
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  // Get current item data - handle missing columns gracefully
  const getItem = async () => {
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT comparison_count, wins, losses, last_compared_at, skip_count
        FROM items WHERE id = $1
      `, [itemId]);
      return result.rows[0];
    } else {
      return new Promise((resolve, reject) => {
        // Try to get all columns, but if some don't exist, just get what we can
        dbInstance.get(`
          SELECT comparison_count, wins, losses, last_compared_at, skip_count
          FROM items WHERE id = ?
        `, [itemId], (err, row) => {
          if (err) {
            // If error is about missing columns, try with just basic columns
            if (err.message && err.message.includes('no such column')) {
              dbInstance.get(`
                SELECT comparison_count, wins, losses
                FROM items WHERE id = ?
              `, [itemId], (err2, row2) => {
                if (err2) reject(err2);
                else resolve({ ...row2, last_compared_at: null, skip_count: 0 });
              });
            } else {
              reject(err);
            }
          } else {
            resolve(row);
          }
        });
      });
    }
  };
  
  try {
    const item = await getItem();
    if (!item) return;
    
    // Calculate new metrics (only if requested)
    let familiarityScore, ratingConfidence;
    if (updates.familiarityScore) {
      familiarityScore = calculateFamiliarityScore(item);
    }
    if (updates.ratingConfidence) {
      ratingConfidence = calculateRatingConfidence(item.comparison_count);
    }
    
    // Update database
    if (dbType === 'postgres') {
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (updates.familiarityScore) {
        updateFields.push(`familiarity_score = $${paramIndex++}`);
        updateValues.push(familiarityScore);
      }
      if (updates.ratingConfidence) {
        updateFields.push(`rating_confidence = $${paramIndex++}`);
        updateValues.push(ratingConfidence);
      }
      if (updates.lastComparedAt) {
        updateFields.push(`last_compared_at = $${paramIndex++}`);
        updateValues.push(updates.lastComparedAt);
      }
      if (updates.skipCount) {
        // Skip count is handled separately in UPDATE query, not here
        // This flag just means we should recalculate familiarity
      }
      
      if (updateFields.length > 0) {
        updateValues.push(itemId);
        await db.query(`
          UPDATE items 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
        `, updateValues);
      }
    } else {
      const updateFields = [];
      const updateValues = [];
      
      if (updates.familiarityScore) {
        updateFields.push(`familiarity_score = ?`);
        updateValues.push(familiarityScore);
      }
      if (updates.ratingConfidence) {
        updateFields.push(`rating_confidence = ?`);
        updateValues.push(ratingConfidence);
      }
      if (updates.lastComparedAt) {
        updateFields.push(`last_compared_at = ?`);
        updateValues.push(updates.lastComparedAt);
      }
      if (updates.skipCount) {
        // Skip count is handled separately in UPDATE query, not here
        // This flag just means we should recalculate familiarity
      }
      
      if (updateFields.length > 0) {
        updateValues.push(itemId);
        await new Promise((resolve, reject) => {
          dbInstance.run(`
            UPDATE items 
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `, updateValues, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
  } catch (err) {
    // Silently ignore "column doesn't exist" errors - migrations haven't run yet
    if (!err.message || !err.message.includes('no such column')) {
      console.error('Error updating familiarity metrics:', err);
    }
    // Don't throw - this is not critical for the vote to succeed
  }
};

module.exports = {
  calculateFamiliarityScore,
  calculateRatingConfidence,
  updateFamiliarityMetrics,
  MIN_COMPARISONS_FOR_CONFIDENCE
};

