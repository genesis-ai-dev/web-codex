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
  private customObjectsApi: k8s.CustomObjectsApi;
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

      this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
      logger.info('CustomObjectsApi client created');

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
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 409) {
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
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
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

  // ConfigMap operations
  async addWorkspaceToNginxProxyConfig(
    namespace: string,
    workspaceName: string
  ): Promise<void> {
    try {
      // Get list of all workspaces in this namespace to rebuild config
      const services = await this.coreV1Api.listNamespacedService({ namespace });

      // Filter to only workspace services (exclude proxy service)
      const workspaceServices = services.items.filter(
        svc => svc.metadata?.name?.startsWith('workspace-') && svc.metadata.name !== 'code-server-proxy-service'
      );

      // Build location blocks for all workspaces
      const locationBlocks = workspaceServices.map(svc => {
        const svcName = svc.metadata?.name || '';
        const svcPathPrefix = `/${namespace}/${svcName}`;
        return `    location ${svcPathPrefix}/ {
      proxy_pass http://${svcName}:80/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-Host $http_host;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
      # Rewrite redirects - handle both with and without port numbers
      proxy_redirect ~^http://[^/]+(:\d+)?(/.*)?$ ${svcPathPrefix}$2;
      proxy_redirect ~^https://[^/]+(:\d+)?(/.*)?$ ${svcPathPrefix}$2;
      proxy_redirect / ${svcPathPrefix}/;
    }`;
      }).join('\n');

      const nginxConfig = `events {}
http {
  server {
    listen 8080;
    # Prevent nginx from adding port numbers to redirects
    absolute_redirect off;
    port_in_redirect off;
${locationBlocks}
  }
}`;

      const configMap: k8s.V1ConfigMap = {
        metadata: {
          name: 'code-server-nginx-config',
          namespace,
          labels: {
            'app.kubernetes.io/managed-by': 'vscode-platform',
          },
        },
        data: {
          'nginx.conf': nginxConfig,
        },
      };

      try {
        // Try to get existing ConfigMap
        await this.coreV1Api.readNamespacedConfigMap({ name: 'code-server-nginx-config', namespace });
        // If exists, replace it
        await this.coreV1Api.replaceNamespacedConfigMap({ name: 'code-server-nginx-config', namespace, body: configMap });
        logger.info(`Nginx proxy ConfigMap updated in namespace ${namespace}`);
      } catch (error: any) {
        const statusCode = error.statusCode || error.response?.statusCode || error.code;
        if (statusCode === 404) {
          // ConfigMap doesn't exist, create it
          await this.coreV1Api.createNamespacedConfigMap({ namespace, body: configMap });
          logger.info(`Nginx proxy ConfigMap created in namespace ${namespace}`);
        } else {
          throw error;
        }
      }

      // Restart proxy deployment to pick up new config
      try {
        await this.restartDeployment(namespace, 'code-server-proxy');
      } catch (error) {
        logger.warn(`Failed to restart proxy deployment: ${error}`);
      }
    } catch (error) {
      throw new KubernetesError(`Failed to update nginx proxy ConfigMap in ${namespace}`, error);
    }
  }

  async removeWorkspaceFromNginxProxyConfig(
    namespace: string,
    workspaceName: string
  ): Promise<void> {
    // Simply call addWorkspaceToNginxProxyConfig which will rebuild the config from current services
    await this.addWorkspaceToNginxProxyConfig(namespace, workspaceName);

    // Also update the HTTPRoute to remove this workspace's path
    await this.createOrUpdateHTTPRoute(namespace, '');
  }

  private async restartDeployment(namespace: string, name: string): Promise<void> {
    try {
      const deployment = await this.appsV1Api.readNamespacedDeployment({ name, namespace });

      if (!deployment.spec) {
        throw new Error('Deployment spec is missing');
      }

      if (!deployment.spec.template) {
        throw new Error('Deployment template is missing');
      }

      if (!deployment.spec.template.metadata) {
        deployment.spec.template.metadata = {};
      }

      if (!deployment.spec.template.metadata.annotations) {
        deployment.spec.template.metadata.annotations = {};
      }

      deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();

      await this.appsV1Api.replaceNamespacedDeployment({ name, namespace, body: deployment });
      logger.info(`Deployment ${name} restarted in namespace ${namespace}`);
    } catch (error) {
      throw new KubernetesError(`Failed to restart deployment ${name}`, error);
    }
  }

  async deleteNamespacedConfigMap(name: string, namespace: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedConfigMap({ name, namespace });
      logger.info(`ConfigMap deleted: ${name} in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`ConfigMap not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete ConfigMap ${name}`, error);
    }
  }

  // Secret operations
  async createCodeServerSecret(
    namespace: string,
    name: string,
    password: string
  ): Promise<void> {
    try {
      const configYaml = `bind-addr: 0.0.0.0:8000
auth: password
password: ${password}
cert: false`;

      const secret: k8s.V1Secret = {
        metadata: {
          name: `${name}-config`,
          namespace,
          labels: {
            app: name,
            'app.kubernetes.io/managed-by': 'vscode-platform',
          },
        },
        type: 'Opaque',
        stringData: {
          'config.yaml': configYaml,
        },
      };

      await this.coreV1Api.createNamespacedSecret({ namespace, body: secret });
      logger.info(`Code-server config secret created: ${name}-config in namespace ${namespace}`);
    } catch (error) {
      throw new KubernetesError(`Failed to create code-server config secret for ${name}`, error);
    }
  }

  async deleteNamespacedSecret(name: string, namespace: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedSecret({ name, namespace });
      logger.info(`Secret deleted: ${name} in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`Secret not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete secret ${name}`, error);
    }
  }

  // StatefulSet operations
  async createStatefulSet(
    namespace: string,
    name: string,
    image: string,
    resources: any,
    labels: Record<string, string> = {}
  ): Promise<void> {
    try {
      const statefulSet: k8s.V1StatefulSet = {
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
          replicas: 0, // Start with 0 replicas (stopped)
          serviceName: name, // Required for StatefulSet
          revisionHistoryLimit: 10,
          selector: {
            matchLabels: { app: name },
          },
          updateStrategy: {
            type: 'RollingUpdate',
            rollingUpdate: {
              partition: 0,
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
                  '--bind-addr=0.0.0.0:8000',
                  '--disable-workspace-trust',
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
                    // No CPU limits - only requests
                    memory: resources.memory, // Memory limit equals memory request
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
                volumeMounts: [
                  {
                    name: 'config',
                    mountPath: '/home/coder/.config/codex',
                    readOnly: true,
                  },
                  {
                    name: 'workspace-storage',
                    mountPath: '/home/coder',
                  },
                ],
              }],
              volumes: [{
                name: 'config',
                secret: {
                  secretName: `${name}-config`,
                  defaultMode: 0o644,
                },
              }],
            },
          },
          // Use volumeClaimTemplates for StatefulSet persistent storage
          volumeClaimTemplates: [{
            metadata: {
              name: 'workspace-storage',
              labels: {
                app: name,
                'app.kubernetes.io/managed-by': 'vscode-platform',
              },
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'gp3',
              resources: {
                requests: {
                  storage: resources.storage,
                },
              },
            },
          }],
        },
      };

      await this.appsV1Api.createNamespacedStatefulSet({ namespace, body: statefulSet });
      logger.info(`StatefulSet created: ${name} in namespace ${namespace} with persistent storage`);
    } catch (error) {
      throw new KubernetesError(`Failed to create StatefulSet ${name}`, error);
    }
  }

  // Deployment operations (keeping for backwards compatibility with nginx proxy)
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
                  '--bind-addr=0.0.0.0:8000',
                  '--disable-workspace-trust',
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
                    // No CPU limits - only requests
                    memory: resources.memory, // Memory limit equals memory request
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
                volumeMounts: [{
                  name: 'config',
                  mountPath: '/home/coder/.config/codex',
                  readOnly: true,
                }],
                // TODO: Re-enable workspace storage volume mounts once PVC storage is configured
                // {
                //   name: 'workspace-storage',
                //   mountPath: '/home/coder',
                // }],
              }],
              volumes: [{
                name: 'config',
                secret: {
                  secretName: `${name}-config`,
                  defaultMode: 0o644,
                },
              }],
              // TODO: Re-enable workspace storage volumes once PVC storage is configured
              // {
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

  async scaleStatefulSet(namespace: string, name: string, replicas: number): Promise<void> {
    try {
      // Use readNamespacedStatefulSetScale to get current scale object
      const scaleResponse = await this.appsV1Api.readNamespacedStatefulSetScale({ name, namespace });

      // Update the replicas count
      const scale = scaleResponse;
      if (scale.spec) {
        scale.spec.replicas = replicas;
      }

      // Replace the scale object
      await this.appsV1Api.replaceNamespacedStatefulSetScale({
        namespace,
        name,
        body: scale,
      });

      logger.info(`StatefulSet ${name} scaled to ${replicas} replicas`);
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundError(`StatefulSet ${name} not found in namespace ${namespace}`);
      }
      throw new KubernetesError(`Failed to scale StatefulSet ${name}`, error);
    }
  }

  async scaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
    try {
      // Use readNamespacedDeploymentScale to get current scale object
      const scaleResponse = await this.appsV1Api.readNamespacedDeploymentScale({ name, namespace });

      // Update the replicas count
      const scale = scaleResponse;
      if (scale.spec) {
        scale.spec.replicas = replicas;
      }

      // Replace the scale object
      await this.appsV1Api.replaceNamespacedDeploymentScale({
        namespace,
        name,
        body: scale,
      });

      logger.info(`Deployment ${name} scaled to ${replicas} replicas`);
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundError(`Deployment ${name} not found in namespace ${namespace}`);
      }
      throw new KubernetesError(`Failed to scale deployment ${name}`, error);
    }
  }

  async createNginxProxyDeployment(namespace: string): Promise<void> {
    try {
      const deployment: k8s.V1Deployment = {
        metadata: {
          name: 'code-server-proxy',
          namespace,
          labels: {
            app: 'code-server-proxy',
            'app.kubernetes.io/managed-by': 'vscode-platform',
          },
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: { app: 'code-server-proxy' },
          },
          template: {
            metadata: {
              labels: { app: 'code-server-proxy' },
            },
            spec: {
              containers: [{
                name: 'nginx',
                image: 'nginx:alpine',
                imagePullPolicy: 'IfNotPresent',
                ports: [{
                  containerPort: 8080,
                  name: 'http',
                  protocol: 'TCP',
                }],
                volumeMounts: [{
                  name: 'config',
                  mountPath: '/etc/nginx/nginx.conf',
                  subPath: 'nginx.conf',
                }],
                resources: {
                  requests: {
                    cpu: '0.1',
                    memory: '128Mi',
                  },
                  limits: {
                    cpu: '0.5',
                    memory: '256Mi',
                  },
                },
              }],
              volumes: [{
                name: 'config',
                configMap: {
                  name: 'code-server-nginx-config',
                },
              }],
            },
          },
        },
      };

      await this.appsV1Api.createNamespacedDeployment({ namespace, body: deployment });
      logger.info(`Nginx proxy deployment created in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 409) {
        logger.warn(`Nginx proxy deployment already exists in namespace ${namespace}`);
        return;
      }
      throw new KubernetesError(`Failed to create nginx proxy deployment in ${namespace}`, error);
    }
  }

  async deleteStatefulSet(namespace: string, name: string): Promise<void> {
    try {
      await this.appsV1Api.deleteNamespacedStatefulSet({ name, namespace });
      logger.info(`StatefulSet deleted: ${name} in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`StatefulSet not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete StatefulSet ${name}`, error);
    }
  }

  async deleteDeployment(namespace: string, name: string): Promise<void> {
    try {
      await this.appsV1Api.deleteNamespacedDeployment({ name, namespace });
      logger.info(`Deployment deleted: ${name} in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`Deployment not found for deletion: ${name}`);
        return;
      }
      throw new KubernetesError(`Failed to delete deployment ${name}`, error);
    }
  }

  async getStatefulSetStatus(namespace: string, name: string): Promise<WorkspaceStatus> {
    try {
      const response = await this.appsV1Api.readNamespacedStatefulSet({ name, namespace });
      const statefulSet = response;

      const readyReplicas = statefulSet.status?.readyReplicas || 0;
      const replicas = statefulSet.spec?.replicas || 0;

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
      throw new KubernetesError(`Failed to get StatefulSet status for ${name}`, error);
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

  async getStatefulSetDetails(namespace: string, name: string): Promise<{ image: string; replicas: number } | null> {
    try {
      const response = await this.appsV1Api.readNamespacedStatefulSet({ name, namespace });
      const statefulSet = response;

      const containers = statefulSet.spec?.template?.spec?.containers || [];
      const image = containers[0]?.image || '';
      const replicas = statefulSet.spec?.replicas || 0;

      return { image, replicas };
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw new KubernetesError(`Failed to get StatefulSet details for ${name}`, error);
    }
  }

  async getDeploymentDetails(namespace: string, name: string): Promise<{ image: string; replicas: number } | null> {
    try {
      const response = await this.appsV1Api.readNamespacedDeployment({ name, namespace });
      const deployment = response;

      const containers = deployment.spec?.template?.spec?.containers || [];
      const image = containers[0]?.image || '';
      const replicas = deployment.spec?.replicas || 0;

      return { image, replicas };
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw new KubernetesError(`Failed to get deployment details for ${name}`, error);
    }
  }

  async getWorkspaceComponentHealth(namespace: string, name: string): Promise<ComponentHealthStatus[]> {
    const components: ComponentHealthStatus[] = [];

    // Check StatefulSet
    try {
      const statefulSet = await this.appsV1Api.readNamespacedStatefulSet({ name, namespace });
      const replicas = statefulSet.spec?.replicas || 0;
      const readyReplicas = statefulSet.status?.readyReplicas || 0;
      const currentReplicas = statefulSet.status?.currentReplicas || 0;
      const updatedReplicas = statefulSet.status?.updatedReplicas || 0;

      let healthy = true;
      let reason = '';

      if (replicas === 0) {
        healthy = true;
        reason = 'StatefulSet scaled to 0 replicas (workspace stopped)';
      } else if (readyReplicas < replicas) {
        healthy = false;
        reason = `Only ${readyReplicas} of ${replicas} replicas are ready`;

        // Check for more specific issues
        const conditions = statefulSet.status?.conditions || [];
        const availableCondition = conditions.find(c => c.type === 'Available');

        if (availableCondition?.status === 'False') {
          reason = availableCondition.message || reason;
        }
      } else {
        healthy = true;
        reason = `All ${replicas} replicas are ready and available`;
      }

      components.push({
        name: 'StatefulSet',
        type: 'statefulset',
        healthy,
        status: statefulSet.status?.conditions?.find(c => c.type === 'Available')?.status === 'True' ? 'Available' :
                (readyReplicas === replicas && replicas > 0) ? 'Available' : 'Unavailable',
        reason,
        details: {
          replicas: replicas,
          readyReplicas: readyReplicas,
          currentReplicas: currentReplicas,
          updatedReplicas: updatedReplicas,
        }
      });
    } catch (error) {
      if (error.statusCode === 404) {
        components.push({
          name: 'StatefulSet',
          type: 'statefulset',
          healthy: false,
          status: 'NotFound',
          reason: 'StatefulSet does not exist',
          details: {}
        });
      } else {
        logger.warn(`Failed to get StatefulSet health for ${name}:`, error);
        components.push({
          name: 'StatefulSet',
          type: 'statefulset',
          healthy: false,
          status: 'Unknown',
          reason: 'Failed to fetch StatefulSet status',
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

      // Wait for service to be available in the API before proceeding
      await this.waitForService(namespace, name, 10000); // 10 second timeout
    } catch (error) {
      throw new KubernetesError(`Failed to create service ${name}`, error);
    }
  }

  private async waitForService(namespace: string, name: string, timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to get the service directly
        const service = await this.coreV1Api.readNamespacedService({ name, namespace });
        if (service && service.spec?.clusterIP) {
          // Also verify service appears in list (for eventual consistency with HTTPRoute queries)
          try {
            const serviceList = await this.coreV1Api.listNamespacedService({ namespace });
            const serviceInList = serviceList.items.find(s => s.metadata?.name === name);

            if (serviceInList) {
              logger.info(`Service ${name} is available and visible in list for namespace ${namespace}`);
              return;
            } else {
              logger.debug(`Service ${name} exists but not yet visible in list, continuing to wait...`);
            }
          } catch (listError) {
            logger.debug(`Failed to verify service in list, continuing to wait...`);
          }
        }
      } catch (error) {
        // Service not ready yet, continue polling
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    logger.warn(`Timeout waiting for service ${name} to become available in namespace ${namespace}, proceeding anyway`);
  }

  async createNginxProxyService(namespace: string): Promise<void> {
    try {
      const service: k8s.V1Service = {
        metadata: {
          name: 'code-server-proxy-service',
          namespace,
          labels: {
            app: 'code-server-proxy',
            'app.kubernetes.io/managed-by': 'vscode-platform',
          },
        },
        spec: {
          selector: { app: 'code-server-proxy' },
          ports: [{
            port: 80,
            targetPort: 8080,
            protocol: 'TCP',
            name: 'http',
          }],
          type: 'ClusterIP',
        },
      };

      await this.coreV1Api.createNamespacedService({ namespace, body: service });
      logger.info(`Nginx proxy service created in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 409) {
        logger.warn(`Nginx proxy service already exists in namespace ${namespace}`);
        return;
      }
      throw new KubernetesError(`Failed to create nginx proxy service in ${namespace}`, error);
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

  // HTTPRoute operations (Gateway API)
  async createOrUpdateHTTPRoute(
    namespace: string,
    pathPrefix: string,
    hostnames: string[] = ['test.denhertog.ca', 'loadbalancer.frontierrnd.com']
  ): Promise<void> {
    try {
      const httpRouteName = `${namespace}-httproute`;

      // Extract expected service name from pathPrefix (format: /<namespace>/<serviceName>)
      const expectedServiceName = pathPrefix ? pathPrefix.split('/').filter(Boolean)[1] : null;

      // Get list of all workspaces in this namespace to rebuild HTTPRoute rules
      // Add retry logic to handle eventual consistency - services may not be immediately visible
      let services: any;
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          services = await this.coreV1Api.listNamespacedService({ namespace });

          // If we're expecting a specific service (from pathPrefix), verify it appears in the list
          if (expectedServiceName && attempt < maxRetries) {
            const serviceInList = services.items.find(
              svc => svc.metadata?.name === expectedServiceName
            );

            if (!serviceInList) {
              logger.warn(`Expected service ${expectedServiceName} not found in namespace ${namespace}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            } else {
              logger.info(`Service ${expectedServiceName} found in list for namespace ${namespace}`);
            }
          }

          // Successfully got services
          break;
        } catch (error) {
          if (attempt === maxRetries) {
            throw error;
          }
          logger.warn(`Failed to list services in namespace ${namespace}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      // Filter to only workspace services (exclude proxy service)
      const workspaceServices = services.items.filter(
        svc => svc.metadata?.name?.startsWith('workspace-') && svc.metadata.name !== 'code-server-proxy-service'
      );

      // Build rules for all workspaces - each workspace gets its own path prefix rule
      const rules = workspaceServices.map(svc => {
        const svcName = svc.metadata?.name || '';
        const svcPathPrefix = `/${namespace}/${svcName}`;
        return {
          matches: [
            {
              path: {
                type: 'PathPrefix',
                value: svcPathPrefix,
              },
            },
          ],
          backendRefs: [
            {
              name: 'code-server-proxy-service',
              port: 80,
            },
          ],
        };
      });

      // If no workspaces, add a default rule to keep the HTTPRoute valid
      if (rules.length === 0) {
        rules.push({
          matches: [
            {
              path: {
                type: 'PathPrefix',
                value: `/${namespace}/`,
              },
            },
          ],
          backendRefs: [
            {
              name: 'code-server-proxy-service',
              port: 80,
            },
          ],
        });
      }

      const httpRoute: any = {
        apiVersion: 'gateway.networking.k8s.io/v1',
        kind: 'HTTPRoute',
        metadata: {
          name: httpRouteName,
          namespace,
          labels: {
            'app.kubernetes.io/managed-by': 'vscode-platform',
          },
        },
        spec: {
          hostnames,
          parentRefs: [
            {
              group: 'gateway.networking.k8s.io',
              kind: 'Gateway',
              name: 'main-nginx-gateway',
              namespace: 'gateway-system',
              sectionName: 'http',
            },
            {
              group: 'gateway.networking.k8s.io',
              kind: 'Gateway',
              name: 'main-nginx-gateway',
              namespace: 'gateway-system',
              sectionName: 'https',
            },
            {
              group: 'gateway.networking.k8s.io',
              kind: 'Gateway',
              name: 'main-nginx-gateway',
              namespace: 'gateway-system',
              sectionName: 'https-aws',
            },
          ],
          rules,
        },
      };

      try {
        // Try to get existing HTTPRoute
        const existingRoute = await this.customObjectsApi.getNamespacedCustomObject({
          group: 'gateway.networking.k8s.io',
          version: 'v1',
          namespace,
          plural: 'httproutes',
          name: httpRouteName,
        });

        // If exists, replace it with the existing resourceVersion
        const existingRouteBody = existingRoute.body as any;
        httpRoute.metadata.resourceVersion = existingRouteBody.metadata.resourceVersion;

        await this.customObjectsApi.replaceNamespacedCustomObject({
          group: 'gateway.networking.k8s.io',
          version: 'v1',
          namespace,
          plural: 'httproutes',
          name: httpRouteName,
          body: httpRoute,
        });
        logger.info(`HTTPRoute updated: ${httpRouteName} in namespace ${namespace} with ${rules.length} rule(s)`);
      } catch (error: any) {
        const statusCode = error.statusCode || error.response?.statusCode || error.code;
        if (statusCode === 404) {
          // HTTPRoute doesn't exist, create it
          await this.customObjectsApi.createNamespacedCustomObject({
            group: 'gateway.networking.k8s.io',
            version: 'v1',
            namespace,
            plural: 'httproutes',
            body: httpRoute,
          });
          logger.info(`HTTPRoute created: ${httpRouteName} in namespace ${namespace} with ${rules.length} rule(s)`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      throw new KubernetesError(`Failed to create/update HTTPRoute in namespace ${namespace}`, error);
    }
  }

  async deleteHTTPRoute(namespace: string): Promise<void> {
    try {
      const httpRouteName = `${namespace}-httproute`;

      await this.customObjectsApi.deleteNamespacedCustomObject({
        group: 'gateway.networking.k8s.io',
        version: 'v1',
        namespace,
        plural: 'httproutes',
        name: httpRouteName,
      });
      logger.info(`HTTPRoute deleted: ${httpRouteName} in namespace ${namespace}`);
    } catch (error: any) {
      const statusCode = error.statusCode || error.response?.statusCode || error.code;
      if (statusCode === 404) {
        logger.warn(`HTTPRoute not found for deletion in namespace ${namespace}`);
        return;
      }
      throw new KubernetesError(`Failed to delete HTTPRoute in ${namespace}`, error);
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
    // Handle nanocores (n), millicores (m), or cores (plain number)
    if (cpu.endsWith('n')) {
      return parseFloat(cpu.slice(0, -1)) / 1000000000;
    }
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

  /**
   * Execute a command in a pod and return streams for stdin/stdout/stderr
   */
  async execIntoPod(
    namespace: string,
    podName: string,
    command: string[],
    containerName?: string
  ): Promise<{ stdin: any; stdout: any; stderr: any; on?: any; ws?: any }> {
    return new Promise(async (resolve, reject) => {
      try {
        logger.info('Starting exec session:', { namespace, podName, containerName, command });

        // Get pod to find container name if not specified
        if (!containerName) {
          const pod = await this.coreV1Api.readNamespacedPod({ name: podName, namespace });

          if (!pod.spec?.containers || pod.spec.containers.length === 0) {
            throw new Error('Pod has no containers');
          }

          containerName = pod.spec.containers[0].name;
          logger.info('Using first container:', { containerName });
        }

        const exec = new k8s.Exec(this.kc);

        // Create streams for stdin, stdout, stderr
        const { PassThrough } = await import('stream');

        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();

        // Track if we've resolved/rejected
        let settled = false;

        // Start exec with TTY enabled for interactive shell
        // Note: exec.exec returns a WebSocket connection object
        const ws = await exec.exec(
          namespace,
          podName,
          containerName,
          command,
          stdout as any,  // K8s expects Writable but PassThrough works for both
          stderr as any,
          stdin as any,
          true,  // tty
          (status) => {
            logger.info('Exec session status:', { namespace, podName, containerName, status });
            if (status.status === 'Failure' && !settled) {
              settled = true;
              reject(new Error(`Exec failed: ${status.message || 'Unknown error'}`));
            }
          }
        );

        // Handle WebSocket open event - this means the connection is established
        if (ws && typeof ws.on === 'function') {
          ws.on('open', () => {
            if (!settled) {
              settled = true;
              logger.info('Exec session established:', { namespace, podName, containerName });
              resolve({ stdin, stdout, stderr, on: ws.on?.bind(ws), ws });
            }
          });

          ws.on('error', (error: Error) => {
            if (!settled) {
              settled = true;
              logger.error('Exec WebSocket error:', {
                namespace,
                podName,
                containerName,
                error: error.message,
              });
              reject(error);
            }
          });

          // If no open event fires within 5 seconds, assume success (already connected)
          setTimeout(() => {
            if (!settled) {
              settled = true;
              logger.info('Exec session established (timeout fallback):', { namespace, podName, containerName });
              resolve({ stdin, stdout, stderr, on: ws.on?.bind(ws), ws });
            }
          }, 5000);
        } else {
          // No WebSocket returned, assume immediate success
          logger.info('Exec session established (immediate):', { namespace, podName, containerName });
          resolve({ stdin, stdout, stderr });
        }
      } catch (error) {
        logger.error('Failed to exec into pod:', {
          namespace,
          podName,
          containerName,
          error: error instanceof Error ? error.message : JSON.stringify(error),
          errorType: error?.constructor?.name,
          errorCode: (error as any)?.code,
          statusCode: (error as any)?.statusCode || (error as any)?.response?.statusCode,
          stack: error instanceof Error ? error.stack : undefined,
        });
        reject(new KubernetesError(`Failed to exec into pod ${podName}`, error));
      }
    });
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

  // Parse Kubernetes resource quantities (e.g., "1000m" = 1 CPU, "2Gi" = 2GiB)
  private parseKubernetesQuantity(quantity: string, type: 'cpu' | 'memory'): number {
    if (!quantity) return 0;

    if (type === 'cpu') {
      // CPU can be in cores or millicores (m)
      if (quantity.endsWith('m')) {
        return parseInt(quantity.slice(0, -1)) / 1000; // Convert millicores to cores
      }
      return parseFloat(quantity); // Already in cores
    } else {
      // Memory can be in Ki, Mi, Gi, Ti, Pi, Ei or K, M, G, T, P, E
      const units: { [key: string]: number } = {
        'Ki': 1024,
        'Mi': 1024 * 1024,
        'Gi': 1024 * 1024 * 1024,
        'Ti': 1024 * 1024 * 1024 * 1024,
        'K': 1000,
        'M': 1000 * 1000,
        'G': 1000 * 1000 * 1000,
        'T': 1000 * 1000 * 1000 * 1000,
      };

      for (const [suffix, multiplier] of Object.entries(units)) {
        if (quantity.endsWith(suffix)) {
          return parseFloat(quantity.slice(0, -suffix.length)) * multiplier;
        }
      }

      return parseFloat(quantity); // Plain bytes
    }
  }

  // Format number as Kubernetes quantity string
  private formatQuantity(value: number, type: 'cpu' | 'memory'): string {
    if (type === 'cpu') {
      // Return in cores with 2 decimal places
      return value.toFixed(2);
    } else {
      // Return in GiB for memory
      const gib = value / (1024 * 1024 * 1024);
      return `${gib.toFixed(2)}Gi`;
    }
  }

  async getClusterCapacity(): Promise<any> {
    try {
      // Get all nodes in the cluster
      const nodesResponse = await this.coreV1Api.listNode();
      const nodes = nodesResponse.items;

      let totalCpu = 0;
      let totalMemory = 0;
      let totalPods = 0;
      let allocatableCpu = 0;
      let allocatableMemory = 0;
      let allocatablePods = 0;

      // Track per-node allocatable resources for workspace capacity calculation
      const nodeAllocatableResources: Array<{ cpu: number; memory: number; name: string }> = [];

      // Sum up capacity and allocatable resources from all nodes
      for (const node of nodes) {
        const capacity = node.status?.capacity || {};
        const allocatable = node.status?.allocatable || {};

        totalCpu += this.parseKubernetesQuantity(capacity.cpu || '0', 'cpu');
        totalMemory += this.parseKubernetesQuantity(capacity.memory || '0', 'memory');
        totalPods += parseInt(capacity.pods || '0');

        const nodeCpu = this.parseKubernetesQuantity(allocatable.cpu || '0', 'cpu');
        const nodeMemory = this.parseKubernetesQuantity(allocatable.memory || '0', 'memory');

        allocatableCpu += nodeCpu;
        allocatableMemory += nodeMemory;
        allocatablePods += parseInt(allocatable.pods || '0');

        nodeAllocatableResources.push({
          cpu: nodeCpu,
          memory: nodeMemory,
          name: node.metadata?.name || `node-${nodeAllocatableResources.length}`,
        });
      }

      // Get all pods to calculate used resources per node
      let usedCpu = 0;
      let usedMemory = 0;
      let usedPods = 0;

      // Track used resources per node
      const nodeUsedResources: Record<string, { cpu: number; memory: number }> = {};

      try {
        const podsResponse = await this.coreV1Api.listPodForAllNamespaces();
        const pods = podsResponse.items;

        usedPods = pods.filter(pod => pod.status?.phase === 'Running' || pod.status?.phase === 'Pending').length;

        // Sum up requested resources from all containers in all pods
        for (const pod of pods) {
          if (pod.status?.phase === 'Running' || pod.status?.phase === 'Pending') {
            const nodeName = pod.spec?.nodeName || 'unassigned';

            if (!nodeUsedResources[nodeName]) {
              nodeUsedResources[nodeName] = { cpu: 0, memory: 0 };
            }

            for (const container of pod.spec?.containers || []) {
              const requests = container.resources?.requests || {};
              const containerCpu = this.parseKubernetesQuantity(requests.cpu || '0', 'cpu');
              const containerMemory = this.parseKubernetesQuantity(requests.memory || '0', 'memory');

              usedCpu += containerCpu;
              usedMemory += containerMemory;

              if (nodeName !== 'unassigned') {
                nodeUsedResources[nodeName].cpu += containerCpu;
                nodeUsedResources[nodeName].memory += containerMemory;
              }
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to get pod metrics for cluster capacity calculation:', error);
        // Continue with zero usage if we can't get pod metrics
      }

      // Calculate workspace capacity
      // Assuming default workspace tier (SMALL_TEAM: 2 CPU, 4Gi memory)
      const workspaceCpuRequest = 2; // cores
      const workspaceMemoryRequest = 4 * 1024 * 1024 * 1024; // 4GiB in bytes

      // Calculate available capacity on each node
      let totalWorkspaceCapacity = 0;
      const nodeCapacityDetails: Array<{
        name: string;
        allocatableCpu: string;
        allocatableMemory: string;
        usedCpu: string;
        usedMemory: string;
        availableCpu: string;
        availableMemory: string;
        cpuPercentage: number;
        memoryPercentage: number;
        workspaceCapacity: number;
      }> = [];

      for (const nodeAlloc of nodeAllocatableResources) {
        const used = nodeUsedResources[nodeAlloc.name] || { cpu: 0, memory: 0 };

        const availableCpu = nodeAlloc.cpu - used.cpu;
        const availableMemory = nodeAlloc.memory - used.memory;

        // Calculate how many workspaces can fit based on CPU and memory constraints
        const workspacesByCpu = Math.floor(availableCpu / workspaceCpuRequest);
        const workspacesByMemory = Math.floor(availableMemory / workspaceMemoryRequest);

        // The limiting factor determines capacity
        const nodeWorkspaceCapacity = Math.max(0, Math.min(workspacesByCpu, workspacesByMemory));
        totalWorkspaceCapacity += nodeWorkspaceCapacity;

        // Calculate percentages for visualization
        const cpuPercentage = nodeAlloc.cpu > 0 ? (used.cpu / nodeAlloc.cpu) * 100 : 0;
        const memoryPercentage = nodeAlloc.memory > 0 ? (used.memory / nodeAlloc.memory) * 100 : 0;

        nodeCapacityDetails.push({
          name: nodeAlloc.name,
          allocatableCpu: this.formatQuantity(nodeAlloc.cpu, 'cpu'),
          allocatableMemory: this.formatQuantity(nodeAlloc.memory, 'memory'),
          usedCpu: this.formatQuantity(used.cpu, 'cpu'),
          usedMemory: this.formatQuantity(used.memory, 'memory'),
          availableCpu: this.formatQuantity(availableCpu, 'cpu'),
          availableMemory: this.formatQuantity(availableMemory, 'memory'),
          cpuPercentage: Math.round(cpuPercentage * 10) / 10,
          memoryPercentage: Math.round(memoryPercentage * 10) / 10,
          workspaceCapacity: nodeWorkspaceCapacity,
        });

        logger.debug(`Node ${nodeAlloc.name} workspace capacity:`, {
          availableCpu: availableCpu.toFixed(2),
          availableMemory: this.formatQuantity(availableMemory, 'memory'),
          workspacesByCpu,
          workspacesByMemory,
          capacity: nodeWorkspaceCapacity,
        });
      }

      // Detect instance types from node labels
      const instanceTypes = new Set<string>();
      for (const node of nodes) {
        // AWS EKS nodes have instance type in labels
        const instanceType = node.metadata?.labels?.['node.kubernetes.io/instance-type'] ||
                            node.metadata?.labels?.['beta.kubernetes.io/instance-type'];
        if (instanceType) {
          instanceTypes.add(instanceType);
        }
      }

      const clusterCapacity = {
        totalCpu: this.formatQuantity(totalCpu, 'cpu'),
        totalMemory: this.formatQuantity(totalMemory, 'memory'),
        totalPods,
        allocatableCpu: this.formatQuantity(allocatableCpu, 'cpu'),
        allocatableMemory: this.formatQuantity(allocatableMemory, 'memory'),
        allocatablePods,
        usedCpu: this.formatQuantity(usedCpu, 'cpu'),
        usedMemory: this.formatQuantity(usedMemory, 'memory'),
        usedPods,
        nodeCount: nodes.length,
        availableWorkspaceCapacity: totalWorkspaceCapacity,
        nodes: nodeCapacityDetails,
        instanceTypes: Array.from(instanceTypes), // List of detected instance types
        primaryInstanceType: instanceTypes.size > 0 ? Array.from(instanceTypes)[0] : undefined,
      };

      logger.info('Cluster capacity calculated:', clusterCapacity);
      return clusterCapacity;
    } catch (error) {
      logger.error('Failed to get cluster capacity:', error);
      throw new KubernetesError('Failed to get cluster capacity', error);
    }
  }
}

export const kubernetesService = new KubernetesService();
