"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("./config");
const logger_1 = require("./config/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const notFound_1 = require("./middleware/notFound");
logger_1.logger.info('Loading route modules...');
// Route imports
const auth_1 = __importDefault(require("./routes/auth"));
logger_1.logger.info('Auth routes loaded');
const dashboard_1 = __importDefault(require("./routes/dashboard"));
logger_1.logger.info('Dashboard routes loaded');
const groups_1 = __importDefault(require("./routes/groups"));
logger_1.logger.info('Group routes loaded');
const workspaces_1 = __importDefault(require("./routes/workspaces"));
logger_1.logger.info('Workspace routes loaded');
const admin_1 = __importDefault(require("./routes/admin"));
logger_1.logger.info('Admin routes loaded');
const health_1 = __importDefault(require("./routes/health"));
logger_1.logger.info('Health routes loaded');
logger_1.logger.info('All route modules loaded successfully');
logger_1.logger.info('Creating Express application...');
const app = (0, express_1.default)();
logger_1.logger.info('Express app created');
logger_1.logger.info('Configuring Express middleware...');
// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);
logger_1.logger.info('Trust proxy configured');
// Security middleware
app.use((0, helmet_1.default)());
logger_1.logger.info('Helmet security middleware configured');
// CORS configuration
const corsOrigins = process.env.NODE_ENV === 'production'
    ? ['https://vscode-platform.example.com']
    : ['http://localhost:3000', 'http://localhost:5173'];
logger_1.logger.info('CORS origins:', corsOrigins);
app.use((0, cors_1.default)({
    origin: corsOrigins,
    credentials: true,
}));
logger_1.logger.info('CORS middleware configured');
// Compression
app.use((0, compression_1.default)());
logger_1.logger.info('Compression middleware configured');
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
logger_1.logger.info('Body parsing middleware configured');
// Request logging
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('combined', {
        stream: {
            write: (message) => logger_1.logger.info(message.trim())
        }
    }));
    logger_1.logger.info('Morgan request logging configured');
}
else {
    logger_1.logger.info('Morgan request logging disabled (test environment)');
}
// Rate limiting
logger_1.logger.info('Configuring rate limiting:', {
    windowMs: config_1.config.rateLimitWindowMs,
    maxRequests: config_1.config.rateLimitMaxRequests,
});
const limiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimitWindowMs,
    max: config_1.config.rateLimitMaxRequests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
logger_1.logger.info('Rate limiting middleware configured');
logger_1.logger.info('Mounting routes...');
// Health check (no rate limiting)
app.use('/api/health', health_1.default);
logger_1.logger.info('Health routes mounted at /api/health');
// API routes
app.use('/api/auth', auth_1.default);
logger_1.logger.info('Auth routes mounted at /api/auth');
app.use('/api/dashboard', dashboard_1.default);
logger_1.logger.info('Dashboard routes mounted at /api/dashboard');
app.use('/api/groups', groups_1.default);
logger_1.logger.info('Group routes mounted at /api/groups');
app.use('/api/workspaces', workspaces_1.default);
logger_1.logger.info('Workspace routes mounted at /api/workspaces');
app.use('/api/admin', admin_1.default);
logger_1.logger.info('Admin routes mounted at /api/admin');
logger_1.logger.info('All routes mounted successfully');
// 404 handler
app.use(notFound_1.notFound);
logger_1.logger.info('404 handler configured');
// Error handler
app.use(errorHandler_1.errorHandler);
logger_1.logger.info('Error handler configured');
logger_1.logger.info('Express app configuration complete');
exports.default = app;
