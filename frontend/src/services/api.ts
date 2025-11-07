import axios, { AxiosInstance, AxiosError } from 'axios';
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
  ApiError 
} from '../types';
import { authService } from './auth';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 30000,
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = authService.getAuthToken();
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
          // Try to refresh token
          try {
            await authService.refreshSession();
            // Retry the original request
            if (error.config) {
              const token = authService.getAuthToken();
              error.config.headers.Authorization = `Bearer ${token}`;
              return this.client.request(error.config);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            window.location.href = '/login';
          }
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

  // Users (admin only)
  async getUsers(nextToken?: string): Promise<PaginatedResponse<User>> {
    const params = nextToken ? { nextToken } : {};
    const response = await this.client.get('/admin/users', { params });
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

  // Health check
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();
