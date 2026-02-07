const wikipediaFetcher = require('../services/wikipedia-fetcher');
const settings = require('./settings');

// Store interval IDs so we can stop/restart the scheduler
let initialTimeoutId = null;
let intervalId = null;

/**
 * Schedule periodic database growth checks
 * Runs periodically to see if we need to fetch more items
 * Now includes continuous growth - database will keep growing over time
 */
const startScheduler = async () => {
  // Check if auto-fetch is enabled
  const isEnabled = await settings.getWikipediaAutoFetchEnabled();
  
  if (!isEnabled) {
    console.log('Wikipedia auto-fetch is disabled. Skipping scheduler start.');
    return;
  }
  
  // Clear any existing intervals
  stopScheduler();
  
  // Get interval from settings
  const intervalMinutes = await settings.getSchedulerIntervalMinutes();
  const INTERVAL = intervalMinutes * 60 * 1000;
  
  // Initial check after 1 minute (give server time to start)
  initialTimeoutId = setTimeout(() => {
    wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
      console.error('Error in scheduled Wikipedia fetch:', err);
    });
  }, 60000);
  
  // Then check periodically
  intervalId = setInterval(() => {
    wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
      console.error('Error in scheduled Wikipedia fetch:', err);
    });
  }, INTERVAL);
  
  console.log(`Wikipedia auto-fetch scheduler started (checks every ${intervalMinutes} minutes)`);
  const growthInterval = await settings.getGrowthIntervalMinutes();
  const growthBatchSize = await settings.getGrowthBatchSize();
  console.log(`Database will continue to grow: adding ~${growthBatchSize} items every ${growthInterval} minutes when above threshold`);
};

/**
 * Stop the scheduler
 */
const stopScheduler = () => {
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

/**
 * Restart the scheduler (useful when settings change)
 */
const restartScheduler = async () => {
  stopScheduler();
  await startScheduler();
};

module.exports = {
  startScheduler,
  stopScheduler,
  restartScheduler
};

