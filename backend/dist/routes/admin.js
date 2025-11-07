"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rateLimiting_1 = require("../middleware/rateLimiting");
const dynamodbService_1 = require("../services/dynamodbService");
const userService_1 = require("../services/userService");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// All admin routes require authentication and admin privileges
router.use(auth_1.authenticate);
router.use(auth_1.requireAdmin);
router.use(rateLimiting_1.adminRateLimit);
// List all users
router.get('/users', (0, validation_1.validateQuery)(validation_1.commonSchemas.userQuery), async (req, res) => {
    try {
        const { limit, nextToken, search } = req.query;
        let result = await dynamodbService_1.dynamodbService.listUsers(limit, nextToken);
        // Apply search filter if provided
        if (search) {
            const searchTerm = search.toLowerCase();
            result.users = result.users.filter(user => user.name?.toLowerCase().includes(searchTerm) ||
                user.username.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm));
        }
        const response = {
            items: result.users,
            nextToken: result.nextToken,
            hasMore: !!result.nextToken,
            total: result.users.length, // In a real implementation, you'd get the total count
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to list users:', error);
        throw error;
    }
});
// Get user details
router.get('/users/:userId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        // Get user's workspaces count
        const workspaces = await dynamodbService_1.dynamodbService.getUserWorkspaces(userId);
        // Get user's groups details
        const groups = await Promise.all(user.groups.map(async (groupId) => {
            try {
                return await dynamodbService_1.dynamodbService.getGroup(groupId);
            }
            catch (error) {
                logger_1.logger.warn(`Failed to get group ${groupId}:`, error);
                return null;
            }
        }));
        const userDetails = {
            ...user,
            workspacesCount: workspaces.length,
            groupDetails: groups.filter(g => g !== null),
        };
        res.json(userDetails);
    }
    catch (error) {
        logger_1.logger.error('Failed to get user details:', error);
        throw error;
    }
});
// Update user
router.patch('/users/:userId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), (0, validation_1.validate)(validation_1.commonSchemas.updateUser), async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        const updatedUser = await userService_1.userService.updateUser(userId, updates);
        // Log admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'update_user',
            resource: `user:${userId}`,
            details: { updates },
            success: true,
        });
        logger_1.logger.info(`User ${userId} updated by admin ${req.user.id}`);
        res.json(updatedUser);
    }
    catch (error) {
        // Log failed admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'update_user',
            resource: `user:${req.params.userId}`,
            details: { error: error.message },
            success: false,
            error: error.message,
        });
        logger_1.logger.error('Failed to update user:', error);
        throw error;
    }
});
// Delete user
router.delete('/users/:userId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        // Check if user has any workspaces
        const workspaces = await dynamodbService_1.dynamodbService.getUserWorkspaces(userId);
        if (workspaces.length > 0) {
            // In a production system, you might want to transfer or delete workspaces
            logger_1.logger.warn(`Deleting user ${userId} with ${workspaces.length} active workspaces`);
        }
        // Delete user
        await userService_1.userService.deleteUser(userId);
        // Log admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'delete_user',
            resource: `user:${userId}`,
            details: { deletedUser: user.email },
            success: true,
        });
        logger_1.logger.info(`User ${userId} deleted by admin ${req.user.id}`);
        res.status(204).send();
    }
    catch (error) {
        // Log failed admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'delete_user',
            resource: `user:${req.params.userId}`,
            details: { error: error.message },
            success: false,
            error: error.message,
        });
        logger_1.logger.error('Failed to delete user:', error);
        throw error;
    }
});
// Get audit logs
router.get('/audit-logs', (0, validation_1.validateQuery)(validation_1.commonSchemas.auditLogQuery), async (req, res) => {
    try {
        const { startDate, endDate, userId, action, nextToken, limit } = req.query;
        const result = await dynamodbService_1.dynamodbService.getAuditLogs(startDate ? new Date(startDate) : undefined, endDate ? new Date(endDate) : undefined, userId, action, limit, nextToken);
        const response = {
            items: result.logs,
            nextToken: result.nextToken,
            hasMore: !!result.nextToken,
        };
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to get audit logs:', error);
        throw error;
    }
});
// Platform statistics
router.get('/stats', async (req, res) => {
    try {
        // Get platform-wide statistics
        const { users } = await dynamodbService_1.dynamodbService.listUsers(10000); // Large limit to get all
        const totalUsers = users.length;
        const adminUsers = users.filter(u => u.isAdmin).length;
        // Get all groups
        const allGroupIds = [...new Set(users.flatMap(u => u.groups))];
        const totalGroups = allGroupIds.length;
        // Get all workspaces
        let totalWorkspaces = 0;
        let runningWorkspaces = 0;
        for (const user of users) {
            const userWorkspaces = await dynamodbService_1.dynamodbService.getUserWorkspaces(user.id);
            totalWorkspaces += userWorkspaces.length;
            runningWorkspaces += userWorkspaces.filter(ws => ws.status === 'running').length;
        }
        // Recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentUsers = users.filter(u => u.lastLoginAt && u.lastLoginAt >= sevenDaysAgo).length;
        const stats = {
            platform: {
                totalUsers,
                adminUsers,
                totalGroups,
                totalWorkspaces,
                runningWorkspaces,
            },
            activity: {
                activeUsersLast7Days: recentUsers,
                workspaceUtilization: totalWorkspaces > 0 ? (runningWorkspaces / totalWorkspaces) * 100 : 0,
            },
            timestamp: new Date(),
        };
        res.json(stats);
    }
    catch (error) {
        logger_1.logger.error('Failed to get admin stats:', error);
        throw error;
    }
});
// System health check for admins
router.get('/health', async (req, res) => {
    try {
        const health = {
            database: await dynamodbService_1.dynamodbService.healthCheck(),
            kubernetes: true, // TODO: Implement K8s health check
            timestamp: new Date(),
            version: process.env.npm_package_version || '1.0.0',
        };
        const overallHealth = health.database && health.kubernetes;
        res.status(overallHealth ? 200 : 503).json({
            status: overallHealth ? 'healthy' : 'unhealthy',
            ...health,
        });
    }
    catch (error) {
        logger_1.logger.error('Admin health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date(),
        });
    }
});
// Promote user to admin
router.post('/users/:userId/promote', (0, validation_1.validateParams)(validation_1.commonSchemas.id), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        if (user.isAdmin) {
            return res.json({ message: 'User is already an admin' });
        }
        const updatedUser = await userService_1.userService.setUserAdmin(userId, true);
        // Log admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'promote_user_to_admin',
            resource: `user:${userId}`,
            details: { promotedUser: user.email },
            success: true,
        });
        logger_1.logger.info(`User ${userId} promoted to admin by ${req.user.id}`);
        res.json(updatedUser);
    }
    catch (error) {
        logger_1.logger.error('Failed to promote user to admin:', error);
        throw error;
    }
});
// Demote admin user
router.post('/users/:userId/demote', (0, validation_1.validateParams)(validation_1.commonSchemas.id), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        if (!user.isAdmin) {
            return res.json({ message: 'User is not an admin' });
        }
        // Prevent self-demotion
        if (userId === req.user.id) {
            return res.status(400).json({
                message: 'Cannot demote yourself',
                code: 'SELF_DEMOTION_NOT_ALLOWED'
            });
        }
        const updatedUser = await userService_1.userService.setUserAdmin(userId, false);
        // Log admin action
        await dynamodbService_1.dynamodbService.createAuditLog({
            userId: req.user.id,
            username: req.user.username,
            action: 'demote_admin_user',
            resource: `user:${userId}`,
            details: { demotedUser: user.email },
            success: true,
        });
        logger_1.logger.info(`Admin ${userId} demoted by ${req.user.id}`);
        res.json(updatedUser);
    }
    catch (error) {
        logger_1.logger.error('Failed to demote admin user:', error);
        throw error;
    }
});
exports.default = router;
