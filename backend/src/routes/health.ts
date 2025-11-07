import { Router, Request, Response } from 'express';
import { dynamodbService } from '../services/dynamodbService';
import { kubernetesService } from '../services/kubernetesService';
import { logger } from '../config/logger';

const router = Router();

// Basic health check - no authentication required
router.get('/', async (req: Request, res: Response) => {
  try {
    const healthChecks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        database: 'checking',
        kubernetes: 'checking',
      },
    };

    // Check database health
    try {
      const dbHealthy = await dynamodbService.healthCheck();
      healthChecks.dependencies.database = dbHealthy ? 'healthy' : 'unhealthy';
    } catch (error) {
      healthChecks.dependencies.database = 'unhealthy';
      logger.error('Database health check failed:', error);
    }

    // Check Kubernetes health
    try {
      // Try to list namespaces as a simple K8s health check
      await kubernetesService.listNamespaces();
      healthChecks.dependencies.kubernetes = 'healthy';
    } catch (error) {
      healthChecks.dependencies.kubernetes = 'unhealthy';
      logger.error('Kubernetes health check failed:', error);
    }

    // Determine overall health
    const allHealthy = Object.values(healthChecks.dependencies).every(status => status === 'healthy');
    
    if (!allHealthy) {
      healthChecks.status = 'unhealthy';
      return res.status(503).json(healthChecks);
    }

    res.json(healthChecks);
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Detailed health check with more information
router.get('/detailed', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const healthChecks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {
      database: { status: 'checking', responseTime: undefined as string | undefined },
      kubernetes: { status: 'checking', responseTime: undefined as string | undefined, namespacesCount: undefined as number | undefined },
    },
    performance: {
      database: undefined,
      kubernetes: undefined,
      total: undefined,
    },
  };

  // Database health and performance
  try {
    const dbStart = Date.now();
    const dbHealthy = await dynamodbService.healthCheck();
    const dbTime = Date.now() - dbStart;
    
    healthChecks.dependencies.database = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      responseTime: `${dbTime}ms`,
    };
    healthChecks.performance.database = dbTime;
  } catch (error) {
    healthChecks.dependencies.database = {
      status: 'unhealthy',
      responseTime: undefined,
    };
    logger.error('Detailed database health check failed:', error);
  }

  // Kubernetes health and performance
  try {
    const k8sStart = Date.now();
    const namespaces = await kubernetesService.listNamespaces();
    const k8sTime = Date.now() - k8sStart;
    
    healthChecks.dependencies.kubernetes = {
      status: 'healthy',
      responseTime: `${k8sTime}ms`,
      namespacesCount: namespaces.items.length,
    };
    healthChecks.performance.kubernetes = k8sTime;
  } catch (error) {
    healthChecks.dependencies.kubernetes = {
      status: 'unhealthy',
      responseTime: undefined,
      namespacesCount: undefined,
    };
    logger.error('Detailed Kubernetes health check failed:', error);
  }

  // Overall performance
  healthChecks.performance.total = Date.now() - startTime;

  // Determine overall health
  const dependencyStatuses = Object.values(healthChecks.dependencies).map(dep => dep.status);
  const allHealthy = dependencyStatuses.every(status => status === 'healthy');
  
  if (!allHealthy) {
    healthChecks.status = 'unhealthy';
    return res.status(503).json(healthChecks);
  }

  res.json(healthChecks);
});

// Liveness probe - minimal check for container orchestrators
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe - check if ready to serve traffic
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Quick check of critical dependencies
    const checks = await Promise.allSettled([
      dynamodbService.healthCheck(),
      kubernetesService.listNamespaces(),
    ]);

    const allReady = checks.every(result => result.status === 'fulfilled');
    
    if (allReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? checks : undefined,
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

export default router;
