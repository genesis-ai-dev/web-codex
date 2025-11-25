import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceDetailsPage } from './pages/WorkspaceDetailsPage';
import { AdminPage } from './pages/AdminPage';
import { ProfilePage } from './pages/ProfilePage';
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
    <ThemeProvider>
      <AuthProvider config={authConfig}>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/workspaces" element={<ProtectedRoute><WorkspacesPage /></ProtectedRoute>} />
              <Route path="/workspaces/:workspaceId" element={<ProtectedRoute><WorkspaceDetailsPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Protected route wrapper
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !user?.isAdmin) {
    return <Navigate to="/" replace />;
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="spinner w-8 h-8 mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Completing sign in...
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Please wait while we authenticate you.
        </p>
      </div>
    </div>
  );
};

export default App;
