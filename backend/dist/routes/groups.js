"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rateLimiting_1 = require("../middleware/rateLimiting");
const dynamodbService_1 = require("../services/dynamodbService");
const kubernetesService_1 = require("../services/kubernetesService");
const userService_1 = require("../services/userService");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// All group routes require authentication
router.use(auth_1.authenticate);
// List user's groups
router.get('/', async (req, res) => {
    try {
        const user = req.user;
        if (user.isAdmin) {
            // Admins can see all groups (with pagination)
            const { users, nextToken } = await dynamodbService_1.dynamodbService.listUsers(100); // Get more users for groups
            const allGroupIds = [...new Set(users.flatMap(u => u.groups))];
            const groups = await Promise.all(allGroupIds.map(async (groupId) => {
                try {
                    return await dynamodbService_1.dynamodbService.getGroup(groupId);
                }
                catch (error) {
                    logger_1.logger.warn(`Failed to get group ${groupId}:`, error);
                    return null;
                }
            }));
            res.json(groups.filter(g => g !== null));
        }
        else {
            // Regular users see only their groups
            const groups = await Promise.all(user.groups.map(async (groupId) => {
                try {
                    return await dynamodbService_1.dynamodbService.getGroup(groupId);
                }
                catch (error) {
                    logger_1.logger.warn(`Failed to get group ${groupId} for user ${user.id}:`, error);
                    return null;
                }
            }));
            res.json(groups.filter(g => g !== null));
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to list groups:', error);
        throw error;
    }
});
// Create new group (admin only)
router.post('/', auth_1.requireAdmin, rateLimiting_1.operationRateLimits.createGroup, (0, validation_1.validate)(validation_1.commonSchemas.createGroup), async (req, res) => {
    try {
        const user = req.user;
        const createRequest = req.body;
        // Check if namespace already exists
        const namespaceExists = await kubernetesService_1.kubernetesService.namespaceExists(createRequest.namespace);
        if (namespaceExists) {
            throw new errors_1.ConflictError('Namespace already exists');
        }
        // Generate group ID
        const groupId = `grp_${(0, uuid_1.v4)().replace(/-/g, '')}`;
        // Default resource quota if not provided
        const resourceQuota = createRequest.resourceQuota || {
            cpu: '50',
            memory: '100Gi',
            storage: '500Gi',
            pods: 100,
        };
        // Create group in database
        const group = await dynamodbService_1.dynamodbService.createGroup({
            id: groupId,
            name: createRequest.name,
            displayName: createRequest.displayName,
            description: createRequest.description,
            namespace: createRequest.namespace,
            resourceQuota,
        });
        // Create Kubernetes namespace and resources
        try {
            await kubernetesService_1.kubernetesService.createNamespace(createRequest.namespace, {
                'vscode-platform/group-id': groupId,
                'vscode-platform/group-name': createRequest.name,
            });
            await kubernetesService_1.kubernetesService.createResourceQuota(createRequest.namespace, resourceQuota);
            // Create NetworkPolicy for isolation (implementation depends on your network setup)
            // await kubernetesService.createNetworkPolicy(createRequest.namespace);
            logger_1.logger.info(`Group created: ${groupId} with namespace ${createRequest.namespace}`);
            res.status(201).json(group);
        }
        catch (k8sError) {
            // Clean up database record if K8s creation fails
            await dynamodbService_1.dynamodbService.deleteGroup(groupId);
            throw k8sError;
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to create group:', error);
        throw error;
    }
});
// Get group details
router.get('/:groupId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), (0, auth_1.requireGroupMembership)(), async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Get current resource usage from Kubernetes
        try {
            const usage = await kubernetesService_1.kubernetesService.getNamespaceMetrics(group.namespace);
            res.json({ ...group, currentUsage: usage });
        }
        catch (error) {
            logger_1.logger.warn(`Failed to get metrics for group ${groupId}:`, error);
            res.json(group);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to get group details:', error);
        throw error;
    }
});
// Update group (admin only)
router.patch('/:groupId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), auth_1.requireAdmin, (0, validation_1.validate)(validation_1.commonSchemas.updateGroup), async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Update resource quota in Kubernetes if provided
        if (req.body.resourceQuota) {
            await kubernetesService_1.kubernetesService.createResourceQuota(group.namespace, req.body.resourceQuota);
        }
        const updatedGroup = await dynamodbService_1.dynamodbService.updateGroup(groupId, req.body);
        logger_1.logger.info(`Group updated: ${groupId}`);
        res.json(updatedGroup);
    }
    catch (error) {
        logger_1.logger.error('Failed to update group:', error);
        throw error;
    }
});
// Delete group (admin only)
router.delete('/:groupId', (0, validation_1.validateParams)(validation_1.commonSchemas.id), auth_1.requireAdmin, async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Check if group has any workspaces
        const workspaces = await dynamodbService_1.dynamodbService.getGroupWorkspaces(groupId);
        if (workspaces.length > 0) {
            throw new errors_1.ConflictError('Cannot delete group with active workspaces');
        }
        // Remove group from all users
        const { users } = await dynamodbService_1.dynamodbService.listUsers(1000); // Get all users
        const usersInGroup = users.filter(user => user.groups.includes(groupId));
        for (const user of usersInGroup) {
            await userService_1.userService.removeUserFromGroup(user.id, groupId);
        }
        // Delete Kubernetes namespace (this will delete all resources in it)
        try {
            await kubernetesService_1.kubernetesService.deleteNamespace(group.namespace);
        }
        catch (k8sError) {
            logger_1.logger.warn(`Failed to delete namespace ${group.namespace}:`, k8sError);
        }
        // Delete from database
        await dynamodbService_1.dynamodbService.deleteGroup(groupId);
        logger_1.logger.info(`Group deleted: ${groupId}`);
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Failed to delete group:', error);
        throw error;
    }
});
// Get group members
router.get('/:groupId/members', (0, validation_1.validateParams)(validation_1.commonSchemas.id), (0, auth_1.requireGroupMembership)(), async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Get all users and filter by group membership
        const { users } = await dynamodbService_1.dynamodbService.listUsers(1000);
        const groupMembers = users.filter(user => user.groups.includes(groupId));
        res.json(groupMembers);
    }
    catch (error) {
        logger_1.logger.error('Failed to get group members:', error);
        throw error;
    }
});
// Add group member (admin only)
router.post('/:groupId/members', (0, validation_1.validateParams)(validation_1.commonSchemas.id), auth_1.requireAdmin, (0, validation_1.validate)(validation_1.commonSchemas.addGroupMember), async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userId, role } = req.body;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        // Add user to group
        await userService_1.userService.addUserToGroup(userId, groupId);
        // Update group member count
        const { users } = await dynamodbService_1.dynamodbService.listUsers(1000);
        const memberCount = users.filter(u => u.groups.includes(groupId)).length;
        await dynamodbService_1.dynamodbService.updateGroup(groupId, { memberCount });
        logger_1.logger.info(`User ${userId} added to group ${groupId} with role ${role}`);
        res.json({ message: 'User added to group successfully' });
    }
    catch (error) {
        logger_1.logger.error('Failed to add group member:', error);
        throw error;
    }
});
// Remove group member (admin only)
router.delete('/:groupId/members/:userId', (0, validation_1.validateParams)(validation_1.commonSchemas.groupAndUserId), auth_1.requireAdmin, async (req, res) => {
    try {
        const { groupId, userId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        const user = await userService_1.userService.getUserById(userId);
        if (!user) {
            throw new errors_1.NotFoundError('User not found');
        }
        // Remove user from group
        await userService_1.userService.removeUserFromGroup(userId, groupId);
        // Update group member count
        const { users } = await dynamodbService_1.dynamodbService.listUsers(1000);
        const memberCount = users.filter(u => u.groups.includes(groupId)).length;
        await dynamodbService_1.dynamodbService.updateGroup(groupId, { memberCount });
        logger_1.logger.info(`User ${userId} removed from group ${groupId}`);
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Failed to remove group member:', error);
        throw error;
    }
});
// Get group resource usage
router.get('/:groupId/usage', (0, validation_1.validateParams)(validation_1.commonSchemas.id), (0, auth_1.requireGroupMembership)(), async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await dynamodbService_1.dynamodbService.getGroup(groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        const usage = await kubernetesService_1.kubernetesService.getNamespaceMetrics(group.namespace);
        res.json(usage);
    }
    catch (error) {
        logger_1.logger.error('Failed to get group resource usage:', error);
        throw error;
    }
});
exports.default = router;
