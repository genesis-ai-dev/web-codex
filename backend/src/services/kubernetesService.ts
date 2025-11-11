import * as k8s from '@kubernetes/client-node';
import { config } from '../config';
import { logger } from '../config/logger';
import { KubernetesError, NotFoundError } from '../utils/errors';
import { PodStatus, WorkspaceStatus, ResourceUsage, ComponentHealthStatus } from '../types';

class KubernetesService {
  private kc: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;
  private rbacV1Api: k8s.RbacAuthorizationV1Api;
  private networkingV1Api: k8s.NetworkingV1Api;
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

      this.networkingV1Api = this.kc.makeApiClient(k8s.NetworkingV1Api);
      logger.info('NetworkingV1Api client created');

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
    } catch (error: any) {
      // Check multiple possible locations for the 404 status code
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        return false;
      }
      // Also check if the error body indicates not found
      if (error.body && typeof error.body === 'string' && error.body.includes('"code":404')) {
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
    connectionToken: string,
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
          revisionHistoryLimit: 10,
          progressDeadlineSeconds: 600,
          selector: {
            matchLabels: { app: name },
          },
          strategy: {
            type: 'RollingUpdate',
            rollingUpdate: {
              maxSurge: '25%',
              maxUnavailable: '25%',
            },
          },
          template: {
            metadata: {
              labels: { app: name, ...labels },
            },
            spec: {
              restartPolicy: 'Always',
              dnsPolicy: 'ClusterFirst',
              schedulerName: 'default-scheduler',
              terminationGracePeriodSeconds: 30,
              securityContext: {},
              containers: [{
                name: 'codex',
                image,
                imagePullPolicy: 'IfNotPresent',
                args: [
                  '--host=0.0.0.0',
                  '--port=8000',
                  `--connection-token=${connectionToken}`,
                  `--server-base-path=/${namespace}/${name}`,
                ],
                ports: [{
                  containerPort: 8000,
                  name: 'http',
                  protocol: 'TCP',
                }],
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
                startupProbe: {
                  tcpSocket: {
                    port: 8000,
                  },
                  failureThreshold: 24,
                  periodSeconds: 10,
                  timeoutSeconds: 240,
                  successThreshold: 1,
                },
                livenessProbe: {
                  tcpSocket: {
                    port: 8000,
                  },
                  failureThreshold: 3,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  successThreshold: 1,
                },
                readinessProbe: {
                  tcpSocket: {
                    port: 8000,
                  },
                  failureThreshold: 2,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  successThreshold: 1,
                },
                terminationMessagePath: '/dev/termination-log',
                terminationMessagePolicy: 'File',
                // TODO: Re-enable volume mounts once PVC storage is configured
                // volumeMounts: [{
                //   name: 'workspace-storage',
                //   mountPath: '/home/coder',
                // }],
              }],
              // TODO: Re-enable volumes once PVC storage is configured
              // volumes: [{
              //   name: 'workspace-storage',
              //   persistentVolumeClaim: {
              //     claimName: `${name}-pvc`,
              //   },
              // }],
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

  async getWorkspaceComponentHealth(namespace: string, name: string): Promise<ComponentHealthStatus[]> {
    const components: ComponentHealthStatus[] = [];

    // Check Deployment
    try {
      const deployment = await this.appsV1Api.readNamespacedDeployment({ name, namespace });
      const replicas = deployment.spec?.replicas || 0;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const availableReplicas = deployment.status?.availableReplicas || 0;
      const unavailableReplicas = deployment.status?.unavailableReplicas || 0;

      let healthy = true;
      let reason = '';

      if (replicas === 0) {
        healthy = true;
        reason = 'Deployment scaled to 0 replicas (workspace stopped)';
      } else if (readyReplicas < replicas) {
        healthy = false;
        reason = `Only ${readyReplicas} of ${replicas} replicas are ready`;

        // Check for more specific issues
        const conditions = deployment.status?.conditions || [];
        const progressingCondition = conditions.find(c => c.type === 'Progressing');
        const availableCondition = conditions.find(c => c.type === 'Available');

        if (progressingCondition?.status === 'False') {
          reason = progressingCondition.message || reason;
        } else if (availableCondition?.status === 'False') {
          reason = availableCondition.message || reason;
        }
      } else if (unavailableReplicas > 0) {
        healthy = false;
        reason = `${unavailableReplicas} replicas are unavailable`;
      } else {
        healthy = true;
        reason = `All ${replicas} replicas are ready and available`;
      }

      components.push({
        name: 'Deployment',
        type: 'deployment',
        healthy,
        status: deployment.status?.conditions?.find(c => c.type === 'Available')?.status === 'True' ? 'Available' : 'Unavailable',
        reason,
        details: {
          replicas: replicas,
          readyReplicas: readyReplicas,
          availableReplicas: availableReplicas,
          updatedReplicas: deployment.status?.updatedReplicas || 0,
        }
      });
    } catch (error) {
      if (error.statusCode === 404) {
        components.push({
          name: 'Deployment',
          type: 'deployment',
          healthy: false,
          status: 'NotFound',
          reason: 'Deployment does not exist',
          details: {}
        });
      } else {
        logger.warn(`Failed to get deployment health for ${name}:`, error);
        components.push({
          name: 'Deployment',
          type: 'deployment',
          healthy: false,
          status: 'Unknown',
          reason: 'Failed to fetch deployment status',
          details: { error: String(error) }
        });
      }
    }

    // Check Service
    try {
      const service = await this.coreV1Api.readNamespacedService({ name, namespace });
      const clusterIP = service.spec?.clusterIP;
      const ports = service.spec?.ports || [];

      let healthy = true;
      let reason = '';

      if (!clusterIP || clusterIP === 'None') {
        healthy = false;
        reason = 'Service has no ClusterIP assigned';
      } else if (ports.length === 0) {
        healthy = false;
        reason = 'Service has no ports configured';
      } else {
        healthy = true;
        reason = `Service is available at ${clusterIP}`;
      }

      components.push({
        name: 'Service',
        type: 'service',
        healthy,
        status: healthy ? 'Active' : 'Misconfigured',
        reason,
        details: {
          clusterIP: clusterIP || 'None',
          ports: ports.map(p => ({ port: p.port, targetPort: p.targetPort, protocol: p.protocol })),
          type: service.spec?.type || 'ClusterIP',
        }
      });
    } catch (error) {
      if (error.statusCode === 404) {
        components.push({
          name: 'Service',
          type: 'service',
          healthy: false,
          status: 'NotFound',
          reason: 'Service does not exist',
          details: {}
        });
      } else {
        logger.warn(`Failed to get service health for ${name}:`, error);
        components.push({
          name: 'Service',
          type: 'service',
          healthy: false,
          status: 'Unknown',
          reason: 'Failed to fetch service status',
          details: { error: String(error) }
        });
      }
    }

    // Check PVC
    try {
      const pvcName = `${name}-pvc`;
      const pvc = await this.coreV1Api.readNamespacedPersistentVolumeClaim({ name: pvcName, namespace });
      const phase = pvc.status?.phase;

      let healthy = false;
      let reason = '';

      if (phase === 'Bound') {
        healthy = true;
        reason = 'PVC is bound to a persistent volume';
      } else if (phase === 'Pending') {
        healthy = false;
        reason = 'PVC is pending - waiting for volume provisioning';
      } else if (phase === 'Lost') {
        healthy = false;
        reason = 'PVC has lost its underlying volume';
      } else {
        healthy = false;
        reason = `PVC is in ${phase} state`;
      }

      components.push({
        name: 'PersistentVolumeClaim',
        type: 'pvc',
        healthy,
        status: phase || 'Unknown',
        reason,
        details: {
          capacity: pvc.status?.capacity?.storage || 'Unknown',
          storageClass: pvc.spec?.storageClassName || 'default',
          accessModes: pvc.spec?.accessModes || [],
          volumeName: pvc.spec?.volumeName || 'None',
        }
      });
    } catch (error) {
      if (error.statusCode === 404) {
        components.push({
          name: 'PersistentVolumeClaim',
          type: 'pvc',
          healthy: false,
          status: 'NotFound',
          reason: 'PVC does not exist',
          details: {}
        });
      } else {
        logger.warn(`Failed to get PVC health for ${name}-pvc:`, error);
        components.push({
          name: 'PersistentVolumeClaim',
          type: 'pvc',
          healthy: false,
          status: 'Unknown',
          reason: 'Failed to fetch PVC status',
          details: { error: String(error) }
        });
      }
    }

    // Check Pods
    try {
      const pods = await this.coreV1Api.listNamespacedPod({
        namespace,
        labelSelector: `app=${name}`,
      });

      if (pods.items.length === 0) {
        components.push({
          name: 'Pods',
          type: 'pod',
          healthy: true,
          status: 'NoPods',
          reason: 'No pods found (workspace may be stopped)',
          details: { count: 0 }
        });
      } else {
        const podStatuses = pods.items.map(pod => {
          const containerStatuses = pod.status?.containerStatuses || [];
          const phase = pod.status?.phase;
          const conditions = pod.status?.conditions || [];
          const readyCondition = conditions.find(c => c.type === 'Ready');

          let healthy = phase === 'Running' && readyCondition?.status === 'True';
          let reason = '';

          if (phase === 'Pending') {
            const waitingContainers = containerStatuses.filter(c => c.state?.waiting);
            if (waitingContainers.length > 0) {
              const waiting = waitingContainers[0].state?.waiting;
              reason = waiting?.message || waiting?.reason || 'Pod is pending';
            } else {
              reason = 'Pod is pending';
            }
          } else if (phase === 'Failed') {
            reason = pod.status?.message || 'Pod has failed';
          } else if (phase === 'Running') {
            const notReadyContainers = containerStatuses.filter(c => !c.ready);
            if (notReadyContainers.length > 0) {
              healthy = false;
              reason = `${notReadyContainers.length} container(s) not ready`;
            } else {
              reason = 'All containers are running and ready';
            }
          } else {
            reason = `Pod is in ${phase} state`;
          }

          return {
            name: pod.metadata?.name || 'unknown',
            healthy,
            phase: phase || 'Unknown',
            reason,
            restarts: containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0),
          };
        });

        const allHealthy = podStatuses.every(p => p.healthy);
        const healthyCount = podStatuses.filter(p => p.healthy).length;

        components.push({
          name: 'Pods',
          type: 'pod',
          healthy: allHealthy,
          status: allHealthy ? 'Running' : 'Degraded',
          reason: allHealthy
            ? `All ${pods.items.length} pod(s) are healthy`
            : `${healthyCount} of ${pods.items.length} pod(s) are healthy`,
          details: {
            pods: podStatuses,
            count: pods.items.length,
          }
        });
      }
    } catch (error) {
      logger.warn(`Failed to get pod health for ${name}:`, error);
      components.push({
        name: 'Pods',
        type: 'pod',
        healthy: false,
        status: 'Unknown',
        reason: 'Failed to fetch pod status',
        details: { error: String(error) }
      });
    }

    return components;
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
            targetPort: 8000,
            protocol: 'TCP',
            name: 'http',
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

  // Ingress operations
  async createOrUpdateIngressRule(
    namespace: string,
    ingressName: string,
    workspaceName: string,
    serviceName: string,
    pathPrefix: string,
    host: string = 'loadbalancer.frontierrnd.com'
  ): Promise<void> {
    try {
      // Try to get existing ingress
      let ingress: k8s.V1Ingress;
      let isUpdate = false;

      try {
        const response = await this.networkingV1Api.readNamespacedIngress({ name: ingressName, namespace });
        ingress = response;
        isUpdate = true;
      } catch (error: any) {
        // Check multiple possible locations for the 404 status code
        const statusCode = error.statusCode || error.response?.statusCode || error.code;
        if (statusCode !== 404) {
          throw error;
        }
        // Ingress doesn't exist, create new one
        ingress = {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name: ingressName,
            namespace,
            annotations: {
              'cert-manager.io/issuer': 'letsencrypt-prod',
            },
          },
          spec: {
            ingressClassName: 'nginx',
            rules: [],
            tls: [
              {
                hosts: [host],
                secretName: `${namespace}-tls`,
              },
            ],
          },
        };
      }

      // Ensure rules array exists
      if (!ingress.spec) {
        ingress.spec = { rules: [] };
      }
      if (!ingress.spec.rules) {
        ingress.spec.rules = [];
      }

      // Find or create rule for the host
      let rule = ingress.spec.rules.find((r) => r.host === host);
      if (!rule) {
        rule = {
          host,
          http: {
            paths: [],
          },
        };
        ingress.spec.rules.push(rule);
      }

      // Ensure paths array exists
      if (!rule.http) {
        rule.http = { paths: [] };
      }
      if (!rule.http.paths) {
        rule.http.paths = [];
      }

      // Check if path already exists
      const existingPathIndex = rule.http.paths.findIndex((p) => p.path === pathPrefix);

      const newPath: k8s.V1HTTPIngressPath = {
        path: pathPrefix,
        pathType: 'Prefix',
        backend: {
          service: {
            name: serviceName,
            port: {
              number: 80,
            },
          },
        },
      };

      if (existingPathIndex >= 0) {
        // Update existing path
        rule.http.paths[existingPathIndex] = newPath;
      } else {
        // Add new path
        rule.http.paths.push(newPath);
      }

      // Create or update the ingress
      if (isUpdate) {
        await this.networkingV1Api.replaceNamespacedIngress({ name: ingressName, namespace, body: ingress });
        logger.info(`Ingress rule updated: ${ingressName} for workspace ${workspaceName} at path ${pathPrefix}`);
      } else {
        await this.networkingV1Api.createNamespacedIngress({ namespace, body: ingress });
        logger.info(`Ingress created: ${ingressName} for workspace ${workspaceName} at path ${pathPrefix}`);
      }
    } catch (error) {
      throw new KubernetesError(`Failed to create/update ingress rule for ${workspaceName}`, error);
    }
  }

  async deleteIngressRule(
    namespace: string,
    ingressName: string,
    pathPrefix: string,
    host: string = 'loadbalancer.frontierrnd.com'
  ): Promise<void> {
    try {
      // Get existing ingress
      const response = await this.networkingV1Api.readNamespacedIngress({ name: ingressName, namespace });
      const ingress = response;

      if (!ingress.spec?.rules) {
        logger.warn(`No rules found in ingress ${ingressName}`);
        return;
      }

      // Find the rule for the host
      const rule = ingress.spec.rules.find((r) => r.host === host);
      if (!rule?.http?.paths) {
        logger.warn(`No paths found for host ${host} in ingress ${ingressName}`);
        return;
      }

      // Remove the path
      const originalLength = rule.http.paths.length;
      rule.http.paths = rule.http.paths.filter((p) => p.path !== pathPrefix);

      if (rule.http.paths.length === originalLength) {
        logger.warn(`Path ${pathPrefix} not found in ingress ${ingressName}`);
        return;
      }

      // If no paths left in this rule, remove the rule
      if (rule.http.paths.length === 0) {
        ingress.spec.rules = ingress.spec.rules.filter((r) => r.host !== host);
      }

      // If no rules left, delete the entire ingress
      if (ingress.spec.rules.length === 0) {
        await this.networkingV1Api.deleteNamespacedIngress({ name: ingressName, namespace });
        logger.info(`Ingress deleted: ${ingressName} (no rules remaining)`);
      } else {
        // Update the ingress with the path removed
        await this.networkingV1Api.replaceNamespacedIngress({ name: ingressName, namespace, body: ingress });
        logger.info(`Ingress rule removed: path ${pathPrefix} from ${ingressName}`);
      }
    } catch (error: any) {
      // Check multiple possible locations for the 404 status code
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`Ingress not found for deletion: ${ingressName}`);
        return;
      }
      throw new KubernetesError(`Failed to delete ingress rule at path ${pathPrefix}`, error);
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
