const express = require('express');
const router = express.Router();
const comparisonsController = require('../controllers/comparisons');
const itemsController = require('../controllers/items');
const leaderboardController = require('../controllers/leaderboard');
const authController = require('../controllers/auth');
const statsController = require('../controllers/stats');
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

module.exports = router;

