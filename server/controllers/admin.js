const seedCategoriesFunction = require('../scripts/seed-categories-wrapper');

/**
 * Trigger category seeding (protected by secret)
 * POST /api/admin/seed-categories
 * Body: { secret: "your-secret" }
 */
const triggerSeedCategories = async (req, res) => {
  try {
    const { secret } = req.body;
    const expectedSecret = process.env.ADMIN_SECRET || 'change-this-secret-in-production';
    
    if (secret !== expectedSecret) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid secret' 
      });
    }
    
    // Run seeding in background (don't block the response)
    res.json({ 
      message: 'Category seeding started. This will take 10-15 minutes.',
      note: 'Check logs to monitor progress.'
    });
    
    // Run seeding asynchronously
    seedCategoriesFunction().catch(err => {
      console.error('Error during admin-triggered seeding:', err);
    });
    
  } catch (error) {
    console.error('Error in triggerSeedCategories:', error);
    res.status(500).json({ 
      error: 'Failed to trigger seeding',
      message: error.message 
    });
  }
};

module.exports = {
  triggerSeedCategories
};

