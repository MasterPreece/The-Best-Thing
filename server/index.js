// Load environment variables from .env file (if it exists)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const apiRoutes = require('./routes');
const scheduler = require('./utils/scheduler');
const { runMigrations } = require('./utils/db-migration');
const { autoSeedIfEmpty } = require('./utils/auto-seed');

const app = express();
// Railway sets PORT automatically, fallback to 3001 for local dev
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Only serve React build in production or if build exists
const buildPath = path.join(__dirname, '../client/build');
const buildIndexPath = path.join(buildPath, 'index.html');
const fs = require('fs');

if (fs.existsSync(buildIndexPath)) {
  // Serve static files from React build (but skip API routes)
  app.use(express.static(buildPath, {
    // Don't serve static files for API routes
    index: false
  }));
  
  // Serve React app for all non-API routes (catch-all must be last)
  // Important: This must come after all API routes
  app.get('*', (req, res, next) => {
    // Skip API routes - they should have been handled already
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(buildIndexPath);
  });
} else {
  // In development, just serve a message if accessing root
  app.get('/', (req, res) => {
    res.json({
      message: 'API server is running. React dev server should be running on port 3000.',
      api: 'http://localhost:3001/api',
      note: 'Run "npm run dev" to start both servers, or "cd client && npm start" for React dev server'
    });
  });
}

// Initialize database and start server with retry logic
const initializeWithRetry = async (maxRetries = 10, delay = 10000) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Database initialization attempt ${attempt + 1}/${maxRetries}...`);
      await db.init();
      // Run migrations
      await runMigrations();
      console.log('Database initialized successfully');
      
      // Seed default categories if they don't exist
      try {
        const seedCategories = require('./scripts/seed-categories-default');
        await seedCategories();
      } catch (err) {
        console.error('Error seeding categories (non-fatal):', err);
      }
      
      // Auto-seed if database is empty (runs in background, doesn't block server start)
      autoSeedIfEmpty().then(() => {
        console.log('Auto-seed check completed');
      }).catch(err => {
        console.error('Auto-seed error (non-fatal):', err);
      });
      
      // Start server immediately (seeding happens in background)
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API endpoints available at http://localhost:${PORT}/api`);
        
        // Start the scheduler to grow the database over time
        scheduler.startScheduler();
      });
      
      return; // Success, exit the retry loop
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const retryDelay = Math.min(delay * Math.pow(2, attempt), 60000); // Cap at 60 seconds
        console.error(`Database initialization attempt ${attempt + 1} failed:`, err.message);
        if (err.code) {
          console.error(`Error code: ${err.code}`);
        }
        if (err.address) {
          console.error(`Connection address: ${err.address}`);
        }
        console.log(`Retrying in ${Math.round(retryDelay / 1000)}s... (attempt ${attempt + 2}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // If we get here, all retries failed
  console.error('Failed to initialize database after all retries:', lastError);
  console.error('Error details:', lastError.message);
  if (lastError.code) {
    console.error('Error code:', lastError.code);
  }
  if (lastError.address) {
    console.error('Connection address:', lastError.address);
  }
  console.error('The application cannot start without a database connection.');
  console.error('Please check your database connection settings and ensure the database is accessible.');
  console.error('This may be a temporary network issue. The service will restart and retry automatically.');
  process.exit(1);
};

// Start initialization
initializeWithRetry();

