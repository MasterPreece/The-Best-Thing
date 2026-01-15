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
const { authenticate, optionalAuthenticate } = require('../utils/auth');

// Comparisons
router.get('/comparison', optionalAuthenticate, comparisonsController.getRandomComparison);
router.get('/comparison/count', comparisonsController.getSessionComparisonCount);
router.post('/comparison/vote', optionalAuthenticate, comparisonsController.submitVote);

// Items/Rankings
router.get('/items/ranking', itemsController.getRankings);
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
router.post('/admin/seed-categories', adminController.triggerSeedCategories);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

module.exports = router;

