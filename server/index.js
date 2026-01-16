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

// Initialize database and start server
db.init().then(() => {
  // Run migrations
  return runMigrations();
}).then(async () => {
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
}).catch(err => {
  console.error('Failed to initialize database:', err);
  console.error('Error details:', err.message);
  process.exit(1);
});

