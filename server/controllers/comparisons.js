const db = require('../database');
const { updateEloRatings } = require('../utils/elo');
const wikipediaFetcher = require('../services/wikipedia-fetcher');
// Removed unused selection-config imports - using simple weighted random now
const { updateFamiliarityMetrics } = require('../utils/familiarity-calculator');
const { updateItemMetricsAfterVote } = require('../utils/item-metrics-updater');
const { updateUserStatsInDatabase } = require('../utils/user-stats-calculator');
const settings = require('../utils/settings');
const { getSimilarityGroup, calculateDiversityPenalty } = require('../utils/similarity-detector');

const getRandomComparison = async (req, res) => {
  const dbInstance = db.getDb();
  
  // Check if we need to fetch more items (do this in background, don't block)
  wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
    console.error('Error checking/fetching Wikipedia items:', err);
  });
  
  // Get user session ID from query or body (for user-specific recency tracking)
  const userSessionId = req.query.sessionId || req.body?.userSessionId || null;
  
  // Helper function to get recently seen items with recency ranking
  // Returns a map of item_id -> comparisons_ago (how many comparisons ago it was seen, 1 = most recent)
  const getRecentlySeenItems = async () => {
    if (!userSessionId) {
      return new Map(); // No session ID, return empty map
    }
    
    const dbType = db.getDbType();
    const recentLimit = 50; // Get last 50 comparisons for recency calculation
    
    if (dbType === 'postgres') {
      try {
        const result = await db.query(`
          WITH recent_comparisons AS (
            SELECT id, created_at
            FROM comparisons
            WHERE user_session_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          ),
          recent_items AS (
            SELECT item1_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (SELECT id FROM recent_comparisons)
            UNION ALL
            SELECT item2_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (SELECT id FROM recent_comparisons)
          ),
          ranked_items AS (
            SELECT 
              item_id,
              ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY comparison_id DESC) as comparisons_ago
            FROM recent_items
            WHERE item_id IS NOT NULL
          )
          SELECT item_id, MIN(comparisons_ago) as comparisons_ago
          FROM ranked_items
          GROUP BY item_id
        `, [userSessionId, recentLimit]);
        
        const recencyMap = new Map();
        result.rows.forEach(row => {
          recencyMap.set(row.item_id, row.comparisons_ago);
        });
        return recencyMap;
      } catch (err) {
        console.error('Error fetching recently seen items:', err);
        return new Map();
      }
    } else {
      // SQLite version - simpler approach: get recent comparisons and number them
      return new Promise((resolve) => {
        dbInstance.all(`
          SELECT id, created_at
          FROM comparisons
          WHERE user_session_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `, [userSessionId, recentLimit], (err, recentComparisons) => {
          if (err) {
            console.error('Error fetching recent comparisons:', err);
            resolve(new Map());
            return;
          }
          
          if (!recentComparisons || recentComparisons.length === 0) {
            resolve(new Map());
      return;
    }
    
          // Get all items from these comparisons
          const comparisonIds = recentComparisons.map(c => c.id);
          const placeholders = comparisonIds.map(() => '?').join(',');
          
    dbInstance.all(`
            SELECT item1_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (${placeholders})
            UNION ALL
            SELECT item2_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (${placeholders})
          `, [...comparisonIds, ...comparisonIds], (err2, items) => {
            if (err2) {
              console.error('Error fetching items from comparisons:', err2);
              resolve(new Map());
              return;
            }
            
            // Create a map of item_id -> most recent comparison rank (1 = most recent)
            const recencyMap = new Map();
            const itemToRank = new Map();
            
            // Number the comparisons (1 = most recent)
            recentComparisons.forEach((comp, index) => {
              itemToRank.set(comp.id, index + 1);
            });
            
            // For each item, find its most recent appearance
            (items || []).forEach(item => {
              if (item.item_id) {
                const rank = itemToRank.get(item.comparison_id);
                if (rank) {
                  const currentRank = recencyMap.get(item.item_id);
                  if (!currentRank || rank < currentRank) {
                    recencyMap.set(item.item_id, rank);
                  }
                }
              }
            });
            
            console.log(`[Recency] Found ${recencyMap.size} recently seen items for session: ${userSessionId}`);
            resolve(recencyMap);
          });
            });
          });
        }
  };
  
  // Helper function to get recently seen similarity groups
  // Returns a map of similarity_group -> comparisons_ago (how many comparisons ago that group was seen)
  const getRecentlySeenSimilarityGroups = async () => {
    if (!userSessionId) {
      return new Map(); // No session ID, return empty map
    }
    
    const dbType = db.getDbType();
    const recentLimit = 20; // Get last 20 comparisons for diversity calculation
    const lookbackCount = await settings.getDiversityLookbackCount();
    
    if (dbType === 'postgres') {
      try {
        const result = await db.query(`
          WITH recent_comparisons AS (
            SELECT id, created_at
            FROM comparisons
            WHERE user_session_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          ),
          recent_items AS (
            SELECT item1_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (SELECT id FROM recent_comparisons)
            UNION ALL
            SELECT item2_id as item_id, id as comparison_id
            FROM comparisons
            WHERE id IN (SELECT id FROM recent_comparisons)
          ),
          items_with_titles AS (
            SELECT DISTINCT ri.item_id, ri.comparison_id, i.title
            FROM recent_items ri
            JOIN items i ON ri.item_id = i.id
            WHERE ri.item_id IS NOT NULL
          ),
          ranked_groups AS (
            SELECT 
              iwt.title,
              iwt.comparison_id,
              ROW_NUMBER() OVER (ORDER BY iwt.comparison_id DESC) as comparisons_ago
            FROM items_with_titles iwt
          )
          SELECT title, MIN(comparisons_ago) as comparisons_ago
          FROM ranked_groups
          GROUP BY title
        `, [userSessionId, recentLimit]);
        
        const groupMap = new Map();
        for (const row of result.rows) {
          const similarityGroup = getSimilarityGroup(row.title);
          if (similarityGroup) {
            const comparisonsAgo = parseInt(row.comparisons_ago);
            const currentAgo = groupMap.get(similarityGroup);
            if (!currentAgo || comparisonsAgo < currentAgo) {
              groupMap.set(similarityGroup, comparisonsAgo);
            }
          }
        }
        
        return groupMap;
      } catch (err) {
        console.error('Error fetching recently seen similarity groups (PostgreSQL):', err);
        return new Map();
      }
    } else {
      // SQLite version
      return new Promise((resolve) => {
        dbInstance.all(`
          SELECT c.id, c.created_at
          FROM comparisons c
          WHERE c.user_session_id = ?
          ORDER BY c.created_at DESC
          LIMIT ?
        `, [userSessionId, recentLimit], (err, recentComparisons) => {
          if (err || !recentComparisons || recentComparisons.length === 0) {
            resolve(new Map());
            return;
          }
          
          const comparisonIds = recentComparisons.map(c => c.id);
          const placeholders = comparisonIds.map(() => '?').join(',');
          
          dbInstance.all(`
            SELECT DISTINCT i.id, i.title, c.id as comparison_id
            FROM comparisons c
            JOIN items i ON (c.item1_id = i.id OR c.item2_id = i.id)
            WHERE c.id IN (${placeholders})
            ORDER BY c.id DESC
          `, comparisonIds, (err2, items) => {
            if (err2) {
              console.error('Error fetching items for similarity groups:', err2);
              resolve(new Map());
              return;
            }
            
            const groupMap = new Map();
            const itemToRank = new Map();
            
            // Number the comparisons (1 = most recent)
            recentComparisons.forEach((comp, index) => {
              itemToRank.set(comp.id, index + 1);
            });
            
            // For each item, find its similarity group and most recent appearance
            (items || []).forEach(item => {
              if (item.title) {
                const similarityGroup = getSimilarityGroup(item.title);
                if (similarityGroup) {
                  const rank = itemToRank.get(item.comparison_id);
                  if (rank) {
                    const currentRank = groupMap.get(similarityGroup);
                    if (!currentRank || rank < currentRank) {
                      groupMap.set(similarityGroup, rank);
                    }
                  }
                }
              }
            });
            
            resolve(groupMap);
      });
    });
      });
    }
  };
  
  // Helper function to calculate popularity bonus based on Wikipedia pageviews
  const calculatePopularityBonus = (pageviews, percentile50, percentile75, percentile90, strength) => {
    if (!pageviews || pageviews === null || pageviews === 0) {
      return 1.0; // No bonus if no pageviews data
    }
    
    let baseBonus = 1.0;
    
    // Calculate bonus based on percentile thresholds
    if (percentile90 && pageviews >= percentile90) {
      baseBonus = 3.0; // Top 10%: 3x bonus
    } else if (percentile75 && pageviews >= percentile75) {
      baseBonus = 2.0; // Top 25%: 2x bonus
    } else if (percentile50 && pageviews >= percentile50) {
      baseBonus = 1.5; // Top 50%: 1.5x bonus
    }
    
    // Apply strength multiplier (0.0-1.0)
    // If strength is 0.5, then 3.0 becomes 2.0 (3.0 - 1.0) * 0.5 + 1.0
    const adjustedBonus = 1.0 + (baseBonus - 1.0) * strength;
    
    return adjustedBonus;
  };

  // Main weighted random selection function
  // Uses vote count weights, ELO bonus, recency decay, diversity penalty, and popularity bonus
  const getWeightedRandomItems = async () => {
    const dbType = db.getDbType();
    const recentlySeen = await getRecentlySeenItems();
    const diversityEnabled = await settings.getDiversityFilteringEnabled();
    const recentlySeenGroups = diversityEnabled ? await getRecentlySeenSimilarityGroups() : new Map();
    const penaltyStrength = await settings.getDiversityPenaltyStrength();
    const popularityEnabled = await settings.getWikipediaPopularityEnabled();
    const popularityStrength = await settings.getWikipediaPopularityStrength();
    
    if (dbType === 'postgres') {
      // Build recency decay values as a CTE
      const recencyValues = Array.from(recentlySeen.entries())
        .map(([itemId, comparisonsAgo]) => {
          let decay = 1.0;
          if (comparisonsAgo <= 5) decay = 0.1;
          else if (comparisonsAgo <= 10) decay = 0.3;
          else if (comparisonsAgo <= 20) decay = 0.5;
          else if (comparisonsAgo <= 30) decay = 0.7;
          return `(${itemId}, ${decay})`;
        })
        .join(', ');
      
      const recencyCTE = recencyValues 
        ? `WITH recency_decay AS (
            SELECT * FROM (VALUES ${recencyValues}) AS t(item_id, decay)
          )`
        : '';
      
      const recencyJoin = recencyValues
        ? `LEFT JOIN recency_decay rd ON i.id = rd.item_id`
        : '';
      
      const recencySelect = recencyValues
        ? `COALESCE(rd.decay, 1.0)`
        : `1.0`;
      
      // Calculate 80th percentile ELO threshold (top 20% cutoff) in a CTE
      const eloThresholdCTE = `elo_threshold AS (
        SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY elo_rating) as threshold
        FROM items
        WHERE image_url IS NOT NULL AND image_url != '' AND image_url != 'null' 
          AND image_url NOT LIKE '%placeholder.com%'
      )`;
      
      // Combine CTEs properly
      const allCTEs = recencyCTE
        ? `WITH ${eloThresholdCTE}, ${recencyCTE.replace('WITH ', '')}`
        : `WITH ${eloThresholdCTE}`;
      
      return db.query(`
        ${allCTEs}
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
               i.familiarity_score, i.rating_confidence, i.wikipedia_pageviews,
               c.id as category_id, c.name as category_name, c.slug as category_slug,
               COALESCE(comment_stats.comment_count, 0) as comment_count,
               CASE 
                 WHEN i.comparison_count = 0 THEN 50.0
                 WHEN i.comparison_count BETWEEN 1 AND 5 THEN 20.0
                 WHEN i.comparison_count BETWEEN 6 AND 20 THEN 5.0
                 ELSE 1.0
               END as vote_weight,
               ${recencySelect} as recency_decay,
               CASE 
                 WHEN i.elo_rating >= et.threshold 
                 THEN LEAST(1.0 + GREATEST((i.elo_rating - et.threshold) / 500.0, 0), 5.0)
                 ELSE 1.0
               END as elo_bonus
        FROM items i
        CROSS JOIN elo_threshold et
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN (
          SELECT item_id, COUNT(*) as comment_count 
          FROM comments 
          GROUP BY item_id
        ) comment_stats ON i.id = comment_stats.item_id
        ${recencyJoin}
        WHERE i.image_url IS NOT NULL AND i.image_url != '' AND i.image_url != 'null' 
          AND i.image_url NOT LIKE '%placeholder.com%'
        ORDER BY (
          (CASE 
            WHEN i.comparison_count = 0 THEN 50.0
            WHEN i.comparison_count BETWEEN 1 AND 5 THEN 20.0
            WHEN i.comparison_count BETWEEN 6 AND 20 THEN 5.0
            ELSE 1.0
          END) * 
          GREATEST(0.1, COALESCE(i.familiarity_score, 0.0) / 100.0) * 
          (CASE 
            WHEN i.elo_rating >= et.threshold 
            THEN LEAST(1.0 + GREATEST((i.elo_rating - et.threshold) / 500.0, 0), 5.0)
            ELSE 1.0
          END) * 
          ${recencySelect}
        ) * RANDOM() DESC
        LIMIT 50
      `).then(async (result) => {
        if (!result || !result.rows || result.rows.length < 2) {
          console.error('[WeightedRandom] Not enough items with images in database. Found:', result?.rows?.length || 0);
          return res.status(404).json({ 
            error: 'Not enough items with images in database',
            message: 'Please ensure there are at least 2 items with valid images (not placeholders)'
          });
        }
        
        // Apply diversity penalty and popularity bonus if enabled
        // Calculate popularity percentiles if enabled
        let percentile50, percentile75, percentile90;
        if (popularityEnabled && result.rows.length > 0) {
          const itemsWithPageviews = result.rows
            .filter(r => r.wikipedia_pageviews && r.wikipedia_pageviews > 0)
            .map(r => r.wikipedia_pageviews)
            .sort((a, b) => a - b);
          
          if (itemsWithPageviews.length > 0) {
            percentile50 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.5)];
            percentile75 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.75)];
            percentile90 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.9)];
          }
        }
        
        let itemsWithDiversity = result.rows;
        if (diversityEnabled && recentlySeenGroups.size > 0) {
          itemsWithDiversity = result.rows.map(item => {
            const similarityGroup = getSimilarityGroup(item.title);
            let diversityPenalty = 1.0;
            
            if (similarityGroup) {
              const comparisonsAgo = recentlySeenGroups.get(similarityGroup);
              diversityPenalty = calculateDiversityPenalty(comparisonsAgo, penaltyStrength);
            }
            
            // Calculate final weight with diversity penalty and popularity bonus
            const voteWeight = item.vote_weight || 1.0;
            const familiarityScore = item.familiarity_score || 0;
            const familiarityMultiplier = Math.max(0.1, familiarityScore / 100.0);
            const eloBonus = item.elo_bonus || 1.0;
            const recencyDecay = item.recency_decay || 1.0;
            const popularityBonus = popularityEnabled && percentile50 
              ? calculatePopularityBonus(item.wikipedia_pageviews || 0, percentile50, percentile75, percentile90, popularityStrength)
              : 1.0;
            const finalWeight = voteWeight * familiarityMultiplier * eloBonus * recencyDecay * diversityPenalty * popularityBonus;
            
            return {
              ...item,
              similarityGroup,
              diversityPenalty,
              familiarityMultiplier,
              finalWeight
            };
          });
          
          // Re-sort by final weight and take top 20
          itemsWithDiversity.sort((a, b) => {
            const weightDiff = (b.finalWeight || 0) - (a.finalWeight || 0);
            if (Math.abs(weightDiff) < 0.1) {
              return Math.random() - 0.5; // Randomize if weights are very close
            }
            return weightDiff;
          });
          itemsWithDiversity = itemsWithDiversity.slice(0, 20);
        } else {
          // Even if diversity is disabled, we still need to apply familiarity multiplier and popularity bonus
          // Calculate popularity percentiles if enabled
          let percentile50, percentile75, percentile90;
          if (popularityEnabled && result.rows.length > 0) {
            const itemsWithPageviews = result.rows
              .filter(r => r.wikipedia_pageviews && r.wikipedia_pageviews > 0)
              .map(r => r.wikipedia_pageviews)
              .sort((a, b) => a - b);
            
            if (itemsWithPageviews.length > 0) {
              percentile50 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.5)];
              percentile75 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.75)];
              percentile90 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.9)];
            }
          }
          
          itemsWithDiversity = result.rows.map(item => {
            const voteWeight = item.vote_weight || 1.0;
            const familiarityScore = item.familiarity_score || 0;
            const familiarityMultiplier = Math.max(0.1, familiarityScore / 100.0);
            const eloBonus = item.elo_bonus || 1.0;
            const recencyDecay = item.recency_decay || 1.0;
            const popularityBonus = popularityEnabled && percentile50 
              ? calculatePopularityBonus(item.wikipedia_pageviews || 0, percentile50, percentile75, percentile90, popularityStrength)
              : 1.0;
            const finalWeight = voteWeight * familiarityMultiplier * eloBonus * recencyDecay * popularityBonus;
            
            return {
              ...item,
              familiarityMultiplier,
              popularityBonus,
              finalWeight
            };
          });
          
          // Sort by final weight and take top 20
          itemsWithDiversity.sort((a, b) => {
            const weightDiff = (b.finalWeight || 0) - (a.finalWeight || 0);
            if (Math.abs(weightDiff) < 0.1) {
              return Math.random() - 0.5;
            }
            return weightDiff;
          });
          itemsWithDiversity = itemsWithDiversity.slice(0, 20);
        }
        
        const shuffled = itemsWithDiversity.sort(() => Math.random() - 0.5);
      let item1 = shuffled[0];
      let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
      if (item1.id === item2.id && shuffled.length > 1) {
        item2 = shuffled[1];
      }
        
        console.log(`[WeightedRandom] Selected items: ${item1.title} (${item1.comparison_count} votes, weight: ${item1.vote_weight}, elo_bonus: ${item1.elo_bonus}, popularity: ${item1.popularity_bonus || 1.0}, decay: ${item1.recency_decay}${item1.diversityPenalty !== undefined ? `, diversity: ${item1.diversityPenalty}` : ''}) vs ${item2.title} (${item2.comparison_count} votes, weight: ${item2.vote_weight}, elo_bonus: ${item2.elo_bonus}, popularity: ${item2.popularity_bonus || 1.0}, decay: ${item2.recency_decay}${item2.diversityPenalty !== undefined ? `, diversity: ${item2.diversityPenalty}` : ''})`);
        res.json({ item1, item2 });
      }).catch(err => {
        if (!result || !result.rows || result.rows.length < 2) {
          console.error('[WeightedRandom] Not enough items with images in database. Found:', result?.rows?.length || 0);
          return res.status(404).json({ 
            error: 'Not enough items with images in database',
            message: 'Please ensure there are at least 2 items with valid images (not placeholders)'
          });
        }
        
          const shuffled = result.rows.sort(() => Math.random() - 0.5);
          let item1 = shuffled[0];
          let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
          if (item1.id === item2.id && shuffled.length > 1) {
            item2 = shuffled[1];
        }
        
        const item1Familiarity = item1.familiarity_score || 0;
        const item1FamMult = Math.max(0.1, item1Familiarity / 100.0);
        const item2Familiarity = item2.familiarity_score || 0;
        const item2FamMult = Math.max(0.1, item2Familiarity / 100.0);
        console.log(`[WeightedRandom] Selected items: ${item1.title} (${item1.comparison_count} votes, weight: ${item1.vote_weight}, familiarity: ${item1Familiarity} (${item1FamMult.toFixed(2)}x), elo_bonus: ${item1.elo_bonus}, decay: ${item1.recency_decay}) vs ${item2.title} (${item2.comparison_count} votes, weight: ${item2.vote_weight}, familiarity: ${item2Familiarity} (${item2FamMult.toFixed(2)}x), elo_bonus: ${item2.elo_bonus}, decay: ${item2.recency_decay})`);
        res.json({ item1, item2 });
      }).catch(err => {
        console.error('[WeightedRandom] Error in PostgreSQL weighted random selection:', err);
        console.error('[WeightedRandom] Error details:', err.message, err.stack);
        // Try fallback: get any items with images, even if fewer than 2
      return db.query(`
          SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
             c.id as category_id, c.name as category_name, c.slug as category_slug,
                 COALESCE(comment_stats.comment_count, 0) as comment_count
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
          LEFT JOIN (
            SELECT item_id, COUNT(*) as comment_count 
            FROM comments 
            GROUP BY item_id
          ) comment_stats ON i.id = comment_stats.item_id
          WHERE i.image_url IS NOT NULL 
            AND i.image_url != '' 
            AND i.image_url != 'null' 
            AND i.image_url NOT LIKE '%placeholder.com%'
          ORDER BY RANDOM()
      LIMIT 20
        `).then(fallbackResult => {
          if (!fallbackResult || !fallbackResult.rows || fallbackResult.rows.length < 2) {
            return res.status(404).json({ 
              error: 'Not enough items with images',
              message: `Found only ${fallbackResult?.rows?.length || 0} items with valid images. Need at least 2.`
            });
          }
          const shuffled = fallbackResult.rows.sort(() => Math.random() - 0.5);
      let item1 = shuffled[0];
      let item2 = shuffled.find(item => item.id !== item1.id) || shuffled[1];
      if (item1.id === item2.id && shuffled.length > 1) {
        item2 = shuffled[1];
      }
          console.log(`[WeightedRandom] Fallback: Selected ${item1.title} vs ${item2.title}`);
          res.json({ item1, item2 });
        }).catch(fallbackErr => {
          console.error('[WeightedRandom] Fallback query also failed:', fallbackErr);
          res.status(500).json({ 
            error: 'Failed to fetch comparison',
            message: fallbackErr.message 
      });
    });
      });
    } else {
      // SQLite version - use JavaScript to calculate weights, ELO bonus, recency decay, and diversity penalty
      // Process items with weights, ELO bonus, recency decay, and diversity penalty
      const processItems = async (rows, recencyMap) => {
          // Calculate 80th percentile ELO threshold (top 20% cutoff)
          const eloRatings = rows
            .map(item => item.elo_rating || 1500)
            .sort((a, b) => a - b);
          const percentileIndex = Math.floor(eloRatings.length * 0.8);
          const eloThreshold = eloRatings[percentileIndex] || 1500;
          
          // Get diversity penalty settings
          const diversityEnabled = await settings.getDiversityFilteringEnabled();
          const penaltyStrength = await settings.getDiversityPenaltyStrength();
          const recentlySeenGroups = diversityEnabled ? await getRecentlySeenSimilarityGroups() : new Map();
          
          // Calculate weights, ELO bonus, recency decay, and diversity penalty
          const weightedItems = rows.map(item => {
            let voteWeight = 1.0;
            const comparisonCount = item.comparison_count || 0;
            if (comparisonCount === 0) voteWeight = 50.0;
            else if (comparisonCount >= 1 && comparisonCount <= 5) voteWeight = 20.0;
            else if (comparisonCount >= 6 && comparisonCount <= 20) voteWeight = 5.0;
            
            // Calculate ELO bonus (1x to 5x multiplier for top 20%)
            const eloRating = item.elo_rating || 1500;
            let eloBonus = 1.0;
            if (eloRating >= eloThreshold) {
              eloBonus = Math.min(1.0 + ((eloRating - eloThreshold) / 500.0), 5.0);
            }
            
            let recencyDecay = 1.0;
            const comparisonsAgo = recencyMap.get(item.id);
            if (comparisonsAgo !== undefined) {
              if (comparisonsAgo <= 5) recencyDecay = 0.1;
              else if (comparisonsAgo <= 10) recencyDecay = 0.3;
              else if (comparisonsAgo <= 20) recencyDecay = 0.5;
              else if (comparisonsAgo <= 30) recencyDecay = 0.7;
            }
            
            // Calculate diversity penalty
            let diversityPenalty = 1.0;
            if (diversityEnabled && recentlySeenGroups.size > 0) {
              const similarityGroup = getSimilarityGroup(item.title);
              if (similarityGroup) {
                const groupComparisonsAgo = recentlySeenGroups.get(similarityGroup);
                diversityPenalty = calculateDiversityPenalty(groupComparisonsAgo, penaltyStrength);
              }
            }
            
            // Calculate familiarity multiplier
            const familiarityScore = item.familiarity_score || 0;
            const familiarityMultiplier = Math.max(0.1, familiarityScore / 100.0);
            
            // Calculate popularity bonus
            let popularityBonus = 1.0;
            if (popularityEnabled && rows.length > 0) {
              // Calculate percentiles from all items with pageviews
              const itemsWithPageviews = rows
                .filter(r => r.wikipedia_pageviews && r.wikipedia_pageviews > 0)
                .map(r => r.wikipedia_pageviews)
                .sort((a, b) => a - b);
              
              if (itemsWithPageviews.length > 0) {
                const p50 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.5)];
                const p75 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.75)];
                const p90 = itemsWithPageviews[Math.floor(itemsWithPageviews.length * 0.9)];
                
                const pageviews = item.wikipedia_pageviews || 0;
                if (pageviews > 0) {
                  if (p90 && pageviews >= p90) {
                    popularityBonus = 1.0 + (3.0 - 1.0) * popularityStrength;
                  } else if (p75 && pageviews >= p75) {
                    popularityBonus = 1.0 + (2.0 - 1.0) * popularityStrength;
                  } else if (p50 && pageviews >= p50) {
                    popularityBonus = 1.0 + (1.5 - 1.0) * popularityStrength;
                  }
                }
              }
            }
            
            const finalWeight = voteWeight * familiarityMultiplier * eloBonus * recencyDecay * diversityPenalty * popularityBonus;
            return { 
              ...item, 
              voteWeight, 
              familiarityMultiplier,
              eloBonus, 
              recencyDecay, 
              diversityPenalty,
              popularityBonus,
              similarityGroup: diversityEnabled ? getSimilarityGroup(item.title) : null,
              finalWeight 
            };
          });
          
          // Sort by final weight and randomize
          weightedItems.sort((a, b) => {
            const weightDiff = b.finalWeight - a.finalWeight;
            if (Math.abs(weightDiff) < 0.1) {
              // If weights are very close, randomize
              return Math.random() - 0.5;
            }
            return weightDiff;
          });
          
          // Take top 20 and shuffle
          const topItems = weightedItems.slice(0, 20).sort(() => Math.random() - 0.5);
          let item1 = topItems[0];
          let item2 = topItems.find(item => item.id !== item1.id) || topItems[1];
          if (item1.id === item2.id && topItems.length > 1) {
            item2 = topItems[1];
          }
          
          console.log(`[WeightedRandom] Selected items: ${item1.title} (${item1.comparison_count || 0} votes, weight: ${item1.voteWeight}, elo_bonus: ${item1.eloBonus}, popularity: ${item1.popularityBonus || 1.0}, decay: ${item1.recencyDecay}${item1.diversityPenalty !== undefined ? `, diversity: ${item1.diversityPenalty}` : ''}) vs ${item2.title} (${item2.comparison_count || 0} votes, weight: ${item2.voteWeight}, elo_bonus: ${item2.eloBonus}, popularity: ${item2.popularityBonus || 1.0}, decay: ${item2.recencyDecay}${item2.diversityPenalty !== undefined ? `, diversity: ${item2.diversityPenalty}` : ''})`);
          res.json({ item1, item2 });
        };
      
      // Try with categories and extra columns first, fallback to simple query if columns don't exist
      return new Promise((resolve, reject) => {
    dbInstance.all(`
          SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
                 i.familiarity_score, i.rating_confidence, i.wikipedia_pageviews,
                 c.id as category_id, c.name as category_name, c.slug as category_slug,
                 COALESCE(comment_stats.comment_count, 0) as comment_count
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
          LEFT JOIN (
            SELECT item_id, COUNT(*) as comment_count 
            FROM comments 
            GROUP BY item_id
          ) comment_stats ON i.id = comment_stats.item_id
          WHERE i.image_url IS NOT NULL AND i.image_url != '' AND i.image_url != 'null' 
            AND i.image_url NOT LIKE '%placeholder.com%'
      ORDER BY RANDOM()
          LIMIT 100
    `, async (err, rows) => {
      if (err) {
            // If columns don't exist, try simpler query
        const errorStr = err.message || err.toString() || '';
            if (errorStr.includes('familiarity_score') || errorStr.includes('rating_confidence') || 
                errorStr.includes('no such column') || errorStr.includes('category')) {
              console.log('[WeightedRandom] Columns not available, using simple query');
          return dbInstance.all(`
                SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
                       COALESCE(comment_stats.comment_count, 0) as comment_count
                FROM items i
                LEFT JOIN (
                  SELECT item_id, COUNT(*) as comment_count 
                  FROM comments 
                  GROUP BY item_id
                ) comment_stats ON i.id = comment_stats.item_id
                WHERE image_url IS NOT NULL AND image_url != '' AND image_url != 'null' 
                  AND image_url NOT LIKE '%placeholder.com%'
            ORDER BY RANDOM()
                LIMIT 100
              `, async (simpleErr, simpleRows) => {
                if (simpleErr) {
                  console.error('Error fetching items for weighted selection:', simpleErr);
              return res.status(500).json({ error: 'Failed to fetch comparison' });
            }
                processItems(simpleRows, recentlySeen).then(() => {
                  // Items processed and response sent
                }).catch(err => {
                  console.error('Error in processItems:', err);
                  return res.status(500).json({ error: 'Failed to fetch comparison' });
                });
              });
            }
            console.error('Error fetching items for weighted selection:', err);
        return res.status(500).json({ error: 'Failed to fetch comparison' });
      }
      
          if (!rows || rows.length < 2) {
            console.error('[WeightedRandom] Not enough items with images in database. Found:', rows?.length || 0);
            return res.status(404).json({ 
              error: 'Not enough items with images in database',
              message: `Found only ${rows?.length || 0} items with valid images. Need at least 2.`
            });
          }
          
          processItems(rows, recentlySeen).then(() => {
            // Items processed and response sent
          }).catch(err => {
            console.error('Error in processItems:', err);
            return res.status(500).json({ error: 'Failed to fetch comparison' });
          });
        });
      });
    }
  };
  
  // Use simple weighted random selection
  try {
    await getWeightedRandomItems();
  } catch (err) {
    console.error('[WeightedRandom] Unhandled error in weighted random selection:', err);
    console.error('[WeightedRandom] Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch comparison',
      message: err.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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
    
    if (!row) {
      return res.json({ count: 0 });
    }
    
    res.json({ count: row.comparisons_count || 0 });
  });
};

/**
 * Submit a vote for a comparison
 */
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

/**
 * Get a specific comparison by item IDs (for sharing)
 */
const getSpecificComparison = async (req, res) => {
  const dbInstance = db.getDb();
  const dbType = db.getDbType();
  
  const item1Id = parseInt(req.query.item1);
  const item2Id = parseInt(req.query.item2);
  
  // Validate input
  if (!item1Id || !item2Id || isNaN(item1Id) || isNaN(item2Id)) {
    return res.status(400).json({ 
      error: 'Invalid item IDs',
      message: 'Both item1 and item2 query parameters are required and must be valid numbers'
    });
  }
  
  if (item1Id === item2Id) {
    return res.status(400).json({ 
      error: 'Invalid comparison',
      message: 'Item IDs must be different'
    });
  }
  
  try {
    if (dbType === 'postgres') {
      const result = await db.query(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
               i.familiarity_score, i.rating_confidence, i.wikipedia_pageviews,
               c.id as category_id, c.name as category_name, c.slug as category_slug,
               COALESCE(comment_stats.comment_count, 0) as comment_count
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN (
          SELECT item_id, COUNT(*) as comment_count 
          FROM comments 
          GROUP BY item_id
        ) comment_stats ON i.id = comment_stats.item_id
        WHERE i.id IN ($1, $2)
          AND i.image_url IS NOT NULL AND i.image_url != '' AND i.image_url != 'null' 
          AND i.image_url NOT LIKE '%placeholder.com%'
      `, [item1Id, item2Id]);
      
      if (result.rows.length !== 2) {
        return res.status(404).json({ 
          error: 'Items not found',
          message: 'One or both items not found or missing images'
        });
      }
      
      const item1 = result.rows.find(item => item.id === item1Id);
      const item2 = result.rows.find(item => item.id === item2Id);
      
      if (!item1 || !item2) {
        return res.status(404).json({ 
          error: 'Items not found',
          message: 'Could not find both items'
        });
      }
      
      res.json({ item1, item2 });
    } else {
      // SQLite version
      dbInstance.all(`
        SELECT i.id, i.title, i.image_url, i.description, i.elo_rating, i.comparison_count,
               i.familiarity_score, i.rating_confidence, i.wikipedia_pageviews,
               c.id as category_id, c.name as category_name, c.slug as category_slug,
               COALESCE(comment_stats.comment_count, 0) as comment_count
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN (
          SELECT item_id, COUNT(*) as comment_count 
          FROM comments 
          GROUP BY item_id
        ) comment_stats ON i.id = comment_stats.item_id
        WHERE i.id IN (?, ?)
          AND i.image_url IS NOT NULL AND i.image_url != '' AND i.image_url != 'null' 
          AND i.image_url NOT LIKE '%placeholder.com%'
      `, [item1Id, item2Id], (err, rows) => {
        if (err) {
          console.error('Error fetching specific comparison:', err);
          return res.status(500).json({ 
            error: 'Failed to fetch comparison',
            message: err.message 
          });
        }
        
        if (!rows || rows.length !== 2) {
          return res.status(404).json({ 
            error: 'Items not found',
            message: 'One or both items not found or missing images'
          });
        }
        
        const item1 = rows.find(item => item.id === item1Id);
        const item2 = rows.find(item => item.id === item2Id);
        
        if (!item1 || !item2) {
          return res.status(404).json({ 
            error: 'Items not found',
            message: 'Could not find both items'
          });
        }
        
        res.json({ item1, item2 });
      });
    }
  } catch (error) {
    console.error('Error fetching specific comparison:', error);
    res.status(500).json({ 
      error: 'Failed to fetch comparison',
      message: error.message || 'Unknown error occurred'
    });
  }
};

module.exports = {
  getRandomComparison,
  getSpecificComparison,
  getSessionComparisonCount,
  submitVote,
  submitSkip
};
