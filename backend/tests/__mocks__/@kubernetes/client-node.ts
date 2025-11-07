// Mock implementation of @kubernetes/client-node for testing
const mockCoreV1Api = {
  createNamespace: jest.fn(),
  deleteNamespace: jest.fn(),
  readNamespace: jest.fn(),
  listNamespace: jest.fn().mockResolvedValue({
    body: {
      items: [],
    },
  }),
  createNamespacedPod: jest.fn(),
  deleteNamespacedPod: jest.fn(),
  readNamespacedPod: jest.fn(),
  listNamespacedPod: jest.fn(),
  createNamespacedService: jest.fn(),
  deleteNamespacedService: jest.fn(),
  readNamespacedService: jest.fn(),
};

const mockAppsV1Api = {
  createNamespacedDeployment: jest.fn(),
  deleteNamespacedDeployment: jest.fn(),
  readNamespacedDeployment: jest.fn(),
  listNamespacedDeployment: jest.fn(),
};

const mockRbacV1Api = {
  createNamespacedRole: jest.fn(),
  createNamespacedRoleBinding: jest.fn(),
  deleteNamespacedRole: jest.fn(),
  deleteNamespacedRoleBinding: jest.fn(),
};

export class KubeConfig {
  loadFromDefault = jest.fn();
  loadFromCluster = jest.fn();
  makeApiClient = jest.fn((apiType: any) => {
    if (apiType === CoreV1Api) {
      return mockCoreV1Api;
    }
    if (apiType === AppsV1Api) {
      return mockAppsV1Api;
    }
    if (apiType === RbacAuthorizationV1Api) {
      return mockRbacV1Api;
    }
    return {};
  });
}

export class CoreV1Api {
  createNamespace = jest.fn();
  deleteNamespace = jest.fn();
  readNamespace = jest.fn();
  listNamespace = jest.fn().mockResolvedValue({
    body: {
      items: [],
    },
  });
  createNamespacedPod = jest.fn();
  deleteNamespacedPod = jest.fn();
  readNamespacedPod = jest.fn();
  listNamespacedPod = jest.fn();
  createNamespacedService = jest.fn();
  deleteNamespacedService = jest.fn();
  readNamespacedService = jest.fn();
}

export class AppsV1Api {
  createNamespacedDeployment = jest.fn();
  deleteNamespacedDeployment = jest.fn();
  readNamespacedDeployment = jest.fn();
  listNamespacedDeployment = jest.fn();
}

export class NetworkingV1Api {
  createNamespacedIngress = jest.fn();
  deleteNamespacedIngress = jest.fn();
  readNamespacedIngress = jest.fn();
}

export class RbacAuthorizationV1Api {
  createNamespacedRole = jest.fn();
  createNamespacedRoleBinding = jest.fn();
  deleteNamespacedRole = jest.fn();
  deleteNamespacedRoleBinding = jest.fn();
}

export class Metrics {
  constructor(kubeConfig: any) {}
  getNodeMetrics = jest.fn();
  getPodMetrics = jest.fn();
}

export class V1ObjectMeta {}
export class V1Namespace {}
export class V1Pod {}
export class V1Service {}
export class V1Deployment {}
export class V1Ingress {}
