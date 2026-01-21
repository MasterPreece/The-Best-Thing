// Selection configuration
// Configurable weights for comparison selection algorithm
// Reads from database settings first, then environment variables, then defaults

const db = require('../database');

// Cache for settings to avoid repeated database queries
let settingsCache = {
  familiarity_weight: null,
  cooldown_period: null,
  cacheTime: null
};
const CACHE_TTL = 60000; // Cache for 60 seconds

/**
 * Get setting from database, with caching
 */
const getSetting = async (key, defaultValue) => {
  const now = Date.now();
  
  // Return cached value if still valid
  if (settingsCache.cacheTime && (now - settingsCache.cacheTime) < CACHE_TTL) {
    if (settingsCache[key] !== null) {
      return settingsCache[key];
    }
  }
  
  // Fetch from database
  try {
    const dbType = db.getDbType();
    const dbInstance = db.getDb();
    
    if (dbType === 'postgres') {
      const result = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
      if (result.rows.length > 0) {
        const value = result.rows[0].value;
        settingsCache[key] = value;
        settingsCache.cacheTime = now;
        return value;
      }
    } else {
      const value = await new Promise((resolve, reject) => {
        dbInstance.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
          if (err) reject(err);
          else resolve(row?.value || null);
        });
      });
      
      if (value !== null) {
        settingsCache[key] = value;
        settingsCache.cacheTime = now;
        return value;
      }
    }
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
  }
  
  // Fall back to environment variable
  const envKey = key.toUpperCase().replace(/_/g, '_');
  if (process.env[envKey] !== undefined) {
    return process.env[envKey];
  }
  
  // Return default
  return defaultValue;
};

/**
 * Invalidate settings cache (call after updating settings)
 */
const invalidateSettingsCache = () => {
  settingsCache = {
    familiarity_weight: null,
    cooldown_period: null,
    cacheTime: null
  };
};

/**
 * Get familiarity weight (default 0.2 = 20% familiarity, 80% variety)
 * Checks database settings first, then environment variable FAMILIARITY_WEIGHT, then default
 */
const getFamiliarityWeight = async () => {
  const dbValue = await getSetting('familiarity_weight', null);
  if (dbValue !== null) {
    const parsed = parseFloat(dbValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  
  const envWeight = process.env.FAMILIARITY_WEIGHT;
  if (envWeight !== undefined) {
    const parsed = parseFloat(envWeight);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.2; // Default: 20% familiarity, 80% variety (prioritizes new items)
};

/**
 * Get variety weight (complement of familiarity weight)
 * If familiarity is 50%, variety is 50%
 */
const getVarietyWeight = async () => {
  const familiarity = await getFamiliarityWeight();
  return 1.0 - familiarity;
};

/**
 * Get selection thresholds
 * Returns object with thresholds for different selection types
 * New distribution: 20% familiarity, 50% zero-vote items, 30% items needing votes, 20% random
 */
const getSelectionThresholds = async () => {
  const familiarityWeight = await getFamiliarityWeight();
  
  // New distribution prioritizing items with 0 votes
  // 20% familiarity, 50% zero-vote items, 30% items needing votes (1-20), 20% random
  const zeroVotesWeight = 0.5; // 50% for items with 0 votes
  const itemsNeedingVotesWeight = 0.3; // 30% for items with 1-20 votes
  const randomWeight = 0.2; // 20% random variety
  
  return {
    familiarityThreshold: familiarityWeight, // 0.2 (20%)
    zeroVotesThreshold: familiarityWeight + zeroVotesWeight, // 0.7 (50%)
    itemsNeedingVotesThreshold: familiarityWeight + zeroVotesWeight + itemsNeedingVotesWeight, // 0.9 (30%)
    randomThreshold: 1.0 // 1.0 (20% random)
  };
};

/**
 * Get cooldown period (number of recent comparisons to exclude)
 * Default: 55 comparisons
 * Checks database settings first, then environment variable FAMILIARITY_COOLDOWN, then default
 */
const getCooldownPeriod = async () => {
  const dbValue = await getSetting('cooldown_period', null);
  if (dbValue !== null) {
    const parsed = parseInt(dbValue);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  
  const envCooldown = process.env.FAMILIARITY_COOLDOWN;
  if (envCooldown !== undefined) {
    const parsed = parseInt(envCooldown);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 55; // Default: exclude items from last 55 comparisons (increased to prevent repeats)
};

module.exports = {
  getFamiliarityWeight,
  getVarietyWeight,
  getSelectionThresholds,
  getCooldownPeriod
};

