import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Workspace, ComponentHealthStatus } from '../types';
import { apiService } from '../services/api';
import { formatRelativeTime, formatCPU, formatMemory, getErrorMessage } from '../utils';

export const WorkspaceDetailsPage: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [componentHealth, setComponentHealth] = useState<ComponentHealthStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const handleCopyPassword = () => {
    if (workspace?.password) {
      navigator.clipboard.writeText(workspace.password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  const handleCopyUrl = () => {
    if (workspace?.url) {
      navigator.clipboard.writeText(workspace.url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const loadData = async () => {
    if (!workspaceId) return;

    try {
      setIsLoading(true);
      setError(null);

      const [workspaceData, healthData] = await Promise.all([
        apiService.getWorkspace(workspaceId),
        apiService.getWorkspaceComponentHealth(workspaceId)
      ]);

      setWorkspace(workspaceData);
      setComponentHealth(healthData);
    } catch (error) {
      console.error('Failed to load workspace details:', error);
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncFromKubernetes = async () => {
    if (!workspaceId) return;

    setRefreshing(true);
    try {
      const syncedWorkspace = await apiService.syncWorkspaceFromKubernetes(workspaceId);
      setWorkspace(syncedWorkspace);
      // Also refresh health data
      const healthData = await apiService.getWorkspaceComponentHealth(workspaceId);
      setComponentHealth(healthData);
    } catch (error) {
      console.error('Failed to sync workspace from Kubernetes:', error);
      setError(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleWorkspaceAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!workspaceId) return;

    try {
      await apiService.performWorkspaceAction({
        type: action,
        workspaceId
      });
      // Wait a moment and refresh to show updated status
      setTimeout(() => {
        loadData();
      }, 2000);
    } catch (error) {
      console.error(`Failed to ${action} workspace:`, error);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="spinner w-8 h-8 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading workspace details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !workspace) {
    return (
      <Layout>
        <div className="min-h-[400px] flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="text-center">
              <div className="w-12 h-12 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-error-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Failed to load workspace
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error || 'Workspace not found'}</p>
              <div className="flex space-x-3 justify-center">
                <Button onClick={loadData} variant="secondary">
                  Try again
                </Button>
                <Button onClick={() => navigate('/workspaces')}>
                  Back to Workspaces
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const overallHealthy = componentHealth.every(c => c.healthy);

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/workspaces')}
              className="mr-4"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{workspace.name}</h1>
              {workspace.description && (
                <p className="text-gray-600 dark:text-gray-400 mt-1">{workspace.description}</p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <StatusBadge status={workspace.status} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSyncFromKubernetes}
                isLoading={refreshing}
                title="Sync from Kubernetes"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="ml-2 text-sm">Sync</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                isLoading={refreshing}
                title="Refresh"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            {workspace.status === 'running' ? (
              <>
                <Button
                  onClick={() => workspace.url && window.open(workspace.url, '_blank')}
                  disabled={!workspace.url}
                >
                  Open Codex
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCopyUrl}
                  disabled={!workspace.url}
                  title="Copy workspace URL"
                >
                  {urlCopied ? (
                    <>
                      <svg className="w-4 h-4 text-success-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy URL
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleWorkspaceAction('stop')}
                >
                  Stop Workspace
                </Button>
              </>
            ) : (
              <Button
                onClick={() => handleWorkspaceAction('start')}
                disabled={workspace.status === 'starting'}
              >
                {workspace.status === 'starting' ? 'Starting...' : 'Start Workspace'}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => handleWorkspaceAction('restart')}
            >
              Restart
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Component Health Status */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Kubernetes Components</CardTitle>
                  <div className="flex items-center space-x-2">
                    {overallHealthy ? (
                      <>
                        <svg className="w-5 h-5 text-success-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-success-700">All Healthy</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-warning-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-warning-700">Issues Detected</span>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {componentHealth.map((component) => (
                    <ComponentHealthCard key={component.name} component={component} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workspace Info Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Password Field */}
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Password</p>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <p className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                          {showPassword ? workspace.password : '••••••••••••••••••••••••'}
                        </p>
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={handleCopyPassword}
                          className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                          title="Copy password"
                        >
                          {passwordCopied ? (
                            <svg className="w-4 h-4 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <InfoItem
                    label="Group"
                    value={workspace.groupName}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    }
                  />
                  <InfoItem
                    label="Image"
                    value={workspace.image}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    }
                  />
                  <InfoItem
                    label="Created"
                    value={formatRelativeTime(workspace.createdAt)}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                  <InfoItem
                    label="Last Accessed"
                    value={workspace.lastAccessedAt ? formatRelativeTime(workspace.lastAccessedAt) : 'Never'}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">CPU</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCPU(workspace.resources.cpu)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Memory</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatMemory(workspace.resources.memory)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Storage</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{workspace.resources.storage}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

interface ComponentHealthCardProps {
  component: ComponentHealthStatus;
}

const ComponentHealthCard: React.FC<ComponentHealthCardProps> = ({ component }) => {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (component.type) {
      case 'statefulset':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12v5" />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
          </svg>
        );
      case 'deployment':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        );
      case 'service':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        );
      case 'pvc':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        );
      case 'pod':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        );
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div className="flex items-start space-x-4">
        <div className={`flex-shrink-0 p-2 rounded-lg ${component.healthy ? 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-400' : 'bg-error-100 text-error-600 dark:bg-error-900/30 dark:text-error-400'}`}>
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{component.name}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{component.status}</p>
            </div>
            <div className="flex items-center space-x-2">
              {component.healthy ? (
                <svg className="w-5 h-5 text-success-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-error-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              {Object.keys(component.details).length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{component.reason}</p>

          {expanded && Object.keys(component.details).length > 0 && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs">
              <pre className="whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300">
                {JSON.stringify(component.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface InfoItemProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const InfoItem: React.FC<InfoItemProps> = ({ label, value, icon }) => {
  return (
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
};
