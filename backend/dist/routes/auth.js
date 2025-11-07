"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
/**
 * POST /api/auth/login
 * User login endpoint
 * This is typically handled by an external auth provider (Cognito, Google, etc.)
 */
router.post('/login', async (req, res) => {
    try {
        // Token validation would be done by external auth provider
        res.json({
            success: true,
            message: 'Login handled by auth provider'
        });
    }
    catch (error) {
        logger_1.logger.error('Login error:', error);
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
router.post('/logout', async (req, res) => {
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
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    }
    catch (error) {
        logger_1.logger.error('Get user error:', error);
        res.status(401).json({
            success: false,
            error: 'Not authenticated'
        });
    }
});
exports.default = router;
