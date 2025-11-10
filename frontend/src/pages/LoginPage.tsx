import React, { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

export const LoginPage: React.FC = () => {
  const { login, isLoading, isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for auth callback
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    
    if (error) {
      setError('Authentication failed. Please try again.');
    } else if (code) {
      // Handle auth callback
      handleAuthCallback(code);
    }
  }, [searchParams]);

  const handleAuthCallback = async (code: string) => {
    try {
      // The auth service will handle the callback
      await login();
    } catch (error) {
      console.error('Auth callback failed:', error);
      setError('Authentication failed. Please try again.');
    }
  };

  const handleLogin = async () => {
    try {
      setError(null);
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed. Please try again.');
    }
  };

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-600 rounded-xl flex items-center justify-center">
            <svg className="h-10 w-10 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            VSCode Platform
          </h2>
          <p className="mt-2 text-sm text-gray-600 max-w-sm mx-auto text-balance">
            Sign in to access your development workspaces and collaborate with your team.
          </p>
        </div>

        {/* Login form */}
        <Card className="mt-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 text-center">
                Sign in to your account
              </h3>
              <p className="mt-2 text-sm text-gray-600 text-center">
                Choose your authentication method below
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-error-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-error-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-error-800">
                      Authentication Error
                    </h3>
                    <div className="mt-1 text-sm text-error-700">
                      {error}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* AWS Cognito Login */}
              <Button
                onClick={handleLogin}
                isLoading={isLoading}
                className="w-full"
                size="lg"
                leftIcon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.527 1.955c.665.086 1.319.237 1.948.448a.5.5 0 01.32.624l-.428 1.542a.5.5 0 01-.624.32 8.003 8.003 0 00-2.486-.368c-4.418 0-8 3.582-8 8s3.582 8 8 8c1.748 0 3.362-.56 4.676-1.509a.5.5 0 01.665.748A9.978 9.978 0 0112 22C6.477 22 2 17.523 2 12S6.477 2 12 2c.532 0 1.055.044 1.562.129a.5.5 0 01.417.583l-.452 1.243z"/>
                  </svg>
                }
              >
                {isLoading ? 'Signing in...' : 'Continue with AWS Cognito'}
              </Button>

              {/* Google OAuth Login */}
              {/* <Button
                onClick={handleLogin}
                variant="secondary"
                className="w-full"
                size="lg"
                leftIcon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                }
              >
                Continue with Google
              </Button> */}
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our{' '}
                <a href="/terms" className="font-medium text-primary-600 hover:text-primary-500">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" className="font-medium text-primary-600 hover:text-primary-500">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        </Card>

        {/* Features */}
        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">Platform Features</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="flex items-center">
              <svg className="h-4 w-4 text-success-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Browser-based VSCode
            </div>
            <div className="flex items-center">
              <svg className="h-4 w-4 text-success-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Multi-tenant isolation
            </div>
            <div className="flex items-center">
              <svg className="h-4 w-4 text-success-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Persistent workspaces
            </div>
            <div className="flex items-center">
              <svg className="h-4 w-4 text-success-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Team collaboration
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
