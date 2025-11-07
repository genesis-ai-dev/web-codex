import 'dotenv/config';
import app from './app';
import { config } from './config';
import { logger } from './config/logger';

const port = config.port;

app.listen(port, () => {
  logger.info(`VSCode Platform API server running on port ${port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
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
