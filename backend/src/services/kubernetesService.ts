import * as k8s from '@kubernetes/client-node';
import { config } from '../config';
import { logger } from '../config/logger';
import { KubernetesError, NotFoundError } from '../utils/errors';
import { PodStatus, WorkspaceStatus, ResourceUsage } from '../types';

class KubernetesService {
  private kc: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;
  private rbacV1Api: k8s.RbacAuthorizationV1Api;
  private metricsClient: k8s.Metrics;

  constructor() {
    try {
      logger.info('Initializing Kubernetes service...');
      logger.info(`Environment: ${config.nodeEnv} (isProduction: ${config.isProduction})`);

      this.kc = new k8s.KubeConfig();
      logger.info('KubeConfig object created');

      if (config.isProduction) {
        logger.info('Loading Kubernetes config from cluster (in-cluster mode)');
        try {
          this.kc.loadFromCluster();
          logger.info('Successfully loaded Kubernetes config from cluster');
        } catch (error) {
          logger.error('Failed to load Kubernetes config from cluster:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error;
        }
      } else {
        logger.info('Loading Kubernetes config from default location');
        try {
          this.kc.loadFromDefault();
          logger.info('Successfully loaded Kubernetes config from default location');
        } catch (error) {
          logger.error('Failed to load Kubernetes config from default location:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error;
        }
      }

      logger.info('Creating Kubernetes API clients...');
      this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
      logger.info('CoreV1Api client created');

      this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
      logger.info('AppsV1Api client created');

      this.rbacV1Api = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
      logger.info('RbacAuthorizationV1Api client created');

      this.metricsClient = new k8s.Metrics(this.kc);
      logger.info('Metrics client created');

      logger.info('Kubernetes service initialized successfully');
    } catch (error) {
      logger.error('FATAL: Failed to initialize Kubernetes service:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  // Namespace operations
  async createNamespace(name: string, labels: Record<string, string> = {}): Promise<void> {
    try {
      const namespace: k8s.V1Namespace = {
        metadata: {
          name,
          labels: {
            'app.kubernetes.io/managed-by': 'vscode-platform',
            ...labels,
          },
        },
      };

      await this.coreV1Api.createNamespace({ body: namespace });
      logger.info(`Namespace created: ${name}`);

      // Wait for namespace to be fully ready
      await this.waitForNamespace(name, 30000); // 30 second timeout
    } catch (error) {
      if (error.statusCode === 409) {
        logger.warn(`Namespace already exists: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to create namespace ${name}`, error);
    }
  }

  private async waitForNamespace(name: string, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every 1 second

    while (Date.now() - startTime < timeoutMs) {
      try {
        const namespace = await this.coreV1Api.readNamespace({ name });
        if (namespace.status?.phase === 'Active') {
          logger.info(`Namespace ${name} is active and ready`);
          return;
        }
      } catch (error) {
        // Namespace not ready yet, continue polling
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new KubernetesError(`Timeout waiting for namespace ${name} to become ready`);
  }
  async listNamespaces(): Promise<k8s.V1NamespaceList> {
    try {
      const namespaceList = await this.coreV1Api.listNamespace();
      return namespaceList;
    } catch (error) {
      throw new KubernetesError('Failed to list namespaces', error);
    }
  }

  async deleteNamespace(name: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespace({ name });
      logger.info(`Namespace deleted: ${name}`);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`Namespace not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete namespace ${name}`, error);
    }
  }

  async namespaceExists(name: string): Promise<boolean> {
    try {
      await this.coreV1Api.readNamespace({ name });
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw new KubernetesError(`Failed to check namespace ${name}`, error);
    }
  }

  // Resource quota operations
  async createResourceQuota(namespace: string, quota: any): Promise<void> {
    const maxRetries = 5;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resourceQuota: k8s.V1ResourceQuota = {
          metadata: {
            name: `${namespace}-quota`,
            namespace,
          },
          spec: {
            hard: {
              'requests.cpu': quota.cpu,
              'requests.memory': quota.memory,
              'limits.cpu': quota.cpu,
              'limits.memory': quota.memory,
              'persistentvolumeclaims': quota.storage,
              pods: quota.pods.toString(),
            },
          },
        };

        await this.coreV1Api.createNamespacedResourceQuota({ namespace, body: resourceQuota });
        logger.info(`Resource quota created for namespace: ${namespace}`);
        return;
      } catch (error) {
        if (error.statusCode === 404 && attempt < maxRetries) {
          logger.warn(`Namespace ${namespace} not ready yet, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        throw new KubernetesError(`Failed to create resource quota for ${namespace}`, error);
      }
    }
  }

  // Pod operations
  async listPods(namespace: string, labelSelector?: string): Promise<PodStatus[]> {
    try {
      const response = await this.coreV1Api.listNamespacedPod({
        namespace,
        labelSelector,
      });

      return response.items.map(pod => ({
        name: pod.metadata?.name || '',
        status: pod.status?.phase || 'Unknown',
        ready: pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') || false,
        restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
        age: this.calculateAge(pod.metadata?.creationTimestamp),
      }));
    } catch (error) {
      throw new KubernetesError(`Failed to list pods in namespace ${namespace}`, error);
    }
  }

  async getPodLogs(namespace: string, podName: string, lines: number = 100): Promise<string> {
    try {
      const response = await this.coreV1Api.readNamespacedPodLog({ name: podName, namespace, tailLines: lines });

      return response;
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundError(`Pod ${podName} not found in namespace ${namespace}`);
      }
      throw new KubernetesError(`Failed to get logs for pod ${podName}`, error);
    }
  }

  // Deployment operations
  async createDeployment(
    namespace: string,
    name: string,
    image: string,
    resources: any,
    labels: Record<string, string> = {}
  ): Promise<void> {
    try {
      const deployment: k8s.V1Deployment = {
        metadata: {
          name,
          namespace,
          labels: {
            app: name,
            'app.kubernetes.io/managed-by': 'vscode-platform',
            ...labels,
          },
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: { app: name },
          },
          template: {
            metadata: {
              labels: { app: name, ...labels },
            },
            spec: {
              containers: [{
                name: 'code-server',
                image,
                ports: [{ containerPort: 8080 }],
                env: [
                  { name: 'PASSWORD', value: 'vscode' }, // TODO: Generate secure password
                ],
                resources: {
                  requests: {
                    cpu: resources.cpu,
                    memory: resources.memory,
                  },
                  limits: {
                    cpu: resources.cpu,
                    memory: resources.memory,
                  },
                },
                volumeMounts: [{
                  name: 'workspace-storage',
                  mountPath: '/home/coder',
                }],
              }],
              volumes: [{
                name: 'workspace-storage',
                persistentVolumeClaim: {
                  claimName: `${name}-pvc`,
                },
              }],
            },
          },
        },
      };

      await this.appsV1Api.createNamespacedDeployment({ namespace, body: deployment });
      logger.info(`Deployment created: ${name} in namespace ${namespace}`);
    } catch (error) {
      throw new KubernetesError(`Failed to create deployment ${name}`, error);
    }
  }

  async scaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
    try {
      const patch = {
        spec: {
          replicas,
        },
      };

      await this.appsV1Api.patchNamespacedDeploymentScale({
        namespace,
        name,
        body: patch,
      });

      logger.info(`Deployment ${name} scaled to ${replicas} replicas`);
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundError(`Deployment ${name} not found in namespace ${namespace}`);
      }
      throw new KubernetesError(`Failed to scale deployment ${name}`, error);
    }
  }

  async deleteDeployment(namespace: string, name: string): Promise<void> {
    try {
      await this.appsV1Api.deleteNamespacedDeployment({ name, namespace });
      logger.info(`Deployment deleted: ${name} in namespace ${namespace}`);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`Deployment not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete deployment ${name}`, error);
    }
  }

  async getDeploymentStatus(namespace: string, name: string): Promise<WorkspaceStatus> {
    try {
      const response = await this.appsV1Api.readNamespacedDeployment({ name, namespace });
      const deployment = response;
      
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const replicas = deployment.spec?.replicas || 0;
      
      if (replicas === 0) {
        return WorkspaceStatus.STOPPED;
      }
      
      if (readyReplicas === 0) {
        return WorkspaceStatus.STARTING;
      }
      
      if (readyReplicas < replicas) {
        return WorkspaceStatus.STARTING;
      }
      
      return WorkspaceStatus.RUNNING;
    } catch (error) {
      if (error.statusCode === 404) {
        return WorkspaceStatus.STOPPED;
      }
      throw new KubernetesError(`Failed to get deployment status for ${name}`, error);
    }
  }

  // Service operations
  async createService(namespace: string, name: string, labels: Record<string, string> = {}): Promise<void> {
    try {
      const service: k8s.V1Service = {
        metadata: {
          name,
          namespace,
          labels: {
            app: name,
            'app.kubernetes.io/managed-by': 'vscode-platform',
            ...labels,
          },
        },
        spec: {
          selector: { app: name },
          ports: [{
            port: 80,
            targetPort: 8080,
            protocol: 'TCP',
          }],
          type: 'ClusterIP',
        },
      };

      await this.coreV1Api.createNamespacedService({ namespace, body: service });
      logger.info(`Service created: ${name} in namespace ${namespace}`);
    } catch (error) {
      throw new KubernetesError(`Failed to create service ${name}`, error);
    }
  }
  async deleteNamespacedService(name: string, namespace: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedService({ name, namespace });
      logger.info(`Service deleted: ${name} in namespace ${namespace}`);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`Service not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete service ${name}`, error);
    }
  }

  // PVC operations
  async createPVC(namespace: string, name: string, size: string, storageClass: string = 'gp3'): Promise<void> {
    try {
      const pvc: k8s.V1PersistentVolumeClaim = {
        metadata: {
          name: `${name}-pvc`,
          namespace,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: storageClass,
          resources: {
            requests: {
              storage: size,
            },
          },
        },
      };

      await this.coreV1Api.createNamespacedPersistentVolumeClaim({ namespace, body: pvc });
      logger.info(`PVC created: ${name}-pvc in namespace ${namespace}`);
    } catch (error) {
      throw new KubernetesError(`Failed to create PVC for ${name}`, error);
    }
  }
  async deleteNamespacedPVC(name: string, namespace: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedPersistentVolumeClaim({ name, namespace });
      logger.info(`PVC deleted: ${name} in namespace ${namespace}`);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`PVC not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete PVC ${name}`, error);
    }
  }

  // Metrics operations
  async getNamespaceMetrics(namespace: string): Promise<ResourceUsage> {
    try {
      const pods = await this.metricsClient.getPodMetrics(namespace);
      
      let totalCPU = 0;
      let totalMemory = 0;
      
      for (const pod of pods.items) {
        for (const container of pod.containers) {
          if (container.usage.cpu) {
            totalCPU += this.parseCPU(container.usage.cpu);
          }
          if (container.usage.memory) {
            totalMemory += this.parseMemory(container.usage.memory);
          }
        }
      }

      // TODO: Get quota from ResourceQuota object
      const quota = {
        cpu: '50',
        memory: '100Gi',
        storage: '500Gi',
        pods: 100,
      };

      return {
        cpu: {
          used: totalCPU.toString(),
          total: quota.cpu,
          percentage: (totalCPU / parseFloat(quota.cpu)) * 100,
        },
        memory: {
          used: this.formatMemory(totalMemory),
          total: quota.memory,
          percentage: (totalMemory / this.parseMemory(quota.memory)) * 100,
        },
        storage: {
          used: '0', // TODO: Implement storage metrics
          total: quota.storage,
          percentage: 0,
        },
        pods: {
          used: pods.items.length,
          total: quota.pods,
          percentage: (pods.items.length / quota.pods) * 100,
        },
      };
    } catch (error) {
      logger.warn(`Failed to get metrics for namespace ${namespace}:`, error);
      // Return empty metrics if metrics server is not available
      return {
        cpu: { used: '0', total: '50', percentage: 0 },
        memory: { used: '0Gi', total: '100Gi', percentage: 0 },
        storage: { used: '0Gi', total: '500Gi', percentage: 0 },
        pods: { used: 0, total: 100, percentage: 0 },
      };
    }
  }

  // Utility methods
  private calculateAge(creationTimestamp?: Date): string {
    if (!creationTimestamp) return 'Unknown';
    
    const now = new Date();
    const diff = now.getTime() - creationTimestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }

  private parseCPU(cpu: string): number {
    if (cpu.endsWith('m')) {
      return parseFloat(cpu.slice(0, -1)) / 1000;
    }
    return parseFloat(cpu);
  }

  private parseMemory(memory: string): number {
    const units = { Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024 };
    
    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        return parseFloat(memory.slice(0, -unit.length)) * multiplier;
      }
    }
    
    return parseFloat(memory);
  }

  private formatMemory(bytes: number): string {
    const units = [
      { name: 'Gi', size: 1024 * 1024 * 1024 },
      { name: 'Mi', size: 1024 * 1024 },
      { name: 'Ki', size: 1024 },
    ];
    
    for (const unit of units) {
      if (bytes >= unit.size) {
        return `${(bytes / unit.size).toFixed(1)}${unit.name}`;
      }
    }
    
    return `${bytes}`;
  }
}

export const kubernetesService = new KubernetesService();
