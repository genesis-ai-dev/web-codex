import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { UsersPage } from './UsersPage';
import { GroupsPage } from './GroupsPage';
import { Card, CardContent } from '../components/Card';
import { cn } from '../utils';

type AdminTab = 'users' | 'groups' | 'workspaces' | 'audit-logs' | 'settings' | 'monitoring';

interface TabConfig {
  id: AdminTab;
  name: string;
  icon: React.ReactNode;
}

const tabs: TabConfig[] = [
  {
    id: 'users',
    name: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    id: 'groups',
    name: 'Groups',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'workspaces',
    name: 'Workspaces',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'audit-logs',
    name: 'Audit Logs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export const AdminPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract tab from URL hash or default to 'users'
  const getTabFromHash = (): AdminTab => {
    const hash = location.hash.replace('#', '');
    return (hash as AdminTab) || 'users';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getTabFromHash());

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    navigate(`/admin#${tab}`, { replace: true });
  };

  // Update active tab when hash changes (browser back/forward)
  React.useEffect(() => {
    const hash = location.hash.replace('#', '');
    setActiveTab((hash as AdminTab) || 'users');
  }, [location.hash]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'users':
        return <UsersTabContent />;
      case 'groups':
        return <GroupsTabContent />;
      case 'workspaces':
        return <WorkspacesTabContent />;
      case 'audit-logs':
        return <AuditLogsPlaceholder />;
      case 'settings':
        return <SettingsPlaceholder />;
      case 'monitoring':
        return <MonitoringPlaceholder />;
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Administration</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage users, groups, and system settings for your platform.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                <span className={cn(
                  'mr-2',
                  activeTab === tab.id ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                )}>
                  {tab.icon}
                </span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div>
          {renderTabContent()}
        </div>
      </div>
    </Layout>
  );
};

// Tab content components - these wrap the existing pages without Layout
const UsersTabContent: React.FC = () => {
  return <UsersPage isEmbedded />;
};

const GroupsTabContent: React.FC = () => {
  return <GroupsPage isEmbedded />;
};

const WorkspacesTabContent: React.FC = () => {
  const [workspaces, setWorkspaces] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [terminalWorkspace, setTerminalWorkspace] = React.useState<any | null>(null);

  React.useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await require('../services/api').apiService.adminGetAllWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError('Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="text-center py-12">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Error</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={loadWorkspaces}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">All Workspaces</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          View and manage all workspaces across all users ({workspaces.length} total)
        </p>
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Workspaces</h3>
            <p className="text-gray-600 dark:text-gray-400">No workspaces have been created yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center">
                        <h3 className="text-sm font-medium text-primary-600 dark:text-primary-400 truncate">
                          {workspace.name}
                        </h3>
                        <span className={`ml-3 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          workspace.status === 'running' ? 'bg-green-100 text-green-800' :
                          workspace.status === 'stopped' ? 'bg-gray-100 text-gray-800' :
                          workspace.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {workspace.status}
                        </span>
                      </div>
                      {workspace.description && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{workspace.description}</p>
                      )}
                      <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {workspace.userName || workspace.userEmail}
                        <span className="mx-2">•</span>
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {workspace.groupName}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {workspace.status === 'running' && (
                        <button
                          onClick={() => setTerminalWorkspace(workspace)}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Open Terminal
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Terminal Modal */}
      {terminalWorkspace && (
        <React.Suspense fallback={<div>Loading...</div>}>
          {(() => {
            const { TerminalModal } = require('../components/TerminalModal');
            return (
              <TerminalModal
                isOpen={true}
                onClose={() => setTerminalWorkspace(null)}
                workspaceId={terminalWorkspace.id}
                workspaceName={terminalWorkspace.name}
              />
            );
          })()}
        </React.Suspense>
      )}
    </>
  );
};

const AuditLogsPlaceholder: React.FC = () => {
  return (
    <Card className="max-w-2xl">
      <CardContent className="text-center py-12">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Audit Logs
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Track all administrative actions, user activity, workspace operations, and security events across the platform.
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
          <p className="font-medium">Planned features:</p>
          <ul className="text-left max-w-md mx-auto space-y-1">
            <li>• User authentication and authorization events</li>
            <li>• Workspace creation, modification, and deletion</li>
            <li>• Group and user management actions</li>
            <li>• Resource quota changes</li>
            <li>• API access logs with filtering and search</li>
            <li>• Export logs to CSV or JSON</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

const SettingsPlaceholder: React.FC = () => {
  return (
    <Card className="max-w-2xl">
      <CardContent className="text-center py-12">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          System Settings
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Configure platform-wide settings, default resource limits, and authentication providers.
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
          <p className="font-medium">Planned features:</p>
          <ul className="text-left max-w-md mx-auto space-y-1">
            <li>• Default resource quotas for new groups</li>
            <li>• OAuth provider configuration (Cognito, Google, etc.)</li>
            <li>• Platform branding and customization</li>
            <li>• Email notification settings</li>
            <li>• Security policies and session timeouts</li>
            <li>• API rate limiting configuration</li>
            <li>• Kubernetes cluster connection settings</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

const MonitoringPlaceholder: React.FC = () => {
  return (
    <Card className="max-w-2xl">
      <CardContent className="text-center py-12">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          System Monitoring
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Monitor platform health, resource usage, and performance metrics across all workspaces and namespaces.
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
          <p className="font-medium">Planned features:</p>
          <ul className="text-left max-w-md mx-auto space-y-1">
            <li>• Real-time resource usage dashboards</li>
            <li>• CPU, memory, and storage utilization by group</li>
            <li>• Active workspace count and status</li>
            <li>• Kubernetes cluster health metrics</li>
            <li>• Pod status and deployment monitoring</li>
            <li>• Historical usage trends and graphs</li>
            <li>• Alerting for quota limits and resource constraints</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
