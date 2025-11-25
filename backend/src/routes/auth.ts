import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { logger } from '../config/logger';
import { userService } from '../services/userService';
import Joi from 'joi';

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

/**
 * PATCH /api/auth/profile
 * Update current user profile (name, email)
 */
router.patch('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = Joi.object({
      name: Joi.string().min(1).max(100).optional(),
      email: Joi.string().email().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // Check if email is being changed and if it's already taken
    if (value.email && value.email !== req.user.email) {
      const existingUser = await userService.getUserByEmail(value.email);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({
          success: false,
          error: 'Email address is already in use'
        });
      }
    }

    // Update user profile
    const updatedUser = await userService.updateUser(req.user.id, value);

    logger.info(`User profile updated: ${updatedUser.id}`);

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change current user password
 * Note: For OAuth-based auth (Cognito, Google), this should redirect to the provider's password change flow
 */
router.post('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).max(128).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // For OAuth-based authentication, password changes should be handled by the provider
    // This endpoint returns instructions for the user
    logger.info(`Password change requested for user: ${req.user.id}`);

    res.json({
      success: true,
      message: 'For OAuth authentication, please use your authentication provider to change your password.',
      providerUrl: process.env.AWS_COGNITO_DOMAIN
        ? `https://${process.env.AWS_COGNITO_DOMAIN}/forgotPassword?client_id=${process.env.AWS_COGNITO_CLIENT_ID}`
        : undefined
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

export default router;
