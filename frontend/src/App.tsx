import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceDetailsPage } from './pages/WorkspaceDetailsPage';
import { GroupsPage } from './pages/GroupsPage';
import { AuthConfig } from './types';
import './styles/index.css';

// Import useAuth hook here to avoid circular imports
import { useAuth } from './contexts/AuthContext';

// Auth configuration - in a real app, this would come from environment variables
const authConfig: AuthConfig = {
  authority: process.env.REACT_APP_AUTH_AUTHORITY || 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example',
  clientId: process.env.REACT_APP_AUTH_CLIENT_ID || 'your-client-id',
  redirectUri: window.location.origin + '/auth/callback',
  logoutUri: window.location.origin,
  scope: 'aws.cognito.signin.user.admin email openid profile',
  cognitoDomain: process.env.REACT_APP_COGNITO_DOMAIN || 'your-domain.auth.us-east-1.amazoncognito.com',
};

function App() {
  return (
    <AuthProvider config={authConfig}>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/workspaces" element={<ProtectedRoute><WorkspacesPage /></ProtectedRoute>} />
            <Route path="/workspaces/:workspaceId" element={<ProtectedRoute><WorkspaceDetailsPage /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

// Protected route wrapper
interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Auth callback handler
const AuthCallbackPage: React.FC = () => {
  const { isLoading, isAuthenticated } = useAuth();

  React.useEffect(() => {
    // Once authenticated, redirect to home
    if (!isLoading && isAuthenticated) {
      window.location.href = '/';
    }
  }, [isLoading, isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="spinner w-8 h-8 mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">
          Completing sign in...
        </h2>
        <p className="text-gray-500">
          Please wait while we authenticate you.
        </p>
      </div>
    </div>
  );
};

// Placeholder components for routes not yet implemented
const AdminPlaceholder: React.FC = () => {
  const { Layout } = require('./components/Layout');
  const { Card, CardContent } = require('./components/Card');
  const { Button } = require('./components/Button');

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Admin Panel
              </h3>
              <p className="text-gray-600 mb-4">
                Administrative features including user management, audit logs, and system monitoring are coming soon.
              </p>
              <Button>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default App;
