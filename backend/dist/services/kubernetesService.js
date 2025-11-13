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
        try {
            logger_1.logger.info('Initializing Kubernetes service...');
            logger_1.logger.info(`Environment: ${config_1.config.nodeEnv} (isProduction: ${config_1.config.isProduction})`);
            this.kc = new k8s.KubeConfig();
            logger_1.logger.info('KubeConfig object created');
            if (config_1.config.isProduction) {
                logger_1.logger.info('Loading Kubernetes config from cluster (in-cluster mode)');
                try {
                    this.kc.loadFromCluster();
                    logger_1.logger.info('Successfully loaded Kubernetes config from cluster');
                }
                catch (error) {
                    logger_1.logger.error('Failed to load Kubernetes config from cluster:', {
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                    });
                    throw error;
                }
            }
            else {
                logger_1.logger.info('Loading Kubernetes config from default location');
                try {
                    this.kc.loadFromDefault();
                    logger_1.logger.info('Successfully loaded Kubernetes config from default location');
                }
                catch (error) {
                    logger_1.logger.error('Failed to load Kubernetes config from default location:', {
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                    });
                    throw error;
                }
            }
            logger_1.logger.info('Creating Kubernetes API clients...');
            this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
            logger_1.logger.info('CoreV1Api client created');
            this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
            logger_1.logger.info('AppsV1Api client created');
            this.rbacV1Api = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
            logger_1.logger.info('RbacAuthorizationV1Api client created');
            this.networkingV1Api = this.kc.makeApiClient(k8s.NetworkingV1Api);
            logger_1.logger.info('NetworkingV1Api client created');
            this.metricsClient = new k8s.Metrics(this.kc);
            logger_1.logger.info('Metrics client created');
            logger_1.logger.info('Kubernetes service initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('FATAL: Failed to initialize Kubernetes service:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
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
            await this.coreV1Api.createNamespace({ body: namespace });
            logger_1.logger.info(`Namespace created: ${name}`);
            // Wait for namespace to be fully ready
            await this.waitForNamespace(name, 30000); // 30 second timeout
        }
        catch (error) {
            if (error.statusCode === 409) {
                logger_1.logger.warn(`Namespace already exists: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to create namespace ${name}`, error);
        }
    }
    async waitForNamespace(name, timeoutMs = 30000) {
        const startTime = Date.now();
        const pollInterval = 1000; // Check every 1 second
        while (Date.now() - startTime < timeoutMs) {
            try {
                const namespace = await this.coreV1Api.readNamespace({ name });
                if (namespace.status?.phase === 'Active') {
                    logger_1.logger.info(`Namespace ${name} is active and ready`);
                    return;
                }
            }
            catch (error) {
                // Namespace not ready yet, continue polling
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        throw new errors_1.KubernetesError(`Timeout waiting for namespace ${name} to become ready`);
    }
    async listNamespaces() {
        try {
            const namespaceList = await this.coreV1Api.listNamespace();
            return namespaceList;
        }
        catch (error) {
            throw new errors_1.KubernetesError('Failed to list namespaces', error);
        }
    }
    async deleteNamespace(name) {
        try {
            await this.coreV1Api.deleteNamespace({ name });
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
            await this.coreV1Api.readNamespace({ name });
            return true;
        }
        catch (error) {
            // Check multiple possible locations for the 404 status code
            const statusCode = error.statusCode || error.response?.statusCode || error.code;
            if (statusCode === 404) {
                return false;
            }
            // Also check if the error body indicates not found
            if (error.body && typeof error.body === 'string' && error.body.includes('"code":404')) {
                return false;
            }
            throw new errors_1.KubernetesError(`Failed to check namespace ${name}`, error);
        }
    }
    // Resource quota operations
    async createResourceQuota(namespace, quota) {
        const maxRetries = 5;
        const retryDelay = 2000; // 2 seconds
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
                await this.coreV1Api.createNamespacedResourceQuota({ namespace, body: resourceQuota });
                logger_1.logger.info(`Resource quota created for namespace: ${namespace}`);
                return;
            }
            catch (error) {
                if (error.statusCode === 404 && attempt < maxRetries) {
                    logger_1.logger.warn(`Namespace ${namespace} not ready yet, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                throw new errors_1.KubernetesError(`Failed to create resource quota for ${namespace}`, error);
            }
        }
    }
    // Pod operations
    async listPods(namespace, labelSelector) {
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
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to list pods in namespace ${namespace}`, error);
        }
    }
    async getPodLogs(namespace, podName, lines = 100) {
        try {
            const response = await this.coreV1Api.readNamespacedPodLog({ name: podName, namespace, tailLines: lines });
            return response;
        }
        catch (error) {
            if (error.statusCode === 404) {
                throw new errors_1.NotFoundError(`Pod ${podName} not found in namespace ${namespace}`);
            }
            throw new errors_1.KubernetesError(`Failed to get logs for pod ${podName}`, error);
        }
    }
    // Deployment operations
    async createDeployment(namespace, name, image, resources, connectionToken, labels = {}) {
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
                                        '--extensions-dir=/home/codex/.codex-server/extensions',
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
            await this.appsV1Api.patchNamespacedDeploymentScale({
                namespace,
                name,
                body: patch,
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
            await this.appsV1Api.deleteNamespacedDeployment({ name, namespace });
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
            const response = await this.appsV1Api.readNamespacedDeployment({ name, namespace });
            const deployment = response;
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
    async getWorkspaceComponentHealth(namespace, name) {
        const components = [];
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
            }
            else if (readyReplicas < replicas) {
                healthy = false;
                reason = `Only ${readyReplicas} of ${replicas} replicas are ready`;
                // Check for more specific issues
                const conditions = deployment.status?.conditions || [];
                const progressingCondition = conditions.find(c => c.type === 'Progressing');
                const availableCondition = conditions.find(c => c.type === 'Available');
                if (progressingCondition?.status === 'False') {
                    reason = progressingCondition.message || reason;
                }
                else if (availableCondition?.status === 'False') {
                    reason = availableCondition.message || reason;
                }
            }
            else if (unavailableReplicas > 0) {
                healthy = false;
                reason = `${unavailableReplicas} replicas are unavailable`;
            }
            else {
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
        }
        catch (error) {
            if (error.statusCode === 404) {
                components.push({
                    name: 'Deployment',
                    type: 'deployment',
                    healthy: false,
                    status: 'NotFound',
                    reason: 'Deployment does not exist',
                    details: {}
                });
            }
            else {
                logger_1.logger.warn(`Failed to get deployment health for ${name}:`, error);
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
            }
            else if (ports.length === 0) {
                healthy = false;
                reason = 'Service has no ports configured';
            }
            else {
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
        }
        catch (error) {
            if (error.statusCode === 404) {
                components.push({
                    name: 'Service',
                    type: 'service',
                    healthy: false,
                    status: 'NotFound',
                    reason: 'Service does not exist',
                    details: {}
                });
            }
            else {
                logger_1.logger.warn(`Failed to get service health for ${name}:`, error);
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
            }
            else if (phase === 'Pending') {
                healthy = false;
                reason = 'PVC is pending - waiting for volume provisioning';
            }
            else if (phase === 'Lost') {
                healthy = false;
                reason = 'PVC has lost its underlying volume';
            }
            else {
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
        }
        catch (error) {
            if (error.statusCode === 404) {
                components.push({
                    name: 'PersistentVolumeClaim',
                    type: 'pvc',
                    healthy: false,
                    status: 'NotFound',
                    reason: 'PVC does not exist',
                    details: {}
                });
            }
            else {
                logger_1.logger.warn(`Failed to get PVC health for ${name}-pvc:`, error);
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
            }
            else {
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
                        }
                        else {
                            reason = 'Pod is pending';
                        }
                    }
                    else if (phase === 'Failed') {
                        reason = pod.status?.message || 'Pod has failed';
                    }
                    else if (phase === 'Running') {
                        const notReadyContainers = containerStatuses.filter(c => !c.ready);
                        if (notReadyContainers.length > 0) {
                            healthy = false;
                            reason = `${notReadyContainers.length} container(s) not ready`;
                        }
                        else {
                            reason = 'All containers are running and ready';
                        }
                    }
                    else {
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
        }
        catch (error) {
            logger_1.logger.warn(`Failed to get pod health for ${name}:`, error);
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
                            targetPort: 8000,
                            protocol: 'TCP',
                            name: 'http',
                        }],
                    type: 'ClusterIP',
                },
            };
            await this.coreV1Api.createNamespacedService({ namespace, body: service });
            logger_1.logger.info(`Service created: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create service ${name}`, error);
        }
    }
    async deleteNamespacedService(name, namespace) {
        try {
            await this.coreV1Api.deleteNamespacedService({ name, namespace });
            logger_1.logger.info(`Service deleted: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            if (error.statusCode === 404) {
                logger_1.logger.warn(`Service not found for deletion: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to delete service ${name}`, error);
        }
    }
    // Ingress operations
    async createOrUpdateIngressRule(namespace, ingressName, workspaceName, serviceName, pathPrefix, host = 'loadbalancer.frontierrnd.com') {
        try {
            // Try to get existing ingress
            let ingress;
            let isUpdate = false;
            try {
                const response = await this.networkingV1Api.readNamespacedIngress({ name: ingressName, namespace });
                ingress = response;
                isUpdate = true;
            }
            catch (error) {
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
            const newPath = {
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
            }
            else {
                // Add new path
                rule.http.paths.push(newPath);
            }
            // Create or update the ingress
            if (isUpdate) {
                await this.networkingV1Api.replaceNamespacedIngress({ name: ingressName, namespace, body: ingress });
                logger_1.logger.info(`Ingress rule updated: ${ingressName} for workspace ${workspaceName} at path ${pathPrefix}`);
            }
            else {
                await this.networkingV1Api.createNamespacedIngress({ namespace, body: ingress });
                logger_1.logger.info(`Ingress created: ${ingressName} for workspace ${workspaceName} at path ${pathPrefix}`);
            }
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create/update ingress rule for ${workspaceName}`, error);
        }
    }
    async deleteIngressRule(namespace, ingressName, pathPrefix, host = 'loadbalancer.frontierrnd.com') {
        try {
            // Get existing ingress
            const response = await this.networkingV1Api.readNamespacedIngress({ name: ingressName, namespace });
            const ingress = response;
            if (!ingress.spec?.rules) {
                logger_1.logger.warn(`No rules found in ingress ${ingressName}`);
                return;
            }
            // Find the rule for the host
            const rule = ingress.spec.rules.find((r) => r.host === host);
            if (!rule?.http?.paths) {
                logger_1.logger.warn(`No paths found for host ${host} in ingress ${ingressName}`);
                return;
            }
            // Remove the path
            const originalLength = rule.http.paths.length;
            rule.http.paths = rule.http.paths.filter((p) => p.path !== pathPrefix);
            if (rule.http.paths.length === originalLength) {
                logger_1.logger.warn(`Path ${pathPrefix} not found in ingress ${ingressName}`);
                return;
            }
            // If no paths left in this rule, remove the rule
            if (rule.http.paths.length === 0) {
                ingress.spec.rules = ingress.spec.rules.filter((r) => r.host !== host);
            }
            // If no rules left, delete the entire ingress
            if (ingress.spec.rules.length === 0) {
                await this.networkingV1Api.deleteNamespacedIngress({ name: ingressName, namespace });
                logger_1.logger.info(`Ingress deleted: ${ingressName} (no rules remaining)`);
            }
            else {
                // Update the ingress with the path removed
                await this.networkingV1Api.replaceNamespacedIngress({ name: ingressName, namespace, body: ingress });
                logger_1.logger.info(`Ingress rule removed: path ${pathPrefix} from ${ingressName}`);
            }
        }
        catch (error) {
            // Check multiple possible locations for the 404 status code
            const statusCode = error.statusCode || error.response?.statusCode || error.code;
            if (statusCode === 404) {
                logger_1.logger.warn(`Ingress not found for deletion: ${ingressName}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to delete ingress rule at path ${pathPrefix}`, error);
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
            await this.coreV1Api.createNamespacedPersistentVolumeClaim({ namespace, body: pvc });
            logger_1.logger.info(`PVC created: ${name}-pvc in namespace ${namespace}`);
        }
        catch (error) {
            throw new errors_1.KubernetesError(`Failed to create PVC for ${name}`, error);
        }
    }
    async deleteNamespacedPVC(name, namespace) {
        try {
            await this.coreV1Api.deleteNamespacedPersistentVolumeClaim({ name, namespace });
            logger_1.logger.info(`PVC deleted: ${name} in namespace ${namespace}`);
        }
        catch (error) {
            if (error.statusCode === 404) {
                logger_1.logger.warn(`PVC not found for deletion: ${name}`);
                return;
            }
            throw new errors_1.KubernetesError(`Failed to delete PVC ${name}`, error);
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
        // Handle nanocores (n), millicores (m), or cores (plain number)
        if (cpu.endsWith('n')) {
            return parseFloat(cpu.slice(0, -1)) / 1000000000;
        }
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
    /**
     * Execute a command in a pod and return streams for stdin/stdout/stderr
     */
    async execIntoPod(namespace, podName, command) {
        try {
            logger_1.logger.info('Starting exec session:', { namespace, podName, command });
            const exec = new k8s.Exec(this.kc);
            // Create streams for stdin, stdout, stderr
            const { PassThrough } = await Promise.resolve().then(() => __importStar(require('stream')));
            const stdin = new PassThrough();
            const stdout = new PassThrough();
            const stderr = new PassThrough();
            // Start exec with TTY enabled for interactive shell
            await exec.exec(namespace, podName, '', // container name (empty string means first container)
            command, stdout, // K8s expects Writable but PassThrough works for both
            stderr, stdin, true, // tty
            (status) => {
                logger_1.logger.info('Exec session status:', { namespace, podName, status });
            });
            logger_1.logger.info('Exec session established:', { namespace, podName });
            return { stdin, stdout, stderr };
        }
        catch (error) {
            logger_1.logger.error('Failed to exec into pod:', {
                namespace,
                podName,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new errors_1.KubernetesError(`Failed to exec into pod ${podName}`, error);
        }
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
