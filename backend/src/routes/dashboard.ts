import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, DashboardStats } from '../types';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { logger } from '../config/logger';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    
    // Get user's workspaces
    const userWorkspaces = await dynamodbService.getUserWorkspaces(user.id);
    
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
        const metrics = await kubernetesService.getNamespaceMetrics(namespace);
        
        // Simple addition (in production, you'd want more sophisticated aggregation)
        totalResourceUsage.cpu.used = (parseFloat(totalResourceUsage.cpu.used) + parseFloat(metrics.cpu.used)).toString();
        totalResourceUsage.cpu.total = (parseFloat(totalResourceUsage.cpu.total) + parseFloat(metrics.cpu.total)).toString();
        
        totalResourceUsage.pods.used += metrics.pods.used;
        totalResourceUsage.pods.total += metrics.pods.total;
      } catch (error) {
        logger.warn(`Failed to get metrics for group ${groupId}:`, error);
      }
    }

    // Recalculate percentages
    if (parseFloat(totalResourceUsage.cpu.total) > 0) {
      totalResourceUsage.cpu.percentage = (parseFloat(totalResourceUsage.cpu.used) / parseFloat(totalResourceUsage.cpu.total)) * 100;
    }
    
    if (totalResourceUsage.pods.total > 0) {
      totalResourceUsage.pods.percentage = (totalResourceUsage.pods.used / totalResourceUsage.pods.total) * 100;
    }

    const stats: DashboardStats = {
      totalWorkspaces: userWorkspaces.length,
      runningWorkspaces,
      totalGroups: user.groups.length,
      resourceUsage: totalResourceUsage,
    };

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error);
    res.status(500).json({
      message: 'Failed to retrieve dashboard statistics',
      code: 'DASHBOARD_ERROR',
    });
  }
});

export default router;
