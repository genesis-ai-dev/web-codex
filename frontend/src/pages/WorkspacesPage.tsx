import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Input, TextArea, Select } from '../components/Input';
import { Progress } from '../components/Progress';
import { Workspace, Group, CreateWorkspaceRequest } from '../types';
import { apiService } from '../services/api';
import { formatRelativeTime, formatCPU, formatMemory, getErrorMessage } from '../utils';

export const WorkspacesPage: React.FC = () => {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [workspacesData, groupsData] = await Promise.all([
        apiService.getWorkspaces(),
        apiService.getGroups()
      ]);
      
      setWorkspaces(workspacesData);
      setGroups(groupsData);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkspace = async (workspace: CreateWorkspaceRequest) => {
    try {
      const newWorkspace = await apiService.createWorkspace(workspace);
      setWorkspaces(prev => [newWorkspace, ...prev]);
      setShowCreateModal(false);
    } catch (error) {
      throw error;
    }
  };

  const handleWorkspaceAction = async (workspaceId: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    try {
      if (action === 'delete') {
        await apiService.deleteWorkspace(workspaceId);
        setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
      } else {
        const updatedWorkspace = await apiService.performWorkspaceAction({ 
          type: action, 
          workspaceId 
        });
        setWorkspaces(prev => 
          prev.map(w => w.id === workspaceId ? updatedWorkspace : w)
        );
      }
    } catch (error) {
      console.error(`Failed to ${action} workspace:`, error);
      // You could show a toast notification here
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="spinner w-8 h-8 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading workspaces...</p>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Failed to load workspaces
              </h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={loadData}>
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
            <p className="text-gray-600 mt-2">
              Manage your development environments and collaborate with your team.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Workspace
          </Button>
        </div>

        {/* Workspaces grid */}
        {workspaces.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                onAction={handleWorkspaceAction}
                onNavigate={() => navigate(`/workspaces/${workspace.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No workspaces yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first workspace to start developing in the browser with full VSCode functionality.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Your First Workspace
            </Button>
          </div>
        )}

        {/* Create workspace modal */}
        <CreateWorkspaceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateWorkspace}
          groups={groups}
        />
      </div>
    </Layout>
  );
};

interface WorkspaceCardProps {
  workspace: Workspace;
  onAction: (workspaceId: string, action: 'start' | 'stop' | 'restart' | 'delete') => void;
  onNavigate: () => void;
}

const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace, onAction, onNavigate }) => {
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (action === 'delete') {
      // eslint-disable-next-line no-restricted-globals
      if (!confirm(`Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`)) {
        return;
      }
    }
    
    setIsActionLoading(action);
    try {
      await onAction(workspace.id, action);
    } finally {
      setIsActionLoading(null);
    }
  };

  const openWorkspace = () => {
    if (workspace.url && workspace.status === 'running') {
      window.open(workspace.url, '_blank');
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 cursor-pointer" onClick={onNavigate}>
            <CardTitle className="text-lg hover:text-primary-600 transition-colors">{workspace.name}</CardTitle>
            {workspace.description && (
              <p className="text-sm text-gray-600 mt-1">{workspace.description}</p>
            )}
          </div>
          <StatusBadge status={workspace.status} />
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Group info */}
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {workspace.groupName}
          </div>

          {/* Resource info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">CPU:</span>
              <span className="ml-2 text-gray-600">{formatCPU(workspace.resources.cpu)}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Memory:</span>
              <span className="ml-2 text-gray-600">{formatMemory(workspace.resources.memory)}</span>
            </div>
          </div>

          {/* Resource usage (if available) */}
          {workspace.usage && (
            <div className="space-y-2">
              <Progress
                label="CPU Usage"
                value={workspace.usage.cpu.percentage}
                size="sm"
                showValue
              />
              <Progress
                label="Memory Usage"
                value={workspace.usage.memory.percentage}
                size="sm"
                showValue
              />
            </div>
          )}

          {/* Last accessed */}
          <div className="text-xs text-gray-500">
            Last accessed: {workspace.lastAccessedAt 
              ? formatRelativeTime(workspace.lastAccessedAt)
              : 'Never'
            }
          </div>

          {/* Actions */}
          <div className="flex space-x-2 pt-4 border-t border-gray-100">
            {workspace.status === 'running' ? (
              <>
                <Button
                  size="sm"
                  onClick={openWorkspace}
                  className="flex-1"
                >
                  Open VSCode
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAction('stop')}
                  isLoading={isActionLoading === 'stop'}
                >
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => handleAction('start')}
                isLoading={isActionLoading === 'start'}
                className="flex-1"
              >
                Start
              </Button>
            )}
            
            <DropdownMenu
              trigger={
                <Button size="sm" variant="ghost">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              }
              items={[
                {
                  label: 'Restart',
                  onClick: () => handleAction('restart'),
                  loading: isActionLoading === 'restart',
                },
                {
                  label: 'Delete',
                  onClick: () => handleAction('delete'),
                  loading: isActionLoading === 'delete',
                  destructive: true,
                },
              ]}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (workspace: CreateWorkspaceRequest) => Promise<void>;
  groups: Group[];
}

const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  groups,
}) => {
  const [formData, setFormData] = useState<CreateWorkspaceRequest>({
    name: '',
    description: '',
    groupId: '',
    image: 'ghcr.io/genesis-ai-dev/codex:master',
    resources: {
      cpu: '2',
      memory: '4Gi',
      storage: '20Gi',
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Workspace name is required');
      return;
    }
    
    if (!formData.groupId) {
      setError('Please select a group');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(formData);
      // Reset form
      setFormData({
        name: '',
        description: '',
        groupId: '',
        image: 'ghcr.io/genesis-ai-dev/codex:master',
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '20Gi',
        },
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupOptions = groups.map(group => ({
    value: group.id,
    label: group.displayName,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Workspace"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-error-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-error-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-error-800">Error</h3>
                <div className="mt-1 text-sm text-error-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        <Input
          label="Workspace Name"
          placeholder="e.g. My Development Environment"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
        />

        <TextArea
          label="Description (optional)"
          placeholder="Brief description of this workspace..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />

        <Select
          label="Group"
          placeholder="Select a group..."
          options={groupOptions}
          value={formData.groupId}
          onChange={(e) => setFormData(prev => ({ ...prev, groupId: e.target.value }))}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="CPU"
            placeholder="2"
            value={formData.resources?.cpu || ''}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              resources: { ...prev.resources!, cpu: e.target.value }
            }))}
          />
          
          <Input
            label="Memory"
            placeholder="4Gi"
            value={formData.resources?.memory || ''}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              resources: { ...prev.resources!, memory: e.target.value }
            }))}
          />
          
          <Input
            label="Storage"
            placeholder="20Gi"
            value={formData.resources?.storage || ''}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              resources: { ...prev.resources!, storage: e.target.value }
            }))}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Workspace
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Simplified dropdown menu component
interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: Array<{
    label: string;
    onClick: () => void;
    loading?: boolean;
    destructive?: boolean;
  }>;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, items }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
            {items.map((item, index) => (
              <button
                key={index}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 first:rounded-t-md last:rounded-b-md ${
                  item.destructive ? 'text-error-600 hover:bg-error-50' : 'text-gray-700'
                }`}
                onClick={() => {
                  item.onClick();
                  setIsOpen(false);
                }}
                disabled={item.loading}
              >
                {item.loading ? (
                  <div className="flex items-center">
                    <div className="spinner w-4 h-4 mr-2"></div>
                    {item.label}
                  </div>
                ) : (
                  item.label
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
