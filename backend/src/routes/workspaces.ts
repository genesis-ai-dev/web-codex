import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { authenticate, requireGroupMembership, requireGroupAdmin, isGroupAdmin } from '../middleware/auth';
import { validate, validateQuery, validateParams, commonSchemas } from '../middleware/validation';
import { workspaceRateLimit, operationRateLimits } from '../middleware/rateLimiting';
import { AuthenticatedRequest, WorkspaceStatus, Workspace, CreateWorkspaceRequest, WorkspaceActionRequest, ResourceTier } from '../types';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { logger } from '../config/logger';
import { NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../utils/errors';
import { getResourcesForTier } from '../config/resourceTiers';

const router = Router();

// Helper function to generate a secure random password
function generatePassword(length: number = 24): string {
  return randomBytes(length).toString('hex').substring(0, length);
}

// All workspace routes require authentication
router.use(authenticate);

// Helper function to get namespace for a workspace
async function getWorkspaceNamespace(workspace: Workspace): Promise<string | null> {
  const group = await dynamodbService.getGroup(workspace.groupId);
  return group ? group.namespace : null;
}

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
      
      // Update workspace statuses and metrics from Kubernetes
      const updatedWorkspaces = await Promise.all(
        paginatedWorkspaces.map(async (workspace) => {
          try {
            const namespace = await getWorkspaceNamespace(workspace);
            if (!namespace) {
              logger.warn(`No namespace found for workspace ${workspace.id}`);
              return workspace;
            }

            const k8sName = `workspace-${workspace.id.substring(3)}`.toLowerCase();
            const k8sStatus = await kubernetesService.getDeploymentStatus(namespace, k8sName);

            // Fetch metrics for running workspaces
            let metrics: any = undefined;
            if (k8sStatus === 'running') {
              try {
                metrics = await kubernetesService.getNamespaceMetrics(namespace);
              } catch (metricsError) {
                logger.warn(`Failed to get metrics for workspace ${workspace.id}:`, metricsError);
                // Continue without metrics rather than failing the whole request
              }
            }

            if (k8sStatus !== workspace.status) {
              // Update status and metrics in database
              const updatedWorkspace = await dynamodbService.updateWorkspace(workspace.id, {
                status: k8sStatus,
                ...(metrics && { usage: metrics })
              });
              return updatedWorkspace;
            }

            // Return workspace with fresh metrics even if status hasn't changed
            return { ...workspace, ...(metrics && { usage: metrics }) };
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

      // Generate secure password for code-server authentication
      const password = generatePassword(24);

      // Determine resources based on tier or custom resources
      let resources = createRequest.resources ||
        (createRequest.tier ? getResourcesForTier(createRequest.tier) : getResourcesForTier(ResourceTier.SMALL_TEAM));

      // Get default workspace image from system settings if not provided
      let workspaceImage = createRequest.image;
      if (!workspaceImage) {
        try {
          const settings = await dynamodbService.getSystemSettings();
          workspaceImage = settings.defaultWorkspaceImage;
        } catch (error) {
          logger.warn('Failed to get system settings, using fallback default image:', error);
          workspaceImage = 'ghcr.io/andrewhertog/code-server:0.0.1-alpha.2';
        }
      }

      // Create workspace in database with STOPPED status since it will be created with 0 replicas
      const workspace = await dynamodbService.createWorkspace({
        id: workspaceId,
        name: createRequest.name,
        description: createRequest.description,
        groupId: createRequest.groupId,
        groupName: group.displayName,
        userId: user.id,
        status: WorkspaceStatus.STOPPED,
        url: `https://loadbalancer.frontierrnd.com/${namespace}/${k8sName}`,
        password,
        resources,
        image: workspaceImage,
        replicas: 0, // Start stopped
      });

      // Create Kubernetes resources
      try {
        // Ensure namespace exists (create if it doesn't)
        const namespaceExists = await kubernetesService.namespaceExists(namespace);
        if (!namespaceExists) {
          logger.warn(`Namespace ${namespace} does not exist for group ${createRequest.groupId}, creating it now`);
          await kubernetesService.createNamespace(namespace, {
            'codex-platform/group-id': createRequest.groupId,
            'codex-platform/group-name': group.name,
          });

          // Create resource quota for the namespace
          if (group.resourceQuota) {
            await kubernetesService.createResourceQuota(namespace, group.resourceQuota);
          }
        }

        // Create secret with code-server config
        await kubernetesService.createCodeServerSecret(namespace, k8sName, password);

        // TODO: Re-enable PVC creation once storage is configured
        // await kubernetesService.createPVC(namespace, k8sName, resources.storage);
        await kubernetesService.createDeployment(namespace, k8sName, workspace.image, resources);
        await kubernetesService.createService(namespace, k8sName);

        // Create nginx proxy infrastructure (Deployment, Service) - only once per namespace
        await kubernetesService.createNginxProxyDeployment(namespace);
        await kubernetesService.createNginxProxyService(namespace);

        // Add this workspace to the nginx proxy ConfigMap and update HTTPRoute
        await kubernetesService.addWorkspaceToNginxProxyConfig(namespace, k8sName);

        // Create or update HTTPRoute for Gateway API (rebuilds from all workspaces in namespace)
        const pathPrefix = `/${namespace}/${k8sName}`;
        await kubernetesService.createOrUpdateHTTPRoute(namespace, pathPrefix);

        logger.info(`Workspace created: ${workspaceId} for user ${user.id}`);
        res.status(201).json(workspace);
      } catch (k8sError) {
        // Clean up any resources that were created before the failure
        logger.error(`Workspace creation failed, cleaning up resources for ${workspaceId}:`, k8sError);
        try {
          await kubernetesService.deleteDeployment(namespace, k8sName);
          await kubernetesService.deleteNamespacedService(k8sName, namespace);
          await kubernetesService.deleteNamespacedSecret(`${k8sName}-config`, namespace);
          await kubernetesService.deleteNamespacedConfigMap('code-server-nginx-config', namespace);
          await kubernetesService.deleteDeployment(namespace, 'code-server-proxy');
          await kubernetesService.deleteNamespacedService('code-server-proxy-service', namespace);
          await kubernetesService.deleteHTTPRoute(namespace);
        } catch (cleanupError) {
          logger.warn(`Failed to clean up K8s resources during rollback for ${workspaceId}:`, cleanupError);
        }
        // Clean up database record
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
  validateParams(commonSchemas.workspaceId),
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
        const namespace = await getWorkspaceNamespace(workspace);
        if (!namespace) {
          logger.warn(`No namespace found for workspace ${workspaceId}`);
          return res.json(workspace);
        }

        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        const k8sStatus = await kubernetesService.getDeploymentStatus(namespace, k8sName);
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
  validateParams(commonSchemas.workspaceId),
  validate(commonSchemas.updateWorkspace),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;

      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Verify user has permission to update:
      // - Owner can update their own workspace
      // - Group admins can update any workspace in their group
      // - Platform admins can update any workspace
      const isOwner = workspace.userId === user.id;
      const isGroupAdminForWorkspace = isGroupAdmin(user, workspace.groupId);

      if (!isOwner && !isGroupAdminForWorkspace && !user.isAdmin) {
        throw new AuthorizationError('Insufficient permissions to update this workspace');
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
  validateParams(commonSchemas.workspaceId),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { workspaceId } = req.params;

      const workspace = await dynamodbService.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      // Verify user has permission to delete:
      // - Owner can delete their own workspace
      // - Group admins can delete any workspace in their group
      // - Platform admins can delete any workspace
      const isOwner = workspace.userId === user.id;
      const isGroupAdminForWorkspace = isGroupAdmin(user, workspace.groupId);

      if (!isOwner && !isGroupAdminForWorkspace && !user.isAdmin) {
        throw new AuthorizationError('Insufficient permissions to delete this workspace');
      }

      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();

      // Delete Kubernetes resources
      const namespace = await getWorkspaceNamespace(workspace);
      if (namespace) {
        try {
          await kubernetesService.deleteDeployment(namespace, k8sName);
          await kubernetesService.deleteNamespacedService(k8sName, namespace);
          await kubernetesService.deleteNamespacedSecret(`${k8sName}-config`, namespace);
          // TODO: Re-enable PVC deletion once storage is configured
          // await kubernetesService.deleteNamespacedPVC(`${k8sName}-pvc`, namespace);

          // Remove this workspace from the nginx proxy ConfigMap
          await kubernetesService.removeWorkspaceFromNginxProxyConfig(namespace, k8sName);

          // Note: We don't delete the shared nginx proxy resources (Deployment, Service, HTTPRoute)
          // as they are shared across all workspaces in the namespace.

          logger.info(`Kubernetes resources deleted for workspace ${workspaceId} in namespace ${namespace}`);
        } catch (k8sError) {
          logger.error(`Failed to delete K8s resources for workspace ${workspaceId}:`, k8sError);
          // Continue with database deletion even if K8s deletion fails
        }
      } else {
        logger.warn(`Group ${workspace.groupId} not found for workspace ${workspaceId}, skipping K8s cleanup`);
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
  validateParams(commonSchemas.workspaceId),
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

      // Verify user has permission to control workspace:
      // - Owner can control their own workspace
      // - Group admins can control any workspace in their group
      // - Platform admins can control any workspace
      const isOwner = workspace.userId === user.id;
      const isGroupAdminForWorkspace = isGroupAdmin(user, workspace.groupId);

      if (!isOwner && !isGroupAdminForWorkspace && !user.isAdmin) {
        throw new AuthorizationError('Insufficient permissions to control this workspace');
      }

      const namespace = await getWorkspaceNamespace(workspace);
      if (!namespace) {
        throw new NotFoundError('Workspace namespace not found');
      }

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
        lastAccessedAt: new Date().toISOString(),
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

// Sync workspace from Kubernetes
router.post('/:workspaceId/sync',
  validateParams(commonSchemas.workspaceId),
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

      const namespace = await getWorkspaceNamespace(workspace);
      if (!namespace) {
        throw new NotFoundError('Workspace namespace not found');
      }

      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();

      logger.info(`Starting sync for workspace ${workspaceId} in namespace ${namespace} with k8s name ${k8sName}`);

      // Get current state from Kubernetes
      const k8sStatus = await kubernetesService.getDeploymentStatus(namespace, k8sName);
      logger.info(`Got K8s status for ${workspaceId}: ${k8sStatus}`);

      const k8sDetails = await kubernetesService.getDeploymentDetails(namespace, k8sName);
      logger.info(`Got K8s details for ${workspaceId}:`, k8sDetails);

      // Update workspace with K8s state
      const updates: Partial<Workspace> = {
        status: k8sStatus,
      };

      if (k8sDetails) {
        updates.image = k8sDetails.image;
        updates.replicas = k8sDetails.replicas;
        logger.info(`Will update image to: ${k8sDetails.image}, replicas to: ${k8sDetails.replicas}`);
      }

      // Try to get metrics, but don't fail if it errors
      try {
        const metrics = await kubernetesService.getNamespaceMetrics(namespace);
        updates.usage = metrics;
      } catch (metricsError) {
        logger.warn(`Failed to get metrics for workspace ${workspaceId}, continuing without metrics:`, metricsError);
      }

      logger.info(`Updating workspace ${workspaceId} with:`, updates);
      const updatedWorkspace = await dynamodbService.updateWorkspace(workspaceId, updates);

      logger.info(`Workspace synced from K8s: ${workspaceId} by user ${user.id}. Updated fields:`, Object.keys(updates));
      res.json(updatedWorkspace);
    } catch (error) {
      logger.error('Failed to sync workspace from K8s:', error);
      throw error;
    }
  }
);

// Get workspace metrics
router.get('/:workspaceId/metrics',
  validateParams(commonSchemas.workspaceId),
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

      const namespace = await getWorkspaceNamespace(workspace);
      if (!namespace) {
        throw new NotFoundError('Workspace namespace not found');
      }

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
  validateParams(commonSchemas.workspaceId),
  validateQuery(commonSchemas.workspaceLogsQuery),
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

      const namespace = await getWorkspaceNamespace(workspace);
      if (!namespace) {
        throw new NotFoundError('Workspace namespace not found');
      }

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

// Get workspace component health
router.get('/:workspaceId/health',
  validateParams(commonSchemas.workspaceId),
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

      const namespace = await getWorkspaceNamespace(workspace);
      if (!namespace) {
        throw new NotFoundError('Workspace namespace not found');
      }

      const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();

      const componentHealth = await kubernetesService.getWorkspaceComponentHealth(namespace, k8sName);

      res.json(componentHealth);
    } catch (error) {
      logger.error('Failed to get workspace component health:', error);
      throw error;
    }
  }
);

export default router;
