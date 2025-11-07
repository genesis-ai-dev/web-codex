"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.kubernetesService = void 0;
const k8s = __importStar(require("@kubernetes/client-node"));
const config_1 = require("../config");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const types_1 = require("../types");
class KubernetesService {
    constructor() {
        this.kc = new k8s.KubeConfig();
        if (config_1.config.isProduction) {
            this.kc.loadFromCluster();
        }
        else {
            this.kc.loadFromDefault();
        }
        this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
        this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
        this.rbacV1Api = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
        this.metricsClient = new k8s.Metrics(this.kc);
        logger_1.logger.info('Kubernetes service initialized');
    }
    // Namespace operations
    async createNamespace(name, labels = {}) {
        try {
            const namespace = {
                metadata: {
                    name,
                    labels: {
                        'app.kubernetes.io/managed-by': 'vscode-platform',
                        ...labels,
                    },
                },
            };
            await this.coreV1Api.createNamespace(namespace);
            logger_1.logger.info(`Namespace created: ${name}`);
        }
        catch (error) {
            if (error.statusCode === 409) {
                logger_1.logger.warn(`Namespace already exists: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to create namespace ${name}`, error);
        }
    }
    async deleteNamespace(name) {
        try {
            await this.coreV1Api.deleteNamespace(name);
            logger_1.logger.info(`Namespace deleted: ${name}`);
        }
        catch (error) {
            if (error.statusCode === 404) {
                logger_1.logger.warn(`Namespace not found for deletion: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to delete namespace ${name}`, error);
        }
    }
    async namespaceExists(name) {
        try {
            await this.coreV1Api.readNamespace(name);
            return true;
        }
        catch (error) {
            if (error.statusCode === 404) {
                return false;
            }
            throw new errors_1.KubernetesError(`Failed to check namespace ${name}`, error);
        }
    }
    // Resource quota operations
    async createResourceQuota(namespace, quota) {
        try {
            const resourceQuota = {
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
            await this.coreV1Api.createNamespacedResourceQuota(namespace, resourceQuota);
            logger_1.logger.info(`Resource quota created for namespace: ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create resource quota for ${namespace}`, error);
        }
    }
    // Pod operations
    async listPods(namespace, labelSelector) {
        try {
            const response = await this.coreV1Api.listNamespacedPod(namespace, undefined, undefined, undefined, undefined, labelSelector);
            return response.body.items.map(pod => ({
                name: pod.metadata?.name || '',
                status: pod.status?.phase || 'Unknown',
                ready: pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') || false,
                restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
                age: this.calculateAge(pod.metadata?.creationTimestamp),
            }));
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to list pods in namespace ${namespace}`, error);
        }
    }
    async getPodLogs(namespace, podName, lines = 100) {
        try {
            const response = await this.coreV1Api.readNamespacedPodLog(podName, namespace, undefined, undefined, undefined, undefined, undefined, undefined, undefined, lines);
            return response.body;
        }
        catch (error) {
            if (error.statusCode === 404) {
                throw new errors_1.NotFoundError(`Pod ${podName} not found in namespace ${namespace}`);
            }
            throw new errors_1.KubernetesError(`Failed to get logs for pod ${podName}`, error);
        }
    }
    // Deployment operations
    async createDeployment(namespace, name, image, resources, labels = {}) {
        try {
            const deployment = {
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
            await this.appsV1Api.createNamespacedDeployment(namespace, deployment);
            logger_1.logger.info(`Deployment created: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create deployment ${name}`, error);
        }
    }
    async scaleDeployment(namespace, name, replicas) {
        try {
            const patch = {
                spec: {
                    replicas,
                },
            };
            await this.appsV1Api.patchNamespacedDeploymentScale(name, namespace, patch, undefined, undefined, undefined, undefined, {
                headers: { 'Content-Type': 'application/merge-patch+json' },
            });
            logger_1.logger.info(`Deployment ${name} scaled to ${replicas} replicas`);
        }
        catch (error) {
            if (error.statusCode === 404) {
                throw new errors_1.NotFoundError(`Deployment ${name} not found in namespace ${namespace}`);
            }
            throw new errors_1.KubernetesError(`Failed to scale deployment ${name}`, error);
        }
    }
    async deleteDeployment(namespace, name) {
        try {
            await this.appsV1Api.deleteNamespacedDeployment(name, namespace);
            logger_1.logger.info(`Deployment deleted: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            if (error.statusCode === 404) {
                logger_1.logger.warn(`Deployment not found for deletion: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to delete deployment ${name}`, error);
        }
    }
    async getDeploymentStatus(namespace, name) {
        try {
            const response = await this.appsV1Api.readNamespacedDeployment(name, namespace);
            const deployment = response.body;
            const readyReplicas = deployment.status?.readyReplicas || 0;
            const replicas = deployment.spec?.replicas || 0;
            if (replicas === 0) {
                return types_1.WorkspaceStatus.STOPPED;
            }
            if (readyReplicas === 0) {
                return types_1.WorkspaceStatus.STARTING;
            }
            if (readyReplicas < replicas) {
                return types_1.WorkspaceStatus.STARTING;
            }
            return types_1.WorkspaceStatus.RUNNING;
        }
        catch (error) {
            if (error.statusCode === 404) {
                return types_1.WorkspaceStatus.STOPPED;
            }
            throw new errors_1.KubernetesError(`Failed to get deployment status for ${name}`, error);
        }
    }
    // Service operations
    async createService(namespace, name, labels = {}) {
        try {
            const service = {
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
            await this.coreV1Api.createNamespacedService(namespace, service);
            logger_1.logger.info(`Service created: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create service ${name}`, error);
        }
    }
    // PVC operations
    async createPVC(namespace, name, size, storageClass = 'gp3') {
        try {
            const pvc = {
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
            await this.coreV1Api.createNamespacedPersistentVolumeClaim(namespace, pvc);
            logger_1.logger.info(`PVC created: ${name}-pvc in namespace ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create PVC for ${name}`, error);
        }
    }
    // Metrics operations
    async getNamespaceMetrics(namespace) {
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
        }
        catch (error) {
            logger_1.logger.warn(`Failed to get metrics for namespace ${namespace}:`, error);
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
    calculateAge(creationTimestamp) {
        if (!creationTimestamp)
            return 'Unknown';
        const now = new Date();
        const diff = now.getTime() - creationTimestamp.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d`;
        if (hours > 0)
            return `${hours}h`;
        return `${minutes}m`;
    }
    parseCPU(cpu) {
        if (cpu.endsWith('m')) {
            return parseFloat(cpu.slice(0, -1)) / 1000;
        }
        return parseFloat(cpu);
    }
    parseMemory(memory) {
        const units = { Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024 };
        for (const [unit, multiplier] of Object.entries(units)) {
            if (memory.endsWith(unit)) {
                return parseFloat(memory.slice(0, -unit.length)) * multiplier;
            }
        }
        return parseFloat(memory);
    }
    formatMemory(bytes) {
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
exports.kubernetesService = new KubernetesService();
