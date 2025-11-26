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
  groups: string[];
  groupMemberships?: GroupMembership[];
  isAdmin: boolean;
}

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

export interface ResourceUsage {
  cpu: {
    used: string;
    total: string;
    percentage: number;
  };
  memory: {
    used: string;
    total: string;
    percentage: number;
  };
  storage: {
    used: string;
    total: string;
    percentage: number;
  };
  pods: {
    used: number;
    total: number;
    percentage: number;
  };
}

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
  resources: {
    cpu: string;
    memory: string;
    storage: string;
  };
  usage?: ResourceUsage;
  image: string;
  replicas: number;
}

export type WorkspaceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'pending';

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  groupId: string;
  image?: string;
  tier?: ResourceTier;
  resources?: {
    cpu: string;
    memory: string;
    storage: string;
  };
}

export interface WorkspaceAction {
  type: 'start' | 'stop' | 'restart' | 'delete';
  workspaceId: string;
}

export interface AuthConfig {
  authority: string; // OIDC authority URL (e.g., 'https://cognito-idp.region.amazonaws.com/user-pool-id')
  clientId: string;
  redirectUri: string;
  logoutUri?: string;
  scope?: string;
  cognitoDomain?: string; // for logout (e.g., 'your-domain.auth.region.amazoncognito.com')
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  total?: number;
}

export interface DashboardStats {
  totalWorkspaces: number;
  runningWorkspaces: number;
  totalGroups: number;
  resourceUsage: ResourceUsage;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  details: any;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface NotificationSettings {
  email: boolean;
  workspaceEvents: boolean;
  resourceAlerts: boolean;
  securityAlerts: boolean;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  language: string;
  notifications: NotificationSettings;
}

export interface ComponentHealthStatus {
  name: string;
  type: 'deployment' | 'service' | 'pvc' | 'pod';
  healthy: boolean;
  status: string;
  reason: string;
  details: any;
}

export interface SystemSettings {
  id: string;
  defaultWorkspaceImage: string;
  updatedAt: string;
  updatedBy: string;
}
