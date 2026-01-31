// Settings utility
// Reads all application settings from database with caching
// Falls back to environment variables, then defaults

const db = require('../database');

// Cache for settings to avoid repeated database queries
let settingsCache = {};
let cacheTime = null;
const CACHE_TTL = 60000; // Cache for 60 seconds

/**
 * Get setting from database, with caching
 */
const getSetting = async (key, defaultValue, parseFn = null) => {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cacheTime && (now - cacheTime) < CACHE_TTL) {
    if (settingsCache[key] !== undefined) {
      return parseFn ? parseFn(settingsCache[key]) : settingsCache[key];
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
        cacheTime = now;
        return parseFn ? parseFn(value) : value;
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
        cacheTime = now;
        return parseFn ? parseFn(value) : value;
      }
    }
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
  }
  
  // Fall back to environment variable
  const envKey = key.toUpperCase().replace(/_/g, '_');
  if (process.env[envKey] !== undefined) {
    return parseFn ? parseFn(process.env[envKey]) : process.env[envKey];
  }
  
  // Return default
  return parseFn ? parseFn(defaultValue) : defaultValue;
};

/**
 * Invalidate settings cache (call after updating settings)
 */
const invalidateSettingsCache = () => {
  settingsCache = {};
  cacheTime = null;
};

// ELO Rating System Settings
const getBaseKFactor = async () => parseFloat(await getSetting('base_k_factor', '32', parseFloat)) || 32;
const getHighConfidenceK = async () => parseFloat(await getSetting('high_confidence_k', '16', parseFloat)) || 16;
const getMediumConfidenceK = async () => parseFloat(await getSetting('medium_confidence_k', '24', parseFloat)) || 24;
const getLowConfidenceK = async () => parseFloat(await getSetting('low_confidence_k', '32', parseFloat)) || 32;
const getHighConfidenceThreshold = async () => parseFloat(await getSetting('high_confidence_threshold', '0.8', parseFloat)) || 0.8;
const getMediumConfidenceThreshold = async () => parseFloat(await getSetting('medium_confidence_threshold', '0.33', parseFloat)) || 0.33;

// Upset Detection Settings
const getUpsetThreshold = async () => parseFloat(await getSetting('upset_threshold', '200', parseFloat)) || 200;

// Familiarity Calculation Settings
const getMinComparisonsForConfidence = async () => parseInt(await getSetting('min_comparisons_for_confidence', '30', parseInt)) || 30;
const getComparisonSaturationPoint = async () => parseInt(await getSetting('comparison_saturation_point', '50', parseInt)) || 50;
const getRecencyDecayDays = async () => parseInt(await getSetting('recency_decay_days', '30', parseInt)) || 30;
const getComparisonFactorWeight = async () => parseFloat(await getSetting('comparison_factor_weight', '0.40', parseFloat)) || 0.40;
const getWinRateFactorWeight = async () => parseFloat(await getSetting('win_rate_factor_weight', '0.25', parseFloat)) || 0.25;
const getRecencyFactorWeight = async () => parseFloat(await getSetting('recency_factor_weight', '0.20', parseFloat)) || 0.20;
const getEngagementFactorWeight = async () => parseFloat(await getSetting('engagement_factor_weight', '0.15', parseFloat)) || 0.15;

// Wikipedia Auto-Fetch Settings
const getApiDelay = async () => parseInt(await getSetting('api_delay', '300', parseInt)) || 300;
const getMinItemsThreshold = async () => parseInt(await getSetting('min_items_threshold', '50', parseInt)) || 50;
const getBatchSize = async () => parseInt(await getSetting('batch_size', '10', parseInt)) || 10;
const getGrowthBatchSize = async () => parseInt(await getSetting('growth_batch_size', '5', parseInt)) || 5;
const getGrowthIntervalMinutes = async () => parseInt(await getSetting('growth_interval_minutes', '30', parseInt)) || 30;

// Scheduler Settings
const getSchedulerIntervalMinutes = async () => parseInt(await getSetting('scheduler_interval_minutes', '10', parseInt)) || 10;

// Selection Algorithm Settings
const getItemsNeedingVotesConfidenceThreshold = async () => parseFloat(await getSetting('items_needing_votes_confidence_threshold', '0.8', parseFloat)) || 0.8;
const getItemsNeedingVotesComparisonThreshold = async () => parseInt(await getSetting('items_needing_votes_comparison_threshold', '20', parseInt)) || 20;

// Diversity Filtering Settings
const getDiversityFilteringEnabled = async () => {
  const value = await getSetting('diversity_filtering_enabled', 'true', (v) => v === 'true' || v === true);
  return value === true || value === 'true';
};
const getDiversityPenaltyStrength = async () => parseFloat(await getSetting('diversity_penalty_strength', '0.8', parseFloat)) || 0.8;
const getDiversityLookbackCount = async () => parseInt(await getSetting('diversity_lookback_count', '20', parseInt)) || 20;

// Wikipedia Popularity Settings
const getWikipediaPopularityEnabled = async () => {
  const value = await getSetting('wikipedia_popularity_enabled', 'true', (v) => v === 'true' || v === true);
  return value === true || value === 'true';
};
const getWikipediaPopularityStrength = async () => parseFloat(await getSetting('wikipedia_popularity_strength', '0.5', parseFloat)) || 0.5;

module.exports = {
  invalidateSettingsCache,
  // ELO Rating System
  getBaseKFactor,
  getHighConfidenceK,
  getMediumConfidenceK,
  getLowConfidenceK,
  getHighConfidenceThreshold,
  getMediumConfidenceThreshold,
  // Upset Detection
  getUpsetThreshold,
  // Familiarity Calculation
  getMinComparisonsForConfidence,
  getComparisonSaturationPoint,
  getRecencyDecayDays,
  getComparisonFactorWeight,
  getWinRateFactorWeight,
  getRecencyFactorWeight,
  getEngagementFactorWeight,
  // Wikipedia Auto-Fetch
  getApiDelay,
  getMinItemsThreshold,
  getBatchSize,
  getGrowthBatchSize,
  getGrowthIntervalMinutes,
  // Scheduler
  getSchedulerIntervalMinutes,
  // Selection Algorithm
  getItemsNeedingVotesConfidenceThreshold,
  getItemsNeedingVotesComparisonThreshold,
  // Diversity Filtering
  getDiversityFilteringEnabled,
  getDiversityPenaltyStrength,
  getDiversityLookbackCount,
  // Wikipedia Popularity
  getWikipediaPopularityEnabled,
  getWikipediaPopularityStrength
};

