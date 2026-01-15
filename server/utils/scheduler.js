const wikipediaFetcher = require('../services/wikipedia-fetcher');

/**
 * Schedule periodic database growth checks
 * Runs every 10 minutes to see if we need to fetch more items
 */
const startScheduler = () => {
  // Check every 10 minutes
  const INTERVAL = 10 * 60 * 1000; // 10 minutes
  
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
  
  console.log('Wikipedia auto-fetch scheduler started (checks every 10 minutes)');
};

module.exports = {
  startScheduler
};

