import * as k8s from '@kubernetes/client-node';
import { kubernetesService } from '../../src/services/kubernetesService';
import { KubernetesError } from '../../src/utils/errors';

// Mock Kubernetes client
jest.mock('@kubernetes/client-node', () => {
  const mockCreateNamespace = jest.fn();
  const mockListNamespace = jest.fn();
  const mockReadNamespace = jest.fn();
  const mockDeleteNamespace = jest.fn();
  const mockCreateResourceQuota = jest.fn();
  const mockReadResourceQuota = jest.fn();
  const mockUpdateResourceQuota = jest.fn();
  const mockDeleteResourceQuota = jest.fn();
  const mockCreateDeployment = jest.fn();
  const mockReadNamespacedDeployment = jest.fn();
  const mockPatchNamespacedDeployment = jest.fn();
  const mockDeleteNamespacedDeployment = jest.fn();
  const mockListNamespacedDeployment = jest.fn();
  const mockCreateNamespacedService = jest.fn();
  const mockReadNamespacedService = jest.fn();
  const mockDeleteNamespacedService = jest.fn();
  const mockCreateNamespacedPersistentVolumeClaim = jest.fn();
  const mockDeleteNamespacedPersistentVolumeClaim = jest.fn();
  const mockListNamespacedPod = jest.fn();
  const mockReadNamespacedPodLog = jest.fn();
  const mockGetNodeMetrics = jest.fn();
  const mockGetPodMetrics = jest.fn();

  return {
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromCluster: jest.fn(),
      loadFromDefault: jest.fn(),
      makeApiClient: jest.fn((apiType) => {
        if (apiType.name === 'CoreV1Api') {
          return {
            createNamespace: mockCreateNamespace,
            listNamespace: mockListNamespace,
            readNamespace: mockReadNamespace,
            deleteNamespace: mockDeleteNamespace,
            createNamespacedResourceQuota: mockCreateResourceQuota,
            readNamespacedResourceQuota: mockReadResourceQuota,
            patchNamespacedResourceQuota: mockUpdateResourceQuota,
            deleteNamespacedResourceQuota: mockDeleteResourceQuota,
            createNamespacedService: mockCreateNamespacedService,
            readNamespacedService: mockReadNamespacedService,
            deleteNamespacedService: mockDeleteNamespacedService,
            createNamespacedPersistentVolumeClaim: mockCreateNamespacedPersistentVolumeClaim,
            deleteNamespacedPersistentVolumeClaim: mockDeleteNamespacedPersistentVolumeClaim,
            listNamespacedPod: mockListNamespacedPod,
            readNamespacedPodLog: mockReadNamespacedPodLog,
          };
        } else if (apiType.name === 'AppsV1Api') {
          return {
            createNamespacedDeployment: mockCreateDeployment,
            readNamespacedDeployment: mockReadNamespacedDeployment,
            patchNamespacedDeployment: mockPatchNamespacedDeployment,
            deleteNamespacedDeployment: mockDeleteNamespacedDeployment,
            listNamespacedDeployment: mockListNamespacedDeployment,
          };
        } else if (apiType.name === 'RbacAuthorizationV1Api') {
          return {};
        }
        return {};
      }),
    })),
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    RbacAuthorizationV1Api: jest.fn(),
    Metrics: jest.fn().mockImplementation(() => ({
      getNodeMetrics: mockGetNodeMetrics,
      getPodMetrics: mockGetPodMetrics,
    })),
  };
});

jest.mock('../../src/config/logger');

describe('KubernetesService', () => {
  let mockCoreV1Api: any;
  let mockAppsV1Api: any;
  let mockMetricsClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockKc = new k8s.KubeConfig();
    mockCoreV1Api = mockKc.makeApiClient(k8s.CoreV1Api);
    mockAppsV1Api = mockKc.makeApiClient(k8s.AppsV1Api);
    mockMetricsClient = new k8s.Metrics(mockKc);
  });

  describe('Namespace Operations', () => {
    describe('createNamespace', () => {
      it('should create a namespace successfully', async () => {
        mockCoreV1Api.createNamespace.mockResolvedValue({});

        await kubernetesService.createNamespace('test-namespace');

        expect(mockCoreV1Api.createNamespace).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              metadata: expect.objectContaining({
                name: 'test-namespace',
              }),
            }),
          })
        );
      });

      it('should handle namespace already exists', async () => {
        mockCoreV1Api.createNamespace.mockRejectedValue({ statusCode: 409 });

        await expect(kubernetesService.createNamespace('test-namespace')).resolves.not.toThrow();
      });

      it('should throw KubernetesError on other errors', async () => {
        mockCoreV1Api.createNamespace.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.createNamespace('test-namespace')).rejects.toThrow(
          KubernetesError
        );
      });

      it('should create namespace with labels', async () => {
        mockCoreV1Api.createNamespace.mockResolvedValue({});

        await kubernetesService.createNamespace('test-namespace', { env: 'test' });

        expect(mockCoreV1Api.createNamespace).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              metadata: expect.objectContaining({
                labels: expect.objectContaining({
                  env: 'test',
                }),
              }),
            }),
          })
        );
      });
    });

    describe('listNamespaces', () => {
      it('should list namespaces', async () => {
        const namespaceList = {
          body: {
            items: [
              { metadata: { name: 'namespace1' } },
              { metadata: { name: 'namespace2' } },
            ],
          },
        };

        mockCoreV1Api.listNamespace.mockResolvedValue(namespaceList);

        const result = await kubernetesService.listNamespaces();

        expect(result).toEqual(namespaceList);
        expect(mockCoreV1Api.listNamespace).toHaveBeenCalled();
      });

      it('should throw KubernetesError on error', async () => {
        mockCoreV1Api.listNamespace.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.listNamespaces()).rejects.toThrow(KubernetesError);
      });
    });

    describe('deleteNamespace', () => {
      it('should delete a namespace', async () => {
        mockCoreV1Api.deleteNamespace.mockResolvedValue({});

        await kubernetesService.deleteNamespace('test-namespace');

        expect(mockCoreV1Api.deleteNamespace).toHaveBeenCalledWith({ name: 'test-namespace' });
      });

      it('should handle namespace not found', async () => {
        mockCoreV1Api.deleteNamespace.mockRejectedValue({ statusCode: 404 });

        await expect(kubernetesService.deleteNamespace('test-namespace')).resolves.not.toThrow();
      });

      it('should throw KubernetesError on other errors', async () => {
        mockCoreV1Api.deleteNamespace.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.deleteNamespace('test-namespace')).rejects.toThrow(
          KubernetesError
        );
      });
    });

    describe('namespaceExists', () => {
      it('should return true if namespace exists', async () => {
        mockCoreV1Api.readNamespace.mockResolvedValue({});

        const result = await kubernetesService.namespaceExists('test-namespace');

        expect(result).toBe(true);
        expect(mockCoreV1Api.readNamespace).toHaveBeenCalledWith({ name: 'test-namespace' });
      });

      it('should return false if namespace does not exist', async () => {
        mockCoreV1Api.readNamespace.mockRejectedValue({ statusCode: 404 });

        const result = await kubernetesService.namespaceExists('test-namespace');

        expect(result).toBe(false);
      });

      it('should throw KubernetesError on other errors', async () => {
        mockCoreV1Api.readNamespace.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.namespaceExists('test-namespace')).rejects.toThrow(
          KubernetesError
        );
      });
    });
  });

  describe('Resource Quota Operations', () => {
    describe('createResourceQuota', () => {
      it('should create a resource quota', async () => {
        const quota = {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        };

        mockCoreV1Api.createNamespacedResourceQuota.mockResolvedValue({});

        await kubernetesService.createResourceQuota('test-namespace', quota);

        expect(mockCoreV1Api.createNamespacedResourceQuota).toHaveBeenCalledWith(
          expect.objectContaining({
            namespace: 'test-namespace',
          })
        );
      });

      it('should throw KubernetesError on error', async () => {
        mockCoreV1Api.createNamespacedResourceQuota.mockRejectedValue(new Error('K8s error'));

        await expect(
          kubernetesService.createResourceQuota('test-namespace', {})
        ).rejects.toThrow(KubernetesError);
      });
    });

    describe('getResourceQuota', () => {
      it('should get a resource quota', async () => {
        const quota = {
          body: {
            status: {
              hard: { 'requests.cpu': '10', 'requests.memory': '20Gi' },
              used: { 'requests.cpu': '5', 'requests.memory': '10Gi' },
            },
          },
        };

        mockCoreV1Api.readNamespacedResourceQuota.mockResolvedValue(quota);

        const result = await kubernetesService.getResourceQuota('test-namespace');

        expect(mockCoreV1Api.readNamespacedResourceQuota).toHaveBeenCalled();
      });

      it('should throw KubernetesError on error', async () => {
        mockCoreV1Api.readNamespacedResourceQuota.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.getResourceQuota('test-namespace')).rejects.toThrow(
          KubernetesError
        );
      });
    });

    describe('updateResourceQuota', () => {
      it('should update a resource quota', async () => {
        const quota = { cpu: '20', memory: '40Gi' };

        mockCoreV1Api.patchNamespacedResourceQuota.mockResolvedValue({});

        await kubernetesService.updateResourceQuota('test-namespace', quota);

        expect(mockCoreV1Api.patchNamespacedResourceQuota).toHaveBeenCalled();
      });

      it('should throw KubernetesError on error', async () => {
        mockCoreV1Api.patchNamespacedResourceQuota.mockRejectedValue(new Error('K8s error'));

        await expect(
          kubernetesService.updateResourceQuota('test-namespace', {})
        ).rejects.toThrow(KubernetesError);
      });
    });

    describe('deleteResourceQuota', () => {
      it('should delete a resource quota', async () => {
        mockCoreV1Api.deleteNamespacedResourceQuota.mockResolvedValue({});

        await kubernetesService.deleteResourceQuota('test-namespace');

        expect(mockCoreV1Api.deleteNamespacedResourceQuota).toHaveBeenCalled();
      });
    });
  });

  describe('Deployment Operations', () => {
    describe('createDeployment', () => {
      it('should create a deployment', async () => {
        const deploymentSpec = {
          name: 'test-deployment',
          namespace: 'test-namespace',
          image: 'test-image:latest',
          replicas: 1,
          resources: { cpu: '1', memory: '2Gi' },
        };

        mockAppsV1Api.createNamespacedDeployment.mockResolvedValue({});

        await kubernetesService.createDeployment(deploymentSpec);

        expect(mockAppsV1Api.createNamespacedDeployment).toHaveBeenCalled();
      });

      it('should throw KubernetesError on error', async () => {
        mockAppsV1Api.createNamespacedDeployment.mockRejectedValue(new Error('K8s error'));

        await expect(kubernetesService.createDeployment({} as any)).rejects.toThrow(
          KubernetesError
        );
      });
    });

    describe('getDeployment', () => {
      it('should get a deployment', async () => {
        const deployment = {
          body: {
            metadata: { name: 'test-deployment' },
            spec: { replicas: 1 },
          },
        };

        mockAppsV1Api.readNamespacedDeployment.mockResolvedValue(deployment);

        const result = await kubernetesService.getDeployment('test-namespace', 'test-deployment');

        expect(mockAppsV1Api.readNamespacedDeployment).toHaveBeenCalledWith({
          name: 'test-deployment',
          namespace: 'test-namespace',
        });
      });

      it('should throw KubernetesError on error', async () => {
        mockAppsV1Api.readNamespacedDeployment.mockRejectedValue(new Error('K8s error'));

        await expect(
          kubernetesService.getDeployment('test-namespace', 'test-deployment')
        ).rejects.toThrow(KubernetesError);
      });
    });

    describe('updateDeployment', () => {
      it('should update a deployment', async () => {
        mockAppsV1Api.patchNamespacedDeployment.mockResolvedValue({});

        await kubernetesService.updateDeployment('test-namespace', 'test-deployment', {
          replicas: 2,
        });

        expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalled();
      });
    });

    describe('deleteDeployment', () => {
      it('should delete a deployment', async () => {
        mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValue({});

        await kubernetesService.deleteDeployment('test-namespace', 'test-deployment');

        expect(mockAppsV1Api.deleteNamespacedDeployment).toHaveBeenCalledWith({
          name: 'test-deployment',
          namespace: 'test-namespace',
        });
      });

      it('should handle deployment not found', async () => {
        mockAppsV1Api.deleteNamespacedDeployment.mockRejectedValue({ statusCode: 404 });

        await expect(
          kubernetesService.deleteDeployment('test-namespace', 'test-deployment')
        ).resolves.not.toThrow();
      });
    });

    describe('listDeployments', () => {
      it('should list deployments in namespace', async () => {
        const deployments = {
          body: {
            items: [
              { metadata: { name: 'deployment1' } },
              { metadata: { name: 'deployment2' } },
            ],
          },
        };

        mockAppsV1Api.listNamespacedDeployment.mockResolvedValue(deployments);

        const result = await kubernetesService.listDeployments('test-namespace');

        expect(mockAppsV1Api.listNamespacedDeployment).toHaveBeenCalledWith({
          namespace: 'test-namespace',
        });
      });
    });
  });

  describe('Service Operations', () => {
    describe('createService', () => {
      it('should create a service', async () => {
        mockCoreV1Api.createNamespacedService.mockResolvedValue({});

        await kubernetesService.createService('test-namespace', 'test-service', {
          app: 'test',
        });

        expect(mockCoreV1Api.createNamespacedService).toHaveBeenCalled();
      });
    });
  });

  describe('Pod Operations', () => {
    describe('listPods', () => {
      it('should list pods in namespace', async () => {
        const pods = {
          body: {
            items: [
              {
                metadata: { name: 'pod1' },
                status: { phase: 'Running' },
              },
            ],
          },
        };

        mockCoreV1Api.listNamespacedPod.mockResolvedValue(pods);

        const result = await kubernetesService.listPods('test-namespace');

        expect(mockCoreV1Api.listNamespacedPod).toHaveBeenCalledWith({
          namespace: 'test-namespace',
        });
      });
    });

    describe('getPodLogs', () => {
      it('should get pod logs', async () => {
        const logs = { body: 'log line 1\nlog line 2' };

        mockCoreV1Api.readNamespacedPodLog.mockResolvedValue(logs);

        const result = await kubernetesService.getPodLogs('test-namespace', 'test-pod');

        expect(mockCoreV1Api.readNamespacedPodLog).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test-pod',
            namespace: 'test-namespace',
          })
        );
      });

      it('should get pod logs with custom line count', async () => {
        const logs = { body: 'log line 1' };

        mockCoreV1Api.readNamespacedPodLog.mockResolvedValue(logs);

        await kubernetesService.getPodLogs('test-namespace', 'test-pod', 100);

        expect(mockCoreV1Api.readNamespacedPodLog).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test-pod',
            namespace: 'test-namespace',
          })
        );
      });
    });
  });

  describe('PVC Operations', () => {
    describe('createPVC', () => {
      it('should create a persistent volume claim', async () => {
        mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({});

        await kubernetesService.createPVC('test-namespace', 'test-pvc', '10Gi');

        expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalled();
      });

      it('should create PVC with custom storage class', async () => {
        mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({});

        await kubernetesService.createPVC('test-namespace', 'test-pvc', '10Gi', 'fast-ssd');

        expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalled();
      });
    });
  });
});
