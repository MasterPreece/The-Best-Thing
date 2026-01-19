const wikipediaFetcher = require('../services/wikipedia-fetcher');
const settings = require('./settings');

/**
 * Schedule periodic database growth checks
 * Runs periodically to see if we need to fetch more items
 * Now includes continuous growth - database will keep growing over time
 */
const startScheduler = async () => {
  // Get interval from settings
  const intervalMinutes = await settings.getSchedulerIntervalMinutes();
  const INTERVAL = intervalMinutes * 60 * 1000;
  
  // Initial check after 1 minute (give server time to start)
  setTimeout(() => {
    wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
      console.error('Error in scheduled Wikipedia fetch:', err);
    });
  }, 60000);
  
  // Then check periodically
  setInterval(() => {
    wikipediaFetcher.checkAndFetchIfNeeded().catch(err => {
      console.error('Error in scheduled Wikipedia fetch:', err);
    });
  }, INTERVAL);
  
  console.log(`Wikipedia auto-fetch scheduler started (checks every ${intervalMinutes} minutes)`);
  const growthInterval = await settings.getGrowthIntervalMinutes();
  const growthBatchSize = await settings.getGrowthBatchSize();
  console.log(`Database will continue to grow: adding ~${growthBatchSize} items every ${growthInterval} minutes when above threshold`);
};

module.exports = {
  startScheduler
};

