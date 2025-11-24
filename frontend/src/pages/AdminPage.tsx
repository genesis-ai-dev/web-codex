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
  const [deletingWorkspace, setDeletingWorkspace] = React.useState<string | null>(null);

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

  const handleDeleteWorkspace = async (workspaceId: string, workspaceName: string) => {
    if (!window.confirm(`Are you sure you want to delete workspace "${workspaceName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingWorkspace(workspaceId);
      await require('../services/api').apiService.adminDeleteWorkspace(workspaceId);

      // Remove the workspace from the list
      setWorkspaces(prev => prev.filter(ws => ws.id !== workspaceId));

      // Show success message (you could use a toast notification here)
      console.log(`Workspace ${workspaceName} deleted successfully`);
    } catch (err: any) {
      console.error('Failed to delete workspace:', err);
      alert(`Failed to delete workspace: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeletingWorkspace(null);
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
                    <div className="ml-4 flex-shrink-0 flex gap-2">
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
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id, workspace.name)}
                        disabled={deletingWorkspace === workspace.id}
                        className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-600 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 dark:text-red-400 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingWorkspace === workspace.id ? (
                          <>
                            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
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
  const [settings, setSettings] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [editedImage, setEditedImage] = React.useState('');

  React.useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('Loading system settings...');
      const data = await require('../services/api').apiService.getSystemSettings();
      console.log('System settings loaded:', data);
      setSettings(data);
      setEditedImage(data.defaultWorkspaceImage);
    } catch (err: any) {
      console.error('Failed to load system settings:', err);
      const errorMessage = err?.message || err?.response?.data?.message || 'Failed to load system settings';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updates = {
        defaultWorkspaceImage: editedImage,
      };

      const updatedSettings = await require('../services/api').apiService.updateSystemSettings(updates);
      setSettings(updatedSettings);
      setSuccessMessage('Settings saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError(err?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setEditedImage(settings.defaultWorkspaceImage);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const hasChanges = settings && editedImage !== settings.defaultWorkspaceImage;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="text-center py-12">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Error Loading Settings</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={loadSettings}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">System Settings</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Configure platform-wide settings and defaults
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 rounded-md bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Settings Section */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-4">
            Workspace Defaults
          </h3>

          <div className="space-y-4">
            <div>
              <label htmlFor="defaultWorkspaceImage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Workspace Image
              </label>
              <input
                type="text"
                id="defaultWorkspaceImage"
                value={editedImage}
                onChange={(e) => setEditedImage(e.target.value)}
                placeholder="e.g., ghcr.io/andrewhertog/code-server:0.0.1-alpha.2"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                The default container image used when creating new workspaces. This should be a valid container image reference.
              </p>
              {settings && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Last updated: {new Date(settings.updatedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleReset}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Future Settings Section */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-4">
            Additional Settings
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
            <p className="font-medium">Coming soon:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Default resource quotas for new groups</li>
              <li>OAuth provider configuration</li>
              <li>Platform branding and customization</li>
              <li>Email notification settings</li>
              <li>Security policies and session timeouts</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
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
