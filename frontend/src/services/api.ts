import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  User,
  Group,
  Workspace,
  CreateWorkspaceRequest,
  WorkspaceAction,
  DashboardStats,
  ResourceUsage,
  PaginatedResponse,
  AuditLog,
  ApiError,
  ComponentHealthStatus,
  GroupRole
} from '../types';

// Helper to get ID token from OIDC storage
const getAccessToken = (): string | null => {
  try {
    // react-oidc-context stores the user in session storage with a key starting with 'oidc.user:'
    const keys = Object.keys(sessionStorage).filter(key => key.startsWith('oidc.user:'));
    if (keys.length > 0) {
      const userData = sessionStorage.getItem(keys[0]);
      if (userData) {
        const user = JSON.parse(userData);
        return user.id_token || null;
      }
    }
  } catch (error) {
    console.warn('Failed to get ID token from storage:', error);
  }
  return null;
};

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_BASE_URL || '/api',
      timeout: 30000,
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid, redirect to login
          window.location.href = '/login';
        }
        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  private handleApiError(error: AxiosError): ApiError {
    if (error.response?.data && typeof error.response.data === 'object') {
      const data = error.response.data as any;
      return {
        message: data.message || 'An error occurred',
        code: data.code,
        details: data.details,
      };
    }
    return {
      message: error.message || 'Network error',
    };
  }

  // Auth
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get('/auth/me');
    return response.data.user;
  }

  async updateProfile(updates: { name?: string; email?: string }): Promise<User> {
    const response = await this.client.patch('/auth/profile', updates);
    return response.data.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string; providerUrl?: string }> {
    const response = await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.client.get('/dashboard/stats');
    return response.data;
  }

  // Groups
  async getGroups(): Promise<Group[]> {
    const response = await this.client.get('/groups');
    return response.data;
  }

  async getGroup(groupId: string): Promise<Group> {
    const response = await this.client.get(`/groups/${groupId}`);
    return response.data;
  }

  async createGroup(group: Omit<Group, 'id' | 'memberCount' | 'createdAt'>): Promise<Group> {
    const response = await this.client.post('/groups', group);
    return response.data;
  }

  async updateGroup(groupId: string, updates: Partial<Group>): Promise<Group> {
    const response = await this.client.patch(`/groups/${groupId}`, updates);
    return response.data;
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.client.delete(`/groups/${groupId}`);
  }

  async getGroupMembers(groupId: string): Promise<User[]> {
    const response = await this.client.get(`/groups/${groupId}/members`);
    return response.data;
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    await this.client.post(`/groups/${groupId}/members`, { userId });
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    await this.client.delete(`/groups/${groupId}/members/${userId}`);
  }

  async getGroupResourceUsage(groupId: string): Promise<ResourceUsage> {
    const response = await this.client.get(`/groups/${groupId}/usage`);
    return response.data;
  }

  // Workspaces
  async getWorkspaces(groupId?: string): Promise<Workspace[]> {
    const params = groupId ? { groupId } : {};
    const response = await this.client.get('/workspaces', { params });
    return response.data;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    const response = await this.client.get(`/workspaces/${workspaceId}`);
    return response.data;
  }

  async createWorkspace(workspace: CreateWorkspaceRequest): Promise<Workspace> {
    const response = await this.client.post('/workspaces', workspace);
    return response.data;
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<Workspace> {
    const response = await this.client.patch(`/workspaces/${workspaceId}`, updates);
    return response.data;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.client.delete(`/workspaces/${workspaceId}`);
  }

  async performWorkspaceAction(action: WorkspaceAction): Promise<Workspace> {
    const response = await this.client.post(`/workspaces/${action.workspaceId}/actions`, {
      type: action.type,
    });
    return response.data;
  }

  async syncWorkspaceFromKubernetes(workspaceId: string): Promise<Workspace> {
    const response = await this.client.post(`/workspaces/${workspaceId}/sync`);
    return response.data;
  }

  async getWorkspaceMetrics(workspaceId: string): Promise<ResourceUsage> {
    const response = await this.client.get(`/workspaces/${workspaceId}/metrics`);
    return response.data;
  }

  async getWorkspaceLogs(workspaceId: string, lines: number = 100): Promise<string> {
    const response = await this.client.get(`/workspaces/${workspaceId}/logs`, {
      params: { lines },
    });
    return response.data;
  }

  async getWorkspaceComponentHealth(workspaceId: string): Promise<ComponentHealthStatus[]> {
    const response = await this.client.get(`/workspaces/${workspaceId}/health`);
    return response.data;
  }

  // Users (admin only)
  async getUsers(nextToken?: string): Promise<PaginatedResponse<User>> {
    const params = nextToken ? { nextToken } : {};
    const response = await this.client.get('/admin/users', { params });
    return response.data;
  }

  async createUser(data: {
    email: string;
    name?: string;
    temporaryPassword: string;
    sendInvite?: boolean;
    isAdmin?: boolean;
    groups?: string[];
  }): Promise<User> {
    const response = await this.client.post('/admin/users', data);
    return response.data;
  }

  async getUser(userId: string): Promise<User> {
    const response = await this.client.get(`/admin/users/${userId}`);
    return response.data;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const response = await this.client.patch(`/admin/users/${userId}`, updates);
    return response.data;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.client.delete(`/admin/users/${userId}`);
  }

  async promoteUserToAdmin(userId: string): Promise<User> {
    const response = await this.client.post(`/admin/users/${userId}/promote`);
    return response.data;
  }

  async demoteUserFromAdmin(userId: string): Promise<User> {
    const response = await this.client.post(`/admin/users/${userId}/demote`);
    return response.data;
  }

  async resetUserPassword(userId: string, newPassword: string, permanent: boolean = false): Promise<void> {
    await this.client.post(`/admin/users/${userId}/reset-password`, {
      newPassword,
      permanent,
    });
  }

  async enableUser(userId: string): Promise<void> {
    await this.client.post(`/admin/users/${userId}/enable`);
  }

  async disableUser(userId: string): Promise<void> {
    await this.client.post(`/admin/users/${userId}/disable`);
  }

  async addUserToGroup(userId: string, groupId: string, role?: GroupRole): Promise<User> {
    const response = await this.client.post(`/admin/users/${userId}/groups`, { groupId, role });
    return response.data;
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<User> {
    const response = await this.client.delete(`/admin/users/${userId}/groups/${groupId}`);
    return response.data;
  }

  async setUserGroupRole(userId: string, groupId: string, role: GroupRole): Promise<User> {
    const response = await this.client.patch(`/admin/users/${userId}/groups/${groupId}/role`, { role });
    return response.data;
  }

  async promoteUserToGroupAdmin(userId: string, groupId: string): Promise<User> {
    const response = await this.client.post(`/admin/users/${userId}/groups/${groupId}/promote`);
    return response.data;
  }

  async demoteUserFromGroupAdmin(userId: string, groupId: string): Promise<User> {
    const response = await this.client.post(`/admin/users/${userId}/groups/${groupId}/demote`);
    return response.data;
  }

  // Audit logs (admin only)
  async getAuditLogs(
    startDate?: string,
    endDate?: string,
    userId?: string,
    nextToken?: string
  ): Promise<PaginatedResponse<AuditLog>> {
    const params = { startDate, endDate, userId, nextToken };
    const response = await this.client.get('/admin/audit-logs', { params });
    return response.data;
  }

  // Admin: Get all workspaces across all users
  async adminGetAllWorkspaces(): Promise<any[]> {
    const response = await this.client.get('/admin/workspaces');
    return response.data;
  }

  // Admin: Delete any workspace (admin override)
  async adminDeleteWorkspace(workspaceId: string): Promise<void> {
    await this.client.delete(`/admin/workspaces/${workspaceId}`);
  }

  // Admin: Get system settings
  async getSystemSettings(): Promise<any> {
    const response = await this.client.get('/admin/settings');
    return response.data;
  }

  // Admin: Update system settings
  async updateSystemSettings(settings: any): Promise<any> {
    const response = await this.client.patch('/admin/settings', settings);
    return response.data;
  }

  // Admin: Get cluster capacity
  async getClusterCapacity(): Promise<any> {
    const response = await this.client.get('/admin/cluster/capacity');
    return response.data;
  }

  // Health check
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();
