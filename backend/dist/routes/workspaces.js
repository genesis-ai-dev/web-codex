"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rateLimiting_1 = require("../middleware/rateLimiting");
const types_1 = require("../types");
const dynamodbService_1 = require("../services/dynamodbService");
const kubernetesService_1 = require("../services/kubernetesService");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// All workspace routes require authentication
router.use(auth_1.authenticate);
// List workspaces
router.get('/', (0, validation_1.validateQuery)(validation_1.commonSchemas.workspaceQuery), async (req, res) => {
    try {
        const user = req.user;
        const { groupId, status, limit, offset } = req.query;
        let workspaces;
        if (groupId) {
            // Verify user has access to this group
            if (!user.groups.includes(groupId) && !user.isAdmin) {
                throw new errors_1.NotFoundError('Group not found');
            }
            workspaces = await dynamodbService_1.dynamodbService.getGroupWorkspaces(groupId);
        }
        else {
            // Get all user's workspaces across all groups
            workspaces = await dynamodbService_1.dynamodbService.getUserWorkspaces(user.id);
            // Also get workspaces from user's groups (if user can view group workspaces)
            for (const groupId of user.groups) {
                const groupWorkspaces = await dynamodbService_1.dynamodbService.getGroupWorkspaces(groupId);
                workspaces = [...workspaces, ...groupWorkspaces];
            }
            // Remove duplicates
            const uniqueWorkspaces = workspaces.reduce((acc, workspace) => {
                if (!acc.find(w => w.id === workspace.id)) {
                    acc.push(workspace);
                }
                return acc;
            }, []);
            workspaces = uniqueWorkspaces;
        }
        // Filter by status if provided
        if (status) {
            workspaces = workspaces.filter(ws => ws.status === status);
        }
        // Apply pagination
        const startIndex = offset || 0;
        const endIndex = startIndex + (limit || 20);
        const paginatedWorkspaces = workspaces.slice(startIndex, endIndex);
        // Update workspace statuses from Kubernetes
        const updatedWorkspaces = await Promise.all(paginatedWorkspaces.map(async (workspace) => {
            try {
                const namespace = `group-${workspace.groupId}`;
                const k8sStatus = await kubernetesService_1.kubernetesService.getDeploymentStatus(namespace, workspace.name);
                if (k8sStatus !== workspace.status) {
                    // Update status in database
                    const updatedWorkspace = await dynamodbService_1.dynamodbService.updateWorkspace(workspace.id, { status: k8sStatus });
                    return updatedWorkspace;
                }
                return workspace;
            }
            catch (error) {
                logger_1.logger.warn(`Failed to get K8s status for workspace ${workspace.id}:`, error);
                return workspace;
            }
        }));
        res.json(updatedWorkspaces);
    }
    catch (error) {
        logger_1.logger.error('Failed to list workspaces:', error);
        throw error;
    }
});
// Create workspace
router.post('/', rateLimiting_1.operationRateLimits.createWorkspace, (0, validation_1.validate)(validation_1.commonSchemas.createWorkspace), async (req, res) => {
    try {
        const user = req.user;
        const createRequest = req.body;
        // Verify user has access to the target group
        if (!user.groups.includes(createRequest.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Get group information
        const group = await dynamodbService_1.dynamodbService.getGroup(createRequest.groupId);
        if (!group) {
            throw new errors_1.NotFoundError('Group not found');
        }
        // Generate workspace ID and Kubernetes-compatible name
        const workspaceId = `ws_${(0, uuid_1.v4)().replace(/-/g, '')}`;
        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        const namespace = group.namespace;
        // Default resources if not provided
        const resources = createRequest.resources || {
            cpu: '2',
            memory: '4Gi',
            storage: '20Gi',
        };
        // Create workspace in database
        const workspace = await dynamodbService_1.dynamodbService.createWorkspace({
            id: workspaceId,
            name: createRequest.name,
            description: createRequest.description,
            groupId: createRequest.groupId,
            groupName: group.displayName,
            userId: user.id,
            status: types_1.WorkspaceStatus.PENDING,
            url: `https://${k8sName}.${namespace}.workspaces.example.com`,
            resources,
            image: createRequest.image || 'codercom/code-server:latest',
            replicas: 0, // Start stopped
        });
        // Create Kubernetes resources
        try {
            await kubernetesService_1.kubernetesService.createPVC(namespace, k8sName, resources.storage);
            await kubernetesService_1.kubernetesService.createDeployment(namespace, k8sName, workspace.image, resources);
            await kubernetesService_1.kubernetesService.createService(namespace, k8sName);
            // Update status to stopped (created but not running)
            const updatedWorkspace = await dynamodbService_1.dynamodbService.updateWorkspace(workspaceId, {
                status: types_1.WorkspaceStatus.STOPPED,
            });
            logger_1.logger.info(`Workspace created: ${workspaceId} for user ${user.id}`);
            res.status(201).json(updatedWorkspace);
        }
        catch (k8sError) {
            // Clean up database record if K8s creation fails
            await dynamodbService_1.dynamodbService.deleteWorkspace(workspaceId);
            throw k8sError;
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to create workspace:', error);
        throw error;
    }
});
// Get workspace details
router.get('/:workspaceId', (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Get current status from Kubernetes
        try {
            const namespace = `group-${workspace.groupId}`;
            const k8sStatus = await kubernetesService_1.kubernetesService.getDeploymentStatus(namespace, workspace.name);
            const metrics = await kubernetesService_1.kubernetesService.getNamespaceMetrics(namespace);
            if (k8sStatus !== workspace.status) {
                const updatedWorkspace = await dynamodbService_1.dynamodbService.updateWorkspace(workspaceId, {
                    status: k8sStatus,
                    usage: metrics,
                });
                res.json(updatedWorkspace);
            }
            else {
                res.json({ ...workspace, usage: metrics });
            }
        }
        catch (error) {
            logger_1.logger.warn(`Failed to get K8s status for workspace ${workspaceId}:`, error);
            res.json(workspace);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to get workspace:', error);
        throw error;
    }
});
// Update workspace
router.patch('/:workspaceId', (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), (0, validation_1.validate)(validation_1.commonSchemas.updateWorkspace), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        const updatedWorkspace = await dynamodbService_1.dynamodbService.updateWorkspace(workspaceId, req.body);
        logger_1.logger.info(`Workspace updated: ${workspaceId} by user ${user.id}`);
        res.json(updatedWorkspace);
    }
    catch (error) {
        logger_1.logger.error('Failed to update workspace:', error);
        throw error;
    }
});
// Delete workspace
router.delete('/:workspaceId', rateLimiting_1.operationRateLimits.deleteWorkspace, (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        const namespace = `group-${workspace.groupId}`;
        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        // Delete Kubernetes resources
        try {
            await kubernetesService_1.kubernetesService.deleteDeployment(namespace, k8sName);
            await kubernetesService_1.kubernetesService.deleteNamespacedService(k8sName, namespace);
            await kubernetesService_1.kubernetesService.deleteNamespacedPVC(`${k8sName}-pvc`, namespace);
        }
        catch (k8sError) {
            logger_1.logger.warn(`Failed to delete K8s resources for workspace ${workspaceId}:`, k8sError);
        }
        // Delete from database
        await dynamodbService_1.dynamodbService.deleteWorkspace(workspaceId);
        logger_1.logger.info(`Workspace deleted: ${workspaceId} by user ${user.id}`);
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Failed to delete workspace:', error);
        throw error;
    }
});
// Workspace actions (start/stop/restart)
router.post('/:workspaceId/actions', rateLimiting_1.operationRateLimits.workspaceActions, (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), (0, validation_1.validate)(validation_1.commonSchemas.workspaceAction), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const { type } = req.body;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        const namespace = `group-${workspace.groupId}`;
        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        let newStatus;
        let replicas;
        switch (type) {
            case 'start':
                if (workspace.status === types_1.WorkspaceStatus.RUNNING) {
                    throw new errors_1.ConflictError('Workspace is already running');
                }
                newStatus = types_1.WorkspaceStatus.STARTING;
                replicas = 1;
                break;
            case 'stop':
                if (workspace.status === types_1.WorkspaceStatus.STOPPED) {
                    throw new errors_1.ConflictError('Workspace is already stopped');
                }
                newStatus = types_1.WorkspaceStatus.STOPPING;
                replicas = 0;
                break;
            case 'restart':
                newStatus = types_1.WorkspaceStatus.STARTING;
                replicas = 1;
                break;
            default:
                throw new errors_1.ValidationError('Invalid action type');
        }
        // Update status in database
        await dynamodbService_1.dynamodbService.updateWorkspace(workspaceId, {
            status: newStatus,
            replicas,
            lastAccessedAt: new Date().toISOString(),
        });
        // Scale deployment in Kubernetes
        await kubernetesService_1.kubernetesService.scaleDeployment(namespace, k8sName, replicas);
        // Wait a moment and check final status
        setTimeout(async () => {
            try {
                const finalStatus = await kubernetesService_1.kubernetesService.getDeploymentStatus(namespace, k8sName);
                await dynamodbService_1.dynamodbService.updateWorkspace(workspaceId, { status: finalStatus });
            }
            catch (error) {
                logger_1.logger.warn(`Failed to update final status for workspace ${workspaceId}:`, error);
            }
        }, 5000);
        const updatedWorkspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        logger_1.logger.info(`Workspace action ${type} performed on ${workspaceId} by user ${user.id}`);
        res.json(updatedWorkspace);
    }
    catch (error) {
        logger_1.logger.error('Failed to perform workspace action:', error);
        throw error;
    }
});
// Get workspace metrics
router.get('/:workspaceId/metrics', (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        const namespace = `group-${workspace.groupId}`;
        const metrics = await kubernetesService_1.kubernetesService.getNamespaceMetrics(namespace);
        res.json(metrics);
    }
    catch (error) {
        logger_1.logger.error('Failed to get workspace metrics:', error);
        throw error;
    }
});
// Get workspace logs
router.get('/:workspaceId/logs', (0, validation_1.validateParams)(validation_1.commonSchemas.workspaceId), (0, validation_1.validateQuery)(validation_1.commonSchemas.workspaceLogsQuery), async (req, res) => {
    try {
        const user = req.user;
        const { workspaceId } = req.params;
        const { lines } = req.query;
        const workspace = await dynamodbService_1.dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        // Verify user has access
        if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
            throw new errors_1.NotFoundError('Workspace not found');
        }
        const namespace = `group-${workspace.groupId}`;
        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        // Get pod name for the workspace
        const pods = await kubernetesService_1.kubernetesService.listPods(namespace, `app=${k8sName}`);
        if (pods.length === 0) {
            return res.type('text/plain').send('No pods found for workspace');
        }
        const logs = await kubernetesService_1.kubernetesService.getPodLogs(namespace, pods[0].name, lines || 100);
        res.type('text/plain').send(logs);
    }
    catch (error) {
        logger_1.logger.error('Failed to get workspace logs:', error);
        throw error;
    }
});
exports.default = router;
