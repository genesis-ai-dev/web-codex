import { Request } from 'express';

// User and authentication types
export enum GroupRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export interface GroupMembership {
  groupId: string;
  role: GroupRole;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  groups: string[]; // Legacy: array of group IDs (kept for backward compatibility)
  groupMemberships?: GroupMembership[]; // New: group memberships with roles
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface JwtPayload {
  sub: string;
  username?: string;
  name?: string; // User's display name from OAuth provider
  email?: string; // Optional because access tokens don't contain email
  groups?: string[];
  iat: number;
  exp: number;
}

// Group types
export interface Group {
  id: string;
  name: string;
  displayName: string;
  namespace: string;
  description?: string;
  memberCount: number;
  resourceQuota: ResourceQuota;
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
  displayName: string;
  description?: string;
  namespace: string;
  resourceQuota?: ResourceQuota;
}

// Resource types
export enum ResourceTier {
  SINGLE_USER = 'single-user',
  SMALL_TEAM = 'small-team',
  ENTERPRISE = 'enterprise',
}

export interface ResourceQuota {
  cpu: string;
  memory: string;
  storage: string;
  pods: number;
}

export interface ResourceMetric {
  used: string;
  total: string;
  percentage: number;
}

export interface ResourceUsage {
  cpu: ResourceMetric;
  memory: ResourceMetric;
  storage: ResourceMetric;
  pods: {
    used: number;
    total: number;
    percentage: number;
  };
}

// Workspace types
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  groupId: string;
  groupName: string;
  userId: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  url?: string;
  password: string;
  resources: WorkspaceResources;
  usage?: ResourceUsage;
  image: string;
  replicas: number;
}

export enum WorkspaceStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  STARTING = 'starting',
  STOPPING = 'stopping',
  ERROR = 'error',
  PENDING = 'pending'
}

export interface WorkspaceResources {
  cpu: string;
  memory: string;
  storage: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  groupId: string;
  image?: string;
  resources?: WorkspaceResources;
  tier?: ResourceTier;
}

export interface WorkspaceActionRequest {
  type: 'start' | 'stop' | 'restart';
}

// Dashboard types
export interface DashboardStats {
  totalWorkspaces: number;
  runningWorkspaces: number;
  totalGroups: number;
  resourceUsage: ResourceUsage;
}

// Admin types
export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  details?: any;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface SystemSettings {
  id: string;
  defaultWorkspaceImage: string;
  updatedAt: string;
  updatedBy: string;
}

export interface UpdateSystemSettingsRequest {
  defaultWorkspaceImage?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  total?: number;
}

// Kubernetes types
export interface KubernetesConfig {
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface PodStatus {
  name: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
  cpu?: string;
  memory?: string;
}

export interface ComponentHealthStatus {
  name: string;
  type: 'deployment' | 'service' | 'pvc' | 'pod';
  healthy: boolean;
  status: string;
  reason: string;
  details: any;
}

export interface NodeCapacity {
  cpu: string;
  memory: string;
  pods: string;
}

export interface ClusterCapacity {
  totalCpu: string;
  totalMemory: string;
  totalPods: number;
  allocatableCpu: string;
  allocatableMemory: string;
  allocatablePods: number;
  usedCpu: string;
  usedMemory: string;
  usedPods: number;
  nodeCount: number;
}

// AWS/Database types
export interface DynamoDBItem {
  [key: string]: any;
}

// Rate limiting
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}
