import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAdmin, requireGroupMembership } from '../middleware/auth';
import { validate, validateQuery, validateParams, commonSchemas } from '../middleware/validation';
import { operationRateLimits } from '../middleware/rateLimiting';
import { AuthenticatedRequest, Group, CreateGroupRequest } from '../types';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { userService } from '../services/userService';
import { logger } from '../config/logger';
import { NotFoundError, ConflictError } from '../utils/errors';

const router = Router();

// All group routes require authentication
router.use(authenticate);

// List user's groups
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    
    if (user.isAdmin) {
      // Admins can see all groups (with pagination)
      const { users, nextToken } = await dynamodbService.listUsers(100); // Get more users for groups
      const allGroupIds = [...new Set(users.flatMap(u => u.groups))];
      
      const groups = await Promise.all(
        allGroupIds.map(async (groupId) => {
          try {
            return await dynamodbService.getGroup(groupId);
          } catch (error) {
            logger.warn(`Failed to get group ${groupId}:`, error);
            return null;
          }
        })
      );
      
      res.json(groups.filter(g => g !== null));
    } else {
      // Regular users see only their groups
      const groups = await Promise.all(
        user.groups.map(async (groupId) => {
          try {
            return await dynamodbService.getGroup(groupId);
          } catch (error) {
            logger.warn(`Failed to get group ${groupId} for user ${user.id}:`, error);
            return null;
          }
        })
      );
      
      res.json(groups.filter(g => g !== null));
    }
  } catch (error) {
    logger.error('Failed to list groups:', error);
    throw error;
  }
});

// Create new group (admin only)
router.post('/',
  requireAdmin,
  operationRateLimits.createGroup,
  validate(commonSchemas.createGroup),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const createRequest: CreateGroupRequest = req.body;
      
      // Check if namespace already exists
      const namespaceExists = await kubernetesService.namespaceExists(createRequest.namespace);
      if (namespaceExists) {
        throw new ConflictError('Namespace already exists');
      }
      
      // Generate group ID
      const groupId = `grp_${uuidv4().replace(/-/g, '')}`;
      
      // Default resource quota if not provided
      const resourceQuota = createRequest.resourceQuota || {
        cpu: '50',
        memory: '100Gi',
        storage: '500Gi',
        pods: 100,
      };
      
      // Create group in database
      const group = await dynamodbService.createGroup({
        id: groupId,
        name: createRequest.name,
        displayName: createRequest.displayName,
        description: createRequest.description,
        namespace: createRequest.namespace,
        resourceQuota,
      });

      // Create Kubernetes namespace and resources
      try {
        await kubernetesService.createNamespace(createRequest.namespace, {
          'vscode-platform/group-id': groupId,
          'vscode-platform/group-name': createRequest.name,
        });

        await kubernetesService.createResourceQuota(createRequest.namespace, resourceQuota);

        // Create NetworkPolicy for isolation (implementation depends on your network setup)
        // await kubernetesService.createNetworkPolicy(createRequest.namespace);

        // Add the creator to the group
        await userService.addUserToGroup(user.id, groupId);

        // Update member count
        await dynamodbService.updateGroup(groupId, { memberCount: 1 });

        logger.info(`Group created: ${groupId} with namespace ${createRequest.namespace}, creator ${user.email} added as member`);
        res.status(201).json(group);
      } catch (k8sError) {
        // Clean up database record if K8s creation fails
        await dynamodbService.deleteGroup(groupId);
        throw k8sError;
      }
    } catch (error) {
      logger.error('Failed to create group:', error);
      throw error;
    }
  }
);

// Get group details
router.get('/:groupId',
  validateParams(commonSchemas.id),
  requireGroupMembership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      // Get current resource usage from Kubernetes
      try {
        const usage = await kubernetesService.getNamespaceMetrics(group.namespace);
        res.json({ ...group, currentUsage: usage });
      } catch (error) {
        logger.warn(`Failed to get metrics for group ${groupId}:`, error);
        res.json(group);
      }
    } catch (error) {
      logger.error('Failed to get group details:', error);
      throw error;
    }
  }
);

// Update group (admin only)
router.patch('/:groupId',
  validateParams(commonSchemas.id),
  requireAdmin,
  validate(commonSchemas.updateGroup),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      // Update resource quota in Kubernetes if provided
      if (req.body.resourceQuota) {
        await kubernetesService.createResourceQuota(group.namespace, req.body.resourceQuota);
      }
      
      const updatedGroup = await dynamodbService.updateGroup(groupId, req.body);
      
      logger.info(`Group updated: ${groupId}`);
      res.json(updatedGroup);
    } catch (error) {
      logger.error('Failed to update group:', error);
      throw error;
    }
  }
);

// Delete group (admin only)
router.delete('/:groupId',
  validateParams(commonSchemas.id),
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      // Check if group has any workspaces
      const workspaces = await dynamodbService.getGroupWorkspaces(groupId);
      if (workspaces.length > 0) {
        throw new ConflictError('Cannot delete group with active workspaces');
      }
      
      // Remove group from all users
      const { users } = await dynamodbService.listUsers(1000); // Get all users
      const usersInGroup = users.filter(user => user.groups.includes(groupId));
      
      for (const user of usersInGroup) {
        await userService.removeUserFromGroup(user.id, groupId);
      }
      
      // Delete Kubernetes namespace (this will delete all resources in it)
      try {
        await kubernetesService.deleteNamespace(group.namespace);
      } catch (k8sError) {
        logger.warn(`Failed to delete namespace ${group.namespace}:`, k8sError);
      }
      
      // Delete from database
      await dynamodbService.deleteGroup(groupId);
      
      logger.info(`Group deleted: ${groupId}`);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete group:', error);
      throw error;
    }
  }
);

// Get group members
router.get('/:groupId/members',
  validateParams(commonSchemas.id),
  requireGroupMembership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      // Get all users and filter by group membership
      const { users } = await dynamodbService.listUsers(1000);
      const groupMembers = users.filter(user => user.groups.includes(groupId));
      
      res.json(groupMembers);
    } catch (error) {
      logger.error('Failed to get group members:', error);
      throw error;
    }
  }
);

// Add group member (admin only)
router.post('/:groupId/members',
  validateParams(commonSchemas.id),
  requireAdmin,
  validate(commonSchemas.addGroupMember),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      const { userId, role } = req.body;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      
      // Add user to group
      await userService.addUserToGroup(userId, groupId);
      
      // Update group member count
      const { users } = await dynamodbService.listUsers(1000);
      const memberCount = users.filter(u => u.groups.includes(groupId)).length;
      await dynamodbService.updateGroup(groupId, { memberCount });
      
      logger.info(`User ${userId} added to group ${groupId} with role ${role}`);
      res.json({ message: 'User added to group successfully' });
    } catch (error) {
      logger.error('Failed to add group member:', error);
      throw error;
    }
  }
);

// Remove group member (admin only)
router.delete('/:groupId/members/:userId',
  validateParams(commonSchemas.groupAndUserId),
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId, userId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      
      // Remove user from group
      await userService.removeUserFromGroup(userId, groupId);
      
      // Update group member count
      const { users } = await dynamodbService.listUsers(1000);
      const memberCount = users.filter(u => u.groups.includes(groupId)).length;
      await dynamodbService.updateGroup(groupId, { memberCount });
      
      logger.info(`User ${userId} removed from group ${groupId}`);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to remove group member:', error);
      throw error;
    }
  }
);

// Get group resource usage
router.get('/:groupId/usage',
  validateParams(commonSchemas.id),
  requireGroupMembership(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      
      const group = await dynamodbService.getGroup(groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      const usage = await kubernetesService.getNamespaceMetrics(group.namespace);
      
      res.json(usage);
    } catch (error) {
      logger.error('Failed to get group resource usage:', error);
      throw error;
    }
  }
);

export default router;
