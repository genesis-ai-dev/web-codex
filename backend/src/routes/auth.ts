import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { logger } from '../config/logger';

const router = Router();

/**
 * POST /api/auth/login
 * User login endpoint
 * This is typically handled by an external auth provider (Cognito, Google, etc.)
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Token validation would be done by external auth provider
    res.json({
      success: true,
      message: 'Login handled by auth provider'
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * User logout endpoint
 */
router.post('/logout', async (req: AuthenticatedRequest, res: Response) => {
  // In a stateless JWT system, logout is typically handled client-side
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(401).json({
      success: false,
      error: 'Not authenticated'
    });
  }
});

export default router;
