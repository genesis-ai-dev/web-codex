"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const logger_1 = require("./config/logger");
const websocket_1 = require("./websocket");
// Log startup immediately
logger_1.logger.info('=== Application Starting ===');
logger_1.logger.info(`Process ID: ${process.pid}`);
logger_1.logger.info(`Node Version: ${process.version}`);
logger_1.logger.info(`Platform: ${process.platform}`);
logger_1.logger.info(`Current Working Directory: ${process.cwd()}`);
// Log configuration (without sensitive data)
logger_1.logger.info('Configuration loaded:', {
    port: config_1.config.port,
    nodeEnv: config_1.config.nodeEnv,
    logLevel: config_1.config.logLevel,
    awsRegion: config_1.config.awsRegion,
    dynamodbRegion: config_1.config.dynamodbRegion,
    redisUrl: config_1.config.redisUrl?.replace(/:[^:]*@/, ':***@'), // Hide password if present
    kubernetesNamespacePrefix: config_1.config.kubernetesNamespacePrefix,
});
// Check required environment variables
const requiredEnvVars = [
    'JWT_SECRET',
    'AWS_REGION',
    'DYNAMODB_REGION',
    'DYNAMODB_TABLE_PREFIX',
    'REDIS_URL',
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    logger_1.logger.error('Missing required environment variables:', missingEnvVars);
    logger_1.logger.error('Application cannot start without required configuration');
    process.exit(1);
}
logger_1.logger.info('All required environment variables present');
logger_1.logger.info('Attempting to start HTTP server...');
const port = config_1.config.port;
try {
    // Create HTTP server
    const server = http_1.default.createServer(app_1.default);
    // Setup WebSocket server
    (0, websocket_1.setupWebSocketServer)(server);
    logger_1.logger.info('WebSocket server configured');
    // Start listening
    server.listen(port, () => {
        logger_1.logger.info('=== Server Started Successfully ===');
        logger_1.logger.info(`VSCode Platform API server running on port ${port}`);
        logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
        logger_1.logger.info(`Health check available at: http://localhost:${port}/api/health/live`);
        logger_1.logger.info(`WebSocket endpoint available at: ws://localhost:${port}/api/admin/workspaces/:workspaceId/exec`);
    });
    server.on('error', (error) => {
        logger_1.logger.error('Server failed to start:', {
            error: error.message,
            code: error.code,
            stack: error.stack,
        });
        process.exit(1);
    });
}
catch (error) {
    logger_1.logger.error('Fatal error during server startup:', error);
    process.exit(1);
}
// Uncaught exception handler - MUST be registered early
process.on('uncaughtException', (error) => {
    logger_1.logger.error('=== UNCAUGHT EXCEPTION ===', {
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
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('=== UNHANDLED PROMISE REJECTION ===', {
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
process.on('warning', (warning) => {
    logger_1.logger.warn('Process warning:', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
    });
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT signal received: closing HTTP server');
    process.exit(0);
});
