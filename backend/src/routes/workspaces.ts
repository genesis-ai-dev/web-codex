import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireGroupMembership } from '../middleware/auth';
import { validate, validateQuery, validateParams, commonSchemas } from '../middleware/validation';
import { workspaceRateLimit, operationRateLimits } from '../middleware/rateLimiting';
import { AuthenticatedRequest, WorkspaceStatus, Workspace, CreateWorkspaceRequest, WorkspaceActionRequest } from '../types';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { logger } from '../config/logger';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

const router = Router();

// All workspace routes require authentication
router.use(authenticate);

// List workspaces
router.get('/', 
  validateQuery(commonSchemas.workspaceQuery),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { groupId, status, limit, offset } = req.query as any;
      
      let workspaces: Workspace[];
      
      if (groupId) {
        // Verify user has access to this group
        if (!user.groups.includes(groupId) && !user.isAdmin) {
          throw new NotFoundError('Group not found');
        }
        workspaces = await dynamodbService.getGroupWorkspaces(groupId);
      } else {
        // Get all user's workspaces across all groups
        workspaces = await dynamodbService.getUserWorkspaces(user.id);
        
        // Also get workspaces from user's groups (if user can view group workspaces)
        for (const groupId of user.groups) {
          const groupWorkspaces = await dynamodbService.getGroupWorkspaces(groupId);
          workspaces = [...workspaces, ...groupWorkspaces];
        }
        
        // Remove duplicates
        const uniqueWorkspaces = workspaces.reduce((acc, workspace) => {
          if (!acc.find(w => w.id === workspace.id)) {
            acc.push(workspace);
          }
          return acc;
        }, [] as Workspace[]);
        
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
      const updatedWorkspaces = await Promise.all(
        paginatedWorkspaces.map(async (workspace) => {
          try {
            const namespace = `group-${workspace.groupId}`;
            const k8sStatus = await kubernetesService.getDeploymentStatus(namespace, workspace.name);
            
            if (k8sStatus !== workspace.status) {
              // Update status in database
              const updatedWorkspace = await dynamodbService.updateWorkspace(workspace.id, { status: k8sStatus });
              return updatedWorkspace;
            }
            
            return workspace;
          } catch (error) {
            logger.warn(`Failed to get K8s status for workspace ${workspace.id}:`, error);
            return workspace;
          }
        })
      );
      
      res.json(updatedWorkspaces);
    } catch (error) {
      logger.error('Failed to list workspaces:', error);
      throw error;
    }
  }
);

// Create workspace
router.post('/',
  operationRateLimits.createWorkspace,
  validate(commonSchemas.createWorkspace),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const createRequest: CreateWorkspaceRequest = req.body;
      
      // Verify user has access to the target group
      if (!user.groups.includes(createRequest.groupId) && !user.isAdmin) {
        throw new NotFoundError('Group not found');
      }
      
      // Get group information
      const group = await dynamodbService.getGroup(createRequest.groupId);
      if (!group) {
        throw new NotFoundError('Group not found');
      }
      
      // Generate workspace ID and Kubernetes-compatible name
      const workspaceId = `ws_${uuidv4().replace(/-/g, '')}`;
      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
      const namespace = group.namespace;
      
      // Default resources if not provided
      const resources = createRequest.resources || {
        cpu: '2',
        memory: '4Gi',
        storage: '20Gi',
      };
      
      // Create workspace in database
      const workspace = await dynamodbService.createWorkspace({
        id: workspaceId,
        name: createRequest.name,
        description: createRequest.description,
        groupId: createRequest.groupId,
        groupName: group.displayName,
        userId: user.id,
        status: WorkspaceStatus.PENDING,
        url: `https://${k8sName}.${namespace}.workspaces.example.com`,
        resources,
        image: createRequest.image || 'codercom/code-server:latest',
        replicas: 0, // Start stopped
      });
      
      // Create Kubernetes resources
      try {
        await kubernetesService.createPVC(namespace, k8sName, resources.storage);
        await kubernetesService.createDeployment(namespace, k8sName, workspace.image, resources);
        await kubernetesService.createService(namespace, k8sName);
        
        // Update status to stopped (created but not running)
        const updatedWorkspace = await dynamodbService.updateWorkspace(workspaceId, {
          status: WorkspaceStatus.STOPPED,
        });
        
        logger.info(`Workspace created: ${workspaceId} for user ${user.id}`);
        res.status(201).json(updatedWorkspace);
      } catch (k8sError) {
        // Clean up database record if K8s creation fails
        await dynamodbService.deleteWorkspace(workspaceId);
        throw k8sError;
      }
    } catch (error) {
      logger.error('Failed to create workspace:', error);
      throw error;
    }
  }
);

// Get workspace details
router.get('/:workspaceId',
  validateParams(commonSchemas.id),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Get current status from Kubernetes
      try {
        const namespace = `group-${workspace.groupId}`;
        const k8sStatus = await kubernetesService.getDeploymentStatus(namespace, workspace.name);
        const metrics = await kubernetesService.getNamespaceMetrics(namespace);
        
        if (k8sStatus !== workspace.status) {
          const updatedWorkspace = await dynamodbService.updateWorkspace(workspaceId, { 
            status: k8sStatus,
            usage: metrics,
          });
          res.json(updatedWorkspace);
        } else {
          res.json({ ...workspace, usage: metrics });
        }
      } catch (error) {
        logger.warn(`Failed to get K8s status for workspace ${workspaceId}:`, error);
        res.json(workspace);
      }
    } catch (error) {
      logger.error('Failed to get workspace:', error);
      throw error;
    }
  }
);

// Update workspace
router.patch('/:workspaceId',
  validateParams(commonSchemas.id),
  validate(commonSchemas.updateWorkspace),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      const updatedWorkspace = await dynamodbService.updateWorkspace(workspaceId, req.body);
      
      logger.info(`Workspace updated: ${workspaceId} by user ${user.id}`);
      res.json(updatedWorkspace);
    } catch (error) {
      logger.error('Failed to update workspace:', error);
      throw error;
    }
  }
);

// Delete workspace
router.delete('/:workspaceId',
  operationRateLimits.deleteWorkspace,
  validateParams(commonSchemas.id),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      const namespace = `group-${workspace.groupId}`;
      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
      
      // Delete Kubernetes resources
      try {
        await kubernetesService.deleteDeployment(namespace, k8sName);
        await kubernetesService.coreV1Api.deleteNamespacedService(k8sName, namespace);
        await kubernetesService.coreV1Api.deleteNamespacedPersistentVolumeClaim(`${k8sName}-pvc`, namespace);
      } catch (k8sError) {
        logger.warn(`Failed to delete K8s resources for workspace ${workspaceId}:`, k8sError);
      }
      
      // Delete from database
      await dynamodbService.deleteWorkspace(workspaceId);
      
      logger.info(`Workspace deleted: ${workspaceId} by user ${user.id}`);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete workspace:', error);
      throw error;
    }
  }
);

// Workspace actions (start/stop/restart)
router.post('/:workspaceId/actions',
  operationRateLimits.workspaceActions,
  validateParams(commonSchemas.id),
  validate(commonSchemas.workspaceAction),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      const { type }: WorkspaceActionRequest = req.body;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      const namespace = `group-${workspace.groupId}`;
      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
      
      let newStatus: WorkspaceStatus;
      let replicas: number;
      
      switch (type) {
        case 'start':
          if (workspace.status === WorkspaceStatus.RUNNING) {
            throw new ConflictError('Workspace is already running');
          }
          newStatus = WorkspaceStatus.STARTING;
          replicas = 1;
          break;
          
        case 'stop':
          if (workspace.status === WorkspaceStatus.STOPPED) {
            throw new ConflictError('Workspace is already stopped');
          }
          newStatus = WorkspaceStatus.STOPPING;
          replicas = 0;
          break;
          
        case 'restart':
          newStatus = WorkspaceStatus.STARTING;
          replicas = 1;
          break;
          
        default:
          throw new ValidationError('Invalid action type');
      }
      
      // Update status in database
      await dynamodbService.updateWorkspace(workspaceId, { 
        status: newStatus,
        replicas,
        lastAccessedAt: new Date(),
      });
      
      // Scale deployment in Kubernetes
      await kubernetesService.scaleDeployment(namespace, k8sName, replicas);
      
      // Wait a moment and check final status
      setTimeout(async () => {
        try {
          const finalStatus = await kubernetesService.getDeploymentStatus(namespace, k8sName);
          await dynamodbService.updateWorkspace(workspaceId, { status: finalStatus });
        } catch (error) {
          logger.warn(`Failed to update final status for workspace ${workspaceId}:`, error);
        }
      }, 5000);
      
      const updatedWorkspace = await dynamodbService.getWorkspace(workspaceId);
      
      logger.info(`Workspace action ${type} performed on ${workspaceId} by user ${user.id}`);
      res.json(updatedWorkspace);
    } catch (error) {
      logger.error('Failed to perform workspace action:', error);
      throw error;
    }
  }
);

// Get workspace metrics
router.get('/:workspaceId/metrics',
  validateParams(commonSchemas.id),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      const namespace = `group-${workspace.groupId}`;
      const metrics = await kubernetesService.getNamespaceMetrics(namespace);
      
      res.json(metrics);
    } catch (error) {
      logger.error('Failed to get workspace metrics:', error);
      throw error;
    }
  }
);

// Get workspace logs
router.get('/:workspaceId/logs',
  validateParams(commonSchemas.id),
  validateQuery({
    type: 'object',
    properties: {
      lines: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
      since: { type: 'string', format: 'date-time', optional: true },
    },
    additionalProperties: false,
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;
      const { lines } = req.query as any;
      
      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      
      // Verify user has access
      if (workspace.userId !== user.id && !user.groups.includes(workspace.groupId) && !user.isAdmin) {
        throw new NotFoundError('Workspace not found');
      }
      
      const namespace = `group-${workspace.groupId}`;
      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
      
      // Get pod name for the workspace
      const pods = await kubernetesService.listPods(namespace, `app=${k8sName}`);
      if (pods.length === 0) {
        return res.type('text/plain').send('No pods found for workspace');
      }
      
      const logs = await kubernetesService.getPodLogs(namespace, pods[0].name, lines || 100);
      
      res.type('text/plain').send(logs);
    } catch (error) {
      logger.error('Failed to get workspace logs:', error);
      throw error;
    }
  }
);

export default router;
