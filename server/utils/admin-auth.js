/**
 * Admin authentication middleware
 * Uses simple password-based auth (set ADMIN_PASSWORD env variable)
 */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-change-me-in-production';

/**
 * Middleware to check admin password
 */
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Check for Bearer token or password in body/query
  let providedPassword = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedPassword = authHeader.substring(7); // Remove 'Bearer ' prefix
  } else if (req.body?.password) {
    providedPassword = req.body.password;
  } else if (req.query?.password) {
    providedPassword = req.query.password;
  }
  
  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid admin password' 
    });
  }
  
  // Set admin flag for downstream handlers
  req.isAdmin = true;
  next();
};

/**
 * Admin login endpoint - returns success if password is correct
 */
const adminLogin = (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ 
      success: true,
      message: 'Admin authentication successful'
    });
  } else {
    res.status(401).json({ 
      success: false,
      error: 'Invalid password' 
    });
  }
};

module.exports = {
  adminAuth,
  adminLogin
};

