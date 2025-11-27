import { Router, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate, validateQuery, validateParams, commonSchemas } from '../middleware/validation';
import { adminRateLimit } from '../middleware/rateLimiting';
import { AuthenticatedRequest, User, PaginatedResponse, AuditLog, SystemSettings, UpdateSystemSettingsRequest, GroupRole } from '../types';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { userService } from '../services/userService';
import { cognitoService } from '../services/cognitoService';
import { costService } from '../services/costService';
import { logger } from '../config/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// All admin routes require authentication and admin privileges
router.use(authenticate);
router.use(requireAdmin);
router.use(adminRateLimit);

// List all users
router.get('/users',
  validateQuery(commonSchemas.userQuery),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit, nextToken, search } = req.query as any;
      
      let result = await dynamodbService.listUsers(limit, nextToken);
      
      // Apply search filter if provided
      if (search) {
        const searchTerm = search.toLowerCase();
        result.users = result.users.filter(user => 
          user.name?.toLowerCase().includes(searchTerm) ||
          user.username.toLowerCase().includes(searchTerm) ||
          user.email.toLowerCase().includes(searchTerm)
        );
      }
      
      const response: PaginatedResponse<User> = {
        items: result.users,
        nextToken: result.nextToken,
        hasMore: !!result.nextToken,
        total: result.users.length, // In a real implementation, you'd get the total count
      };
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to list users:', error);
      throw error;
    }
  }
);

// Create a new user
router.post('/users',
  validate(commonSchemas.createUser),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, name, temporaryPassword, sendInvite, isAdmin, groups } = req.body;

      // Check if user already exists
      const existingUser = await userService.getUserByEmail(email);
      if (existingUser) {
        throw new ValidationError(`User with email ${email} already exists`);
      }

      // Validate groups exist
      for (const groupId of groups) {
        const group = await dynamodbService.getGroup(groupId);
        if (!group) {
          throw new ValidationError(`Group ${groupId} not found`);
        }
      }

      // Create user in Cognito first (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.createUser(email, temporaryPassword, name, sendInvite);

        // Add to admin group if needed
        if (isAdmin) {
          await cognitoService.promoteToAdmin(email);
        }
      }

      // Create user in database
      const user = await dynamodbService.createUser({
        id: `usr_${uuidv4().replace(/-/g, '')}`,
        username: name || email.split('@')[0],
        email: email,
        name: name,
        groups: groups,
        isAdmin: isAdmin,
      });

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'create_user',
        resource: `user:${user.id}`,
        details: {
          email: user.email,
          isAdmin,
          groups,
          cognitoEnabled: cognitoService.isEnabled()
        },
        success: true,
      });

      logger.info(`User ${email} created by admin ${req.user!.id}`);
      res.status(201).json(user);
    } catch (error) {
      // Log failed admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'create_user',
        resource: 'user:new',
        details: {
          email: req.body.email,
          error: error.message
        },
        success: false,
        error: error.message,
      });

      logger.error('Failed to create user:', error);
      throw error;
    }
  }
);

// Get user details
router.get('/users/:userId',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      
      // Get user's workspaces count
      const workspaces = await dynamodbService.getUserWorkspaces(userId);
      
      // Get user's groups details
      const groups = await Promise.all(
        user.groups.map(async (groupId) => {
          try {
            return await dynamodbService.getGroup(groupId);
          } catch (error) {
            logger.warn(`Failed to get group ${groupId}:`, error);
            return null;
          }
        })
      );
      
      const userDetails = {
        ...user,
        workspacesCount: workspaces.length,
        groupDetails: groups.filter(g => g !== null),
      };
      
      res.json(userDetails);
    } catch (error) {
      logger.error('Failed to get user details:', error);
      throw error;
    }
  }
);

// Update user
router.patch('/users/:userId',
  validateParams(commonSchemas.userId),
  validate(commonSchemas.updateUser),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const updates = req.body;
      
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      
      const updatedUser = await userService.updateUser(userId, updates);
      
      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'update_user',
        resource: `user:${userId}`,
        details: { updates },
        success: true,
      });
      
      logger.info(`User ${userId} updated by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      // Log failed admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'update_user',
        resource: `user:${req.params.userId}`,
        details: { error: error.message },
        success: false,
        error: error.message,
      });
      
      logger.error('Failed to update user:', error);
      throw error;
    }
  }
);

// Delete user
router.delete('/users/:userId',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Check if user has any workspaces
      const workspaces = await dynamodbService.getUserWorkspaces(userId);
      if (workspaces.length > 0) {
        // In a production system, you might want to transfer or delete workspaces
        logger.warn(`Deleting user ${userId} with ${workspaces.length} active workspaces`);
      }

      // Delete from Cognito first (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.deleteUser(user.email);
      }

      // Delete user from database
      await userService.deleteUser(userId);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'delete_user',
        resource: `user:${userId}`,
        details: {
          deletedUser: user.email,
          cognitoEnabled: cognitoService.isEnabled()
        },
        success: true,
      });

      logger.info(`User ${userId} deleted by admin ${req.user!.id}`);
      res.status(204).send();
    } catch (error) {
      // Log failed admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'delete_user',
        resource: `user:${req.params.userId}`,
        details: { error: error.message },
        success: false,
        error: error.message,
      });

      logger.error('Failed to delete user:', error);
      throw error;
    }
  }
);

// Reset user password
router.post('/users/:userId/reset-password',
  validateParams(commonSchemas.userId),
  validate(commonSchemas.resetPassword),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { newPassword, permanent } = req.body;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Reset password in Cognito (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.setUserPassword(user.email, newPassword, permanent);
      } else {
        throw new ValidationError('Password reset is only available when Cognito is configured');
      }

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'reset_user_password',
        resource: `user:${userId}`,
        details: {
          targetUser: user.email,
          permanent
        },
        success: true,
      });

      logger.info(`Password reset for user ${userId} by admin ${req.user!.id}`);
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      logger.error('Failed to reset user password:', error);
      throw error;
    }
  }
);

// Enable user account
router.post('/users/:userId/enable',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Enable in Cognito (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.enableUser(user.email);
      } else {
        throw new ValidationError('User enable/disable is only available when Cognito is configured');
      }

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'enable_user',
        resource: `user:${userId}`,
        details: { targetUser: user.email },
        success: true,
      });

      logger.info(`User ${userId} enabled by admin ${req.user!.id}`);
      res.json({ message: 'User enabled successfully' });
    } catch (error) {
      logger.error('Failed to enable user:', error);
      throw error;
    }
  }
);

// Disable user account
router.post('/users/:userId/disable',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Prevent self-disable
      if (userId === req.user!.id) {
        return res.status(400).json({
          message: 'Cannot disable yourself',
          code: 'SELF_DISABLE_NOT_ALLOWED'
        });
      }

      // Disable in Cognito (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.disableUser(user.email);
      } else {
        throw new ValidationError('User enable/disable is only available when Cognito is configured');
      }

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'disable_user',
        resource: `user:${userId}`,
        details: { targetUser: user.email },
        success: true,
      });

      logger.info(`User ${userId} disabled by admin ${req.user!.id}`);
      res.json({ message: 'User disabled successfully' });
    } catch (error) {
      logger.error('Failed to disable user:', error);
      throw error;
    }
  }
);

// Get audit logs
router.get('/audit-logs',
  validateQuery(commonSchemas.auditLogQuery),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, userId, action, nextToken, limit } = req.query as any;
      
      const result = await dynamodbService.getAuditLogs(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
        userId,
        action,
        limit,
        nextToken
      );
      
      const response: PaginatedResponse<AuditLog> = {
        items: result.logs,
        nextToken: result.nextToken,
        hasMore: !!result.nextToken,
      };
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }
);

// Platform statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get platform-wide statistics
    const { users } = await dynamodbService.listUsers(10000); // Large limit to get all
    
    const totalUsers = users.length;
    const adminUsers = users.filter(u => u.isAdmin).length;
    
    // Get all groups
    const allGroupIds = [...new Set(users.flatMap(u => u.groups))];
    const totalGroups = allGroupIds.length;
    
    // Get all workspaces
    let totalWorkspaces = 0;
    let runningWorkspaces = 0;
    
    for (const user of users) {
      const userWorkspaces = await dynamodbService.getUserWorkspaces(user.id);
      totalWorkspaces += userWorkspaces.length;
      runningWorkspaces += userWorkspaces.filter(ws => ws.status === 'running').length;
    }
    
    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentUsers = users.filter(u =>
      u.lastLoginAt && new Date(u.lastLoginAt) >= sevenDaysAgo
    ).length;
    
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
  } catch (error) {
    logger.error('Failed to get admin stats:', error);
    throw error;
  }
});

// System health check for admins
router.get('/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const health = {
      database: await dynamodbService.healthCheck(),
      kubernetes: true, // TODO: Implement K8s health check
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
    };
    
    const overallHealth = health.database && health.kubernetes;
    
    res.status(overallHealth ? 200 : 503).json({
      status: overallHealth ? 'healthy' : 'unhealthy',
      ...health,
    });
  } catch (error) {
    logger.error('Admin health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date(),
    });
  }
});

// Promote user to admin
router.post('/users/:userId/promote',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.isAdmin) {
        return res.json({ message: 'User is already an admin' });
      }

      // Sync with Cognito first (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.promoteToAdmin(user.email);
      }

      const updatedUser = await userService.setUserAdmin(userId, true);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'promote_user_to_admin',
        resource: `user:${userId}`,
        details: {
          promotedUser: user.email,
          cognitoEnabled: cognitoService.isEnabled()
        },
        success: true,
      });

      logger.info(`User ${userId} promoted to admin by ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to promote user to admin:', error);
      throw error;
    }
  }
);

// Demote admin user
router.post('/users/:userId/demote',
  validateParams(commonSchemas.userId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.isAdmin) {
        return res.json({ message: 'User is not an admin' });
      }

      // Prevent self-demotion
      if (userId === req.user!.id) {
        return res.status(400).json({
          message: 'Cannot demote yourself',
          code: 'SELF_DEMOTION_NOT_ALLOWED'
        });
      }

      // Sync with Cognito first (if enabled)
      if (cognitoService.isEnabled()) {
        await cognitoService.demoteFromAdmin(user.email);
      }

      const updatedUser = await userService.setUserAdmin(userId, false);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'demote_admin_user',
        resource: `user:${userId}`,
        details: {
          demotedUser: user.email,
          cognitoEnabled: cognitoService.isEnabled()
        },
        success: true,
      });

      logger.info(`Admin ${userId} demoted by ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to demote admin user:', error);
      throw error;
    }
  }
);

// Add user to group with role
router.post('/users/:userId/groups',
  validateParams(commonSchemas.userId),
  validate(commonSchemas.addUserToGroup),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { groupId, role } = req.body;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify group exists
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }

      // Default to MEMBER role if not specified
      const userRole = role || GroupRole.MEMBER;

      const updatedUser = await userService.addUserToGroup(userId, groupId, userRole);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'add_user_to_group',
        resource: `user:${userId}`,
        details: { groupId, groupName: group.name, role: userRole },
        success: true,
      });

      logger.info(`User ${userId} added to group ${groupId} with role ${userRole} by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to add user to group:', error);
      throw error;
    }
  }
);

// Remove user from group
router.delete('/users/:userId/groups/:groupId',
  validateParams(commonSchemas.groupAndUserId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, groupId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const updatedUser = await userService.removeUserFromGroup(userId, groupId);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'remove_user_from_group',
        resource: `user:${userId}`,
        details: { groupId },
        success: true,
      });

      logger.info(`User ${userId} removed from group ${groupId} by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to remove user from group:', error);
      throw error;
    }
  }
);

// Set user's role in a group
router.patch('/users/:userId/groups/:groupId/role',
  validateParams(commonSchemas.groupAndUserId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, groupId } = req.params;
      const { role } = req.body;

      // Validate role
      if (!role || !Object.values(GroupRole).includes(role)) {
        throw new ValidationError('Invalid role. Must be "admin" or "member"');
      }

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify group exists
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }

      const updatedUser = await userService.setUserGroupRole(userId, groupId, role);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'set_user_group_role',
        resource: `user:${userId}`,
        details: { groupId, groupName: group.name, role },
        success: true,
      });

      logger.info(`User ${userId} role in group ${groupId} set to ${role} by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to set user group role:', error);
      throw error;
    }
  }
);

// Promote user to group admin
router.post('/users/:userId/groups/:groupId/promote',
  validateParams(commonSchemas.groupAndUserId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, groupId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify group exists
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }

      const updatedUser = await userService.setUserGroupRole(userId, groupId, GroupRole.ADMIN);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'promote_user_to_group_admin',
        resource: `user:${userId}`,
        details: { groupId, groupName: group.name },
        success: true,
      });

      logger.info(`User ${userId} promoted to group admin for group ${groupId} by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to promote user to group admin:', error);
      throw error;
    }
  }
);

// Demote user from group admin to member
router.post('/users/:userId/groups/:groupId/demote',
  validateParams(commonSchemas.groupAndUserId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, groupId } = req.params;

      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify group exists
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }

      const updatedUser = await userService.setUserGroupRole(userId, groupId, GroupRole.MEMBER);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'demote_user_from_group_admin',
        resource: `user:${userId}`,
        details: { groupId, groupName: group.name },
        success: true,
      });

      logger.info(`User ${userId} demoted from group admin for group ${groupId} by admin ${req.user!.id}`);
      res.json(updatedUser);
    } catch (error) {
      logger.error('Failed to demote user from group admin:', error);
      throw error;
    }
  }
);

// List all workspaces (across all users)
router.get('/workspaces',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      logger.info('Admin listing all workspaces');

      // Get all users to find all workspaces
      const { users } = await dynamodbService.listUsers(10000); // Large limit to get all

      let allWorkspaces = [];

      for (const user of users) {
        const userWorkspaces = await dynamodbService.getUserWorkspaces(user.id);

        // Enrich workspaces with user info
        const enrichedWorkspaces = userWorkspaces.map(ws => ({
          ...ws,
          userName: user.name || user.username,
          userEmail: user.email,
        }));

        allWorkspaces = allWorkspaces.concat(enrichedWorkspaces);
      }

      // Sort by creation date (newest first)
      allWorkspaces.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(allWorkspaces);
    } catch (error) {
      logger.error('Failed to list all workspaces:', error);
      throw error;
    }
  }
);

// Delete workspace (admin override - can delete any workspace)
router.delete('/workspaces/:workspaceId',
  validateParams(commonSchemas.workspaceId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req.params;

      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();

      // Get the group to find the namespace
      const group = await dynamodbService.getGroup(workspace.groupId);
      const namespace = group?.namespace;

      // Delete Kubernetes resources (if namespace exists)
      if (namespace) {
        try {
          await kubernetesService.deleteDeployment(namespace, k8sName);
          await kubernetesService.deleteNamespacedService(k8sName, namespace);
          await kubernetesService.deleteNamespacedSecret(`${k8sName}-config`, namespace);
          // TODO: Re-enable PVC deletion once storage is configured
          // await kubernetesService.deleteNamespacedPVC(`${k8sName}-pvc`, namespace);

          // Remove this workspace from the nginx proxy ConfigMap
          await kubernetesService.removeWorkspaceFromNginxProxyConfig(namespace, k8sName);

          logger.info(`Kubernetes resources deleted for workspace ${workspaceId} in namespace ${namespace} by admin ${req.user!.id}`);
        } catch (k8sError) {
          logger.error(`Failed to delete K8s resources for workspace ${workspaceId}:`, k8sError);
          // Continue with database deletion even if K8s deletion fails
        }
      } else {
        logger.warn(`Group ${workspace.groupId} not found for workspace ${workspaceId}, skipping K8s cleanup`);
      }

      // Delete from database
      await dynamodbService.deleteWorkspace(workspaceId);

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'admin_delete_workspace',
        resource: `workspace:${workspaceId}`,
        details: {
          workspaceName: workspace.name,
          workspaceUserId: workspace.userId,
          groupId: workspace.groupId
        },
        success: true,
      });

      logger.info(`Workspace ${workspaceId} deleted by admin ${req.user!.id}`);
      res.status(204).send();
    } catch (error) {
      // Log failed admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'admin_delete_workspace',
        resource: `workspace:${req.params.workspaceId}`,
        details: { error: error.message },
        success: false,
        error: error.message,
      });

      logger.error('Failed to delete workspace:', error);
      throw error;
    }
  }
);

// Get system settings
router.get('/settings',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settings = await dynamodbService.getSystemSettings();
      res.json(settings);
    } catch (error) {
      logger.error('Failed to get system settings:', error);
      throw error;
    }
  }
);

// Update system settings
router.patch('/settings',
  validate(commonSchemas.updateSystemSettings),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const updates: UpdateSystemSettingsRequest = req.body;

      const oldSettings = await dynamodbService.getSystemSettings();
      const updatedSettings = await dynamodbService.updateSystemSettings(
        updates,
        req.user!.id
      );

      // Log admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'update_system_settings',
        resource: 'settings:system',
        details: {
          oldSettings,
          newSettings: updates,
        },
        success: true,
      });

      logger.info(`System settings updated by admin ${req.user!.id}`, updates);
      res.json(updatedSettings);
    } catch (error) {
      // Log failed admin action
      await dynamodbService.createAuditLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'update_system_settings',
        resource: 'settings:system',
        details: { error: error.message },
        success: false,
        error: error.message,
      });

      logger.error('Failed to update system settings:', error);
      throw error;
    }
  }
);

// Get cluster capacity
router.get('/cluster/capacity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const capacity = await kubernetesService.getClusterCapacity();
    res.json(capacity);
  } catch (error) {
    logger.error('Failed to get cluster capacity:', error);
    throw error;
  }
});

// Get workspace cost breakdown
router.get('/workspaces/:workspaceId/cost',
  validateParams(commonSchemas.workspaceId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req.params;

      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Calculate cost breakdown with estimated usage
      const costBreakdown = costService.calculateWorkspaceCostWithUsage(workspace);

      res.json(costBreakdown);
    } catch (error) {
      logger.error(`Failed to get cost breakdown for workspace ${req.params.workspaceId}:`, error);
      throw error;
    }
  }
);

// Get pricing configuration
router.get('/pricing/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pricingConfig = costService.loadPricingConfig();
    res.json(pricingConfig);
  } catch (error) {
    logger.error('Failed to get pricing configuration:', error);
    throw error;
  }
});

export default router;
