import 'dotenv/config';
import http from 'http';
import app from './app';
import { config } from './config';
import { logger } from './config/logger';
import { setupWebSocketServer } from './websocket';

// Log startup immediately
logger.info('=== Application Starting ===');
logger.info(`Process ID: ${process.pid}`);
logger.info(`Node Version: ${process.version}`);
logger.info(`Platform: ${process.platform}`);
logger.info(`Current Working Directory: ${process.cwd()}`);

// Log configuration (without sensitive data)
logger.info('Configuration loaded:', {
  port: config.port,
  nodeEnv: config.nodeEnv,
  logLevel: config.logLevel,
  awsRegion: config.awsRegion,
  dynamodbRegion: config.dynamodbRegion,
  kubernetesNamespacePrefix: config.kubernetesNamespacePrefix,
});

// Check required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'AWS_REGION',
  'DYNAMODB_REGION',
  'DYNAMODB_TABLE_PREFIX',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables:', missingEnvVars);
  logger.error('Application cannot start without required configuration');
  process.exit(1);
}

logger.info('All required environment variables present');
logger.info('Attempting to start HTTP server...');

const port = config.port;

try {
  // Create HTTP server
  const server = http.createServer(app);

  // Setup WebSocket server
  setupWebSocketServer(server);
  logger.info('WebSocket server configured');

  // Start listening
  server.listen(port, () => {
    logger.info('=== Server Started Successfully ===');
    logger.info(`VSCode Platform API server running on port ${port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Health check available at: http://localhost:${port}/api/health/live`);
    logger.info(`WebSocket endpoint available at: ws://localhost:${port}/api/admin/workspaces/:workspaceId/exec`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error('Server failed to start:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    process.exit(1);
  });
} catch (error) {
  logger.error('Fatal error during server startup:', error);
  process.exit(1);
}

// Uncaught exception handler - MUST be registered early
process.on('uncaughtException', (error: Error) => {
  logger.error('=== UNCAUGHT EXCEPTION ===', {
    error: error.message,
    stack: error.stack,
    name: error.name,
  });
  // Give logger time to flush before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('=== UNHANDLED PROMISE REJECTION ===', {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name,
    } : reason,
    promise: String(promise),
  });
  // Give logger time to flush before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Warning handler for potential issues
process.on('warning', (warning: Error) => {
  logger.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
