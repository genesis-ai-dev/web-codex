import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

logger.info('Loading route modules...');

// Route imports
import authRoutes from './routes/auth';
logger.info('Auth routes loaded');

import dashboardRoutes from './routes/dashboard';
logger.info('Dashboard routes loaded');

import groupRoutes from './routes/groups';
logger.info('Group routes loaded');

import workspaceRoutes from './routes/workspaces';
logger.info('Workspace routes loaded');

import adminRoutes from './routes/admin';
logger.info('Admin routes loaded');

import healthRoutes from './routes/health';
logger.info('Health routes loaded');

logger.info('All route modules loaded successfully');
logger.info('Creating Express application...');

const app = express();
logger.info('Express app created');

logger.info('Configuring Express middleware...');

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);
logger.info('Trust proxy configured');

// Security middleware
app.use(helmet());
logger.info('Helmet security middleware configured');

// CORS configuration
const corsOrigins = process.env.NODE_ENV === 'production'
  ? ['https://codex-platform.example.com']
  : ['http://localhost:3000', 'http://localhost:5173'];
logger.info('CORS origins:', corsOrigins);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
logger.info('CORS middleware configured');

// Compression
app.use(compression());
logger.info('Compression middleware configured');

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
logger.info('Body parsing middleware configured');

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim())
    }
  }));
  logger.info('Morgan request logging configured');
} else {
  logger.info('Morgan request logging disabled (test environment)');
}

// Rate limiting
logger.info('Configuring rate limiting:', {
  windowMs: config.rateLimitWindowMs,
  maxRequests: config.rateLimitMaxRequests,
});

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
logger.info('Rate limiting middleware configured');

logger.info('Mounting routes...');

// Health check (no rate limiting)
app.use('/api/health', healthRoutes);
logger.info('Health routes mounted at /api/health');

// API routes
app.use('/api/auth', authRoutes);
logger.info('Auth routes mounted at /api/auth');

app.use('/api/dashboard', dashboardRoutes);
logger.info('Dashboard routes mounted at /api/dashboard');

app.use('/api/groups', groupRoutes);
logger.info('Group routes mounted at /api/groups');

app.use('/api/workspaces', workspaceRoutes);
logger.info('Workspace routes mounted at /api/workspaces');

app.use('/api/admin', adminRoutes);
logger.info('Admin routes mounted at /api/admin');

logger.info('All routes mounted successfully');

// 404 handler
app.use(notFound);
logger.info('404 handler configured');

// Error handler
app.use(errorHandler);
logger.info('Error handler configured');

logger.info('Express app configuration complete');

export default app;
