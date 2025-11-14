import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { CircularProgress } from '../components/Progress';
import { DashboardStats, Workspace } from '../types';
import { apiService } from '../services/api';
import { formatRelativeTime, getErrorMessage } from '../utils';

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [dashboardStats, workspaces] = await Promise.all([
        apiService.getDashboardStats(),
        apiService.getWorkspaces()
      ]);
      
      setStats(dashboardStats);
      // Show most recent workspaces
      setRecentWorkspaces(workspaces.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="spinner w-8 h-8 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
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
                Failed to load dashboard
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              <Button onClick={loadDashboardData}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Welcome back! Here's an overview of your development workspaces and platform activity.
          </p>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Workspaces"
            value={stats?.totalWorkspaces || 0}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            color="bg-primary-500"
          />
          
          <StatsCard
            title="Running Workspaces"
            value={stats?.runningWorkspaces || 0}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293L12 11l.707-.707A1 1 0 0113.414 10H15M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            color="bg-success-500"
          />
          
          <StatsCard
            title="Groups"
            value={stats?.totalGroups || 0}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
            color="bg-warning-500"
          />
          
          <StatsCard
            title="CPU Usage"
            value={`${Math.round(stats?.resourceUsage?.cpu?.percentage || 0)}%`}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            }
            color="bg-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Resource Usage */}
          <Card>
            <CardHeader>
              <CardTitle>Resource Usage</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.resourceUsage ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <CircularProgress
                      value={stats.resourceUsage.cpu.percentage}
                      size={80}
                      showValue
                      className="mb-2"
                    />
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.resourceUsage.cpu.used} / {stats.resourceUsage.cpu.total}
                    </div>
                  </div>

                  <div className="text-center">
                    <CircularProgress
                      value={stats.resourceUsage.memory.percentage}
                      size={80}
                      showValue
                      className="mb-2"
                    />
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.resourceUsage.memory.used} / {stats.resourceUsage.memory.total}
                    </div>
                  </div>

                  <div className="text-center">
                    <CircularProgress
                      value={stats.resourceUsage.storage.percentage}
                      size={80}
                      showValue
                      className="mb-2"
                    />
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.resourceUsage.storage.used} / {stats.resourceUsage.storage.total}
                    </div>
                  </div>

                  <div className="text-center">
                    <CircularProgress
                      value={stats.resourceUsage.pods.percentage}
                      size={80}
                      showValue
                      className="mb-2"
                    />
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Pods</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.resourceUsage.pods.used} / {stats.resourceUsage.pods.total}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No resource data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Workspaces */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Workspaces</CardTitle>
                <Link to="/workspaces">
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentWorkspaces.length > 0 ? (
                <div className="space-y-4">
                  {recentWorkspaces.map((workspace) => (
                    <WorkspaceItem key={workspace.id} workspace={workspace} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">No workspaces yet</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Get started by creating your first workspace
                  </p>
                  <Link to="/workspaces">
                    <Button size="sm">
                      Create Workspace
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color }) => (
  <Card>
    <CardContent className="flex items-center">
      <div className={`p-3 rounded-lg ${color} mr-4`}>
        <div className="text-white">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </CardContent>
  </Card>
);

interface WorkspaceItemProps {
  workspace: Workspace;
}

const WorkspaceItem: React.FC<WorkspaceItemProps> = ({ workspace }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-3">
      <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
        <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" clipRule="evenodd" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{workspace.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{workspace.groupName}</p>
      </div>
    </div>
    <div className="flex items-center space-x-2">
      <StatusBadge status={workspace.status} />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {formatRelativeTime(workspace.updatedAt)}
      </p>
    </div>
  </div>
);
