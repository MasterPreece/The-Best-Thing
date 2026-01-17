const express = require('express');
const router = express.Router();
const comparisonsController = require('../controllers/comparisons');
const itemsController = require('../controllers/items');
const leaderboardController = require('../controllers/leaderboard');
const authController = require('../controllers/auth');
const statsController = require('../controllers/stats');
const commentsController = require('../controllers/comments');
const collectionsController = require('../controllers/collections');
const adminController = require('../controllers/admin');
const bulkImportController = require('../controllers/bulk-import');
const categoriesController = require('../controllers/categories');
const { adminAuth, adminLogin } = require('../utils/admin-auth');
const { authenticate, optionalAuthenticate } = require('../utils/auth');
const multer = require('multer');

// Configure multer for file uploads (memory storage for Excel/CSV files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
                          'application/vnd.ms-excel', // .xls
                          'text/csv', // .csv
                          'application/vnd.ms-excel.sheet.macroEnabled.12']; // .xlsm
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.'));
    }
  }
});

// Comparisons
router.get('/comparison', optionalAuthenticate, comparisonsController.getRandomComparison);
router.get('/comparison/count', comparisonsController.getSessionComparisonCount);
router.post('/comparison/vote', optionalAuthenticate, comparisonsController.submitVote);

// Categories
router.get('/categories', categoriesController.getCategories);
router.get('/categories/:slug', categoriesController.getCategoryBySlug);

// Items/Rankings
router.get('/items/ranking', itemsController.getRankings);
router.get('/items/trending', itemsController.getTrendingItems);
router.get('/items/search', itemsController.searchItem);
router.get('/items/:id', itemsController.getItemById);

// Leaderboard
router.get('/leaderboard', leaderboardController.getLeaderboard);

// Auth
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticate, authController.getCurrentUser);
router.get('/auth/stats', authenticate, authController.getUserStats);

// Stats
router.get('/stats', statsController.getGlobalStats);

// Comments
router.get('/items/:itemId/comments', commentsController.getComments);
router.post('/items/:itemId/comments', optionalAuthenticate, commentsController.createComment);
router.delete('/comments/:commentId', authenticate, commentsController.deleteComment);

// Collections (Favorites)
router.get('/collections', authenticate, collectionsController.getCollection);
router.post('/collections/:comparisonId', authenticate, collectionsController.addToCollection);
router.delete('/collections/:comparisonId', authenticate, collectionsController.removeFromCollection);
router.get('/collections/check/:comparisonId', optionalAuthenticate, collectionsController.checkInCollection);

// Admin endpoints
router.post('/admin/login', adminLogin);

// Protected admin endpoints (require admin password)
router.post('/admin/seed-categories', adminAuth, adminController.triggerSeedCategories);
router.post('/admin/seed-top2000', adminAuth, adminController.triggerSeedTop2000);
router.post('/admin/update-images', adminAuth, adminController.triggerUpdateImages);
router.get('/admin/items', adminAuth, adminController.getAdminItems);
router.post('/admin/items', adminAuth, adminController.createItem);
router.put('/admin/items/:id', adminAuth, adminController.updateItem);
router.delete('/admin/items/:id', adminAuth, adminController.deleteItem);
router.get('/admin/stats', adminAuth, adminController.getAdminStats);
router.post('/admin/bulk-import', adminAuth, upload.single('file'), (err, req, res, next) => {
  if (err) {
    return res.status(400).json({ 
      error: 'File upload error',
      message: err.message || 'Invalid file'
    });
  }
  next();
}, bulkImportController.bulkImport);
router.get('/admin/bulk-import/template', adminAuth, bulkImportController.getTemplate);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

// Debug endpoint to check user sessions
router.get('/debug/user-sessions', (req, res) => {
  const db = require('../database');
  const dbType = db.getDbType();
  const dbInstance = db.getDb();
  
  if (dbType === 'postgres') {
    db.query('SELECT COUNT(*) as count FROM user_sessions').then(result => {
      res.json({
        totalSessions: result.rows[0]?.count || 0,
        message: 'Check /api/debug/user-sessions to see user session count'
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } else {
    dbInstance.get('SELECT COUNT(*) as count FROM user_sessions', [], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        totalSessions: row ? row.count : 0,
        message: 'Check /api/debug/user-sessions to see user session count'
      });
    });
  }
});

module.exports = router;

