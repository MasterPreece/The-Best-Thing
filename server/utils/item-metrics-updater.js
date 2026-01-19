const db = require('../database');

/**
 * Update peak rating if new rating exceeds current peak
 */
const updatePeakRating = (dbInstance, itemId, newRating, dbType) => {
  return new Promise((resolve, reject) => {
    // First get current peak_rating - handle if column doesn't exist
    dbInstance.get(`
      SELECT peak_rating FROM items WHERE id = ?
    `, [itemId], (err, row) => {
      if (err && err.message && err.message.includes('no such column: peak_rating')) {
        // Column doesn't exist yet, skip this update
        return resolve();
      }
      if (err) {
        console.error('Error checking peak rating:', err);
        return resolve(); // Don't fail, just continue
      }

      const currentPeak = row?.peak_rating;
      
      // If new rating is higher than peak (or peak is null), update it
      if (currentPeak === null || newRating > currentPeak) {
        const now = new Date().toISOString();
        const updateSql = dbType === 'postgres'
          ? `UPDATE items SET peak_rating = $1, peak_rating_date = $2 WHERE id = $3`
          : `UPDATE items SET peak_rating = ?, peak_rating_date = ? WHERE id = ?`;
        
        const params = dbType === 'postgres' ? [newRating, now, itemId] : [newRating, now, itemId];
        
        dbInstance.run(updateSql, params, (err) => {
          if (err) {
            // Silently ignore "column doesn't exist" errors - migrations haven't run yet
            if (!err.message || !err.message.includes('no such column')) {
              console.error('Error updating peak rating:', err);
            }
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
};

/**
 * Update streak counters for an item after a vote
 * @param {boolean} won - Whether the item won the comparison
 */
const updateStreaks = (dbInstance, itemId, won, dbType) => {
  return new Promise((resolve, reject) => {
    // Get current streak values - handle if columns don't exist
    dbInstance.get(`
      SELECT current_streak_wins, current_streak_losses, longest_win_streak 
      FROM items WHERE id = ?
    `, [itemId], (err, row) => {
      if (err && err.message && err.message.includes('no such column')) {
        // Columns don't exist yet, skip this update
        return resolve();
      }
      if (err) {
        console.error('Error fetching streaks:', err);
        return resolve();
      }

      const currentWins = (row?.current_streak_wins || 0);
      const currentLosses = (row?.current_streak_losses || 0);
      const longestWinStreak = (row?.longest_win_streak || 0);

      let newWins, newLosses, newLongest;

      if (won) {
        newWins = currentWins + 1;
        newLosses = 0;
        newLongest = Math.max(longestWinStreak, newWins);
      } else {
        newWins = 0;
        newLosses = currentLosses + 1;
        newLongest = longestWinStreak;
      }

      const updateSql = dbType === 'postgres'
        ? `UPDATE items 
           SET current_streak_wins = $1, 
               current_streak_losses = $2,
               longest_win_streak = $3
           WHERE id = $4`
        : `UPDATE items 
           SET current_streak_wins = ?, 
               current_streak_losses = ?,
               longest_win_streak = ?
           WHERE id = ?`;

      const params = dbType === 'postgres' 
        ? [newWins, newLosses, newLongest, itemId]
        : [newWins, newLosses, newLongest, itemId];

      dbInstance.run(updateSql, params, (err) => {
        if (err) {
          // Silently ignore "column doesn't exist" errors - migrations haven't run yet
          if (!err.message || !err.message.includes('no such column')) {
            console.error('Error updating streaks:', err);
          }
        }
        resolve();
      });
    });
  });
};

/**
 * Increment upset_win_count for an item that won as an underdog
 */
const incrementUpsetWinCount = (dbInstance, itemId, dbType) => {
  return new Promise((resolve) => {
    const updateSql = dbType === 'postgres'
      ? `UPDATE items SET upset_win_count = COALESCE(upset_win_count, 0) + 1 WHERE id = $1`
      : `UPDATE items SET upset_win_count = COALESCE(upset_win_count, 0) + 1 WHERE id = ?`;

    const params = dbType === 'postgres' ? [itemId] : [itemId];

    dbInstance.run(updateSql, params, (err) => {
      if (err) {
        console.error('Error incrementing upset win count:', err);
      }
      resolve();
    });
  });
};

/**
 * Update first_vote_date if this is the item's first comparison
 */
const updateFirstVoteDate = (dbInstance, itemId, dbType) => {
  return new Promise((resolve) => {
    // Only update if first_vote_date is NULL
    const updateSql = dbType === 'postgres'
      ? `UPDATE items SET first_vote_date = CURRENT_TIMESTAMP WHERE id = $1 AND first_vote_date IS NULL`
      : `UPDATE items SET first_vote_date = CURRENT_TIMESTAMP WHERE id = ? AND first_vote_date IS NULL`;

    const params = dbType === 'postgres' ? [itemId] : [itemId];

    dbInstance.run(updateSql, params, (err) => {
      if (err) {
        // Column might not exist yet, ignore error
        if (!err.message.includes('no such column')) {
          console.error('Error updating first_vote_date:', err);
        }
      }
      resolve();
    });
  });
};

/**
 * Update multiple item metrics after a vote
 * @param {number} winnerId - ID of winning item
 * @param {number} loserId - ID of losing item
 * @param {number} winnerNewRating - New ELO rating for winner
 * @param {number} loserNewRating - New ELO rating for loser
 * @param {boolean} wasUpset - Whether this was an upset (winner had lower initial rating)
 */
const updateItemMetricsAfterVote = async (winnerId, loserId, winnerNewRating, loserNewRating, wasUpset = false) => {
  const dbInstance = db.getDb();
  const dbType = db.getDbType();

  try {
    // Update peak ratings for both items
    await updatePeakRating(dbInstance, winnerId, winnerNewRating, dbType);
    await updatePeakRating(dbInstance, loserId, loserNewRating, dbType);

    // Update streaks (winner won, loser lost)
    await updateStreaks(dbInstance, winnerId, true, dbType);
    await updateStreaks(dbInstance, loserId, false, dbType);

    // If it was an upset, increment upset_win_count for winner
    if (wasUpset) {
      await incrementUpsetWinCount(dbInstance, winnerId, dbType);
    }

    // Update first_vote_date if needed (only for items with first vote)
    await updateFirstVoteDate(dbInstance, winnerId, dbType);
    await updateFirstVoteDate(dbInstance, loserId, dbType);

  } catch (err) {
    console.error('Error updating item metrics:', err);
    // Don't throw - metrics are non-critical
  }
};

module.exports = {
  updatePeakRating,
  updateStreaks,
  incrementUpsetWinCount,
  updateFirstVoteDate,
  updateItemMetricsAfterVote
};

