"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dynamodbService_1 = require("../services/dynamodbService");
const kubernetesService_1 = require("../services/kubernetesService");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
// All dashboard routes require authentication
router.use(auth_1.authenticate);
// Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const user = req.user;
        // Get user's workspaces
        const userWorkspaces = await dynamodbService_1.dynamodbService.getUserWorkspaces(user.id);
        // Count running workspaces
        const runningWorkspaces = userWorkspaces.filter(ws => ws.status === 'running').length;
        // Get resource usage across all user's groups
        let totalResourceUsage = {
            cpu: { used: '0', total: '0', percentage: 0 },
            memory: { used: '0Gi', total: '0Gi', percentage: 0 },
            storage: { used: '0Gi', total: '0Gi', percentage: 0 },
            pods: { used: 0, total: 0, percentage: 0 },
        };
        // Aggregate resource usage from all user's groups
        for (const groupId of user.groups) {
            try {
                const namespace = `group-${groupId}`;
                const metrics = await kubernetesService_1.kubernetesService.getNamespaceMetrics(namespace);
                // Simple addition (in production, you'd want more sophisticated aggregation)
                totalResourceUsage.cpu.used = (parseFloat(totalResourceUsage.cpu.used) + parseFloat(metrics.cpu.used)).toString();
                totalResourceUsage.cpu.total = (parseFloat(totalResourceUsage.cpu.total) + parseFloat(metrics.cpu.total)).toString();
                totalResourceUsage.pods.used += metrics.pods.used;
                totalResourceUsage.pods.total += metrics.pods.total;
            }
            catch (error) {
                logger_1.logger.warn(`Failed to get metrics for group ${groupId}:`, error);
            }
        }
        // Recalculate percentages
        if (parseFloat(totalResourceUsage.cpu.total) > 0) {
            totalResourceUsage.cpu.percentage = (parseFloat(totalResourceUsage.cpu.used) / parseFloat(totalResourceUsage.cpu.total)) * 100;
        }
        if (totalResourceUsage.pods.total > 0) {
            totalResourceUsage.pods.percentage = (totalResourceUsage.pods.used / totalResourceUsage.pods.total) * 100;
        }
        const stats = {
            totalWorkspaces: userWorkspaces.length,
            runningWorkspaces,
            totalGroups: user.groups.length,
            resourceUsage: totalResourceUsage,
        };
        res.json(stats);
    }
    catch (error) {
        logger_1.logger.error('Failed to get dashboard stats:', error);
        res.status(500).json({
            message: 'Failed to retrieve dashboard statistics',
            code: 'DASHBOARD_ERROR',
        });
    }
});
exports.default = router;
