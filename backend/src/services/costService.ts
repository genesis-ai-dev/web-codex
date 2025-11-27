import { WorkspaceResources, Workspace } from '../types';
import { logger } from '../config/logger';

/**
 * Cost calculation service for workspace resource pricing
 *
 * This service calculates the monthly cost estimate for workspaces based on:
 * 1. Direct compute costs derived from EC2 instance pricing
 * 2. Overhead costs (cluster management, networking, control plane)
 */

// EC2 Instance pricing (hourly rates in USD) - us-east-1 on-demand pricing
// Source: AWS EC2 pricing as of 2024
export interface InstancePricing {
  instanceType: string;
  hourlyRate: number;
  vCPUs: number;
  memoryGiB: number;
}

// Common EC2 instance types used in EKS clusters
// Prices are approximate on-demand rates for us-east-1
const EC2_INSTANCE_PRICING: Record<string, InstancePricing> = {
  // T3 instances (burstable)
  't3.medium': { instanceType: 't3.medium', hourlyRate: 0.0416, vCPUs: 2, memoryGiB: 4 },
  't3.large': { instanceType: 't3.large', hourlyRate: 0.0832, vCPUs: 2, memoryGiB: 8 },
  't3.xlarge': { instanceType: 't3.xlarge', hourlyRate: 0.1664, vCPUs: 4, memoryGiB: 16 },
  't3.2xlarge': { instanceType: 't3.2xlarge', hourlyRate: 0.3328, vCPUs: 8, memoryGiB: 32 },

  // T3a instances (AMD, cheaper burstable)
  't3a.medium': { instanceType: 't3a.medium', hourlyRate: 0.0374, vCPUs: 2, memoryGiB: 4 },
  't3a.large': { instanceType: 't3a.large', hourlyRate: 0.0749, vCPUs: 2, memoryGiB: 8 },
  't3a.xlarge': { instanceType: 't3a.xlarge', hourlyRate: 0.1498, vCPUs: 4, memoryGiB: 16 },
  't3a.2xlarge': { instanceType: 't3a.2xlarge', hourlyRate: 0.2995, vCPUs: 8, memoryGiB: 32 },

  // M5 instances (general purpose)
  'm5.large': { instanceType: 'm5.large', hourlyRate: 0.096, vCPUs: 2, memoryGiB: 8 },
  'm5.xlarge': { instanceType: 'm5.xlarge', hourlyRate: 0.192, vCPUs: 4, memoryGiB: 16 },
  'm5.2xlarge': { instanceType: 'm5.2xlarge', hourlyRate: 0.384, vCPUs: 8, memoryGiB: 32 },
  'm5.4xlarge': { instanceType: 'm5.4xlarge', hourlyRate: 0.768, vCPUs: 16, memoryGiB: 64 },

  // M5a instances (AMD, cheaper general purpose)
  'm5a.large': { instanceType: 'm5a.large', hourlyRate: 0.086, vCPUs: 2, memoryGiB: 8 },
  'm5a.xlarge': { instanceType: 'm5a.xlarge', hourlyRate: 0.172, vCPUs: 4, memoryGiB: 16 },
  'm5a.2xlarge': { instanceType: 'm5a.2xlarge', hourlyRate: 0.344, vCPUs: 8, memoryGiB: 32 },
  'm5a.4xlarge': { instanceType: 'm5a.4xlarge', hourlyRate: 0.688, vCPUs: 16, memoryGiB: 64 },

  // C5 instances (compute optimized)
  'c5.large': { instanceType: 'c5.large', hourlyRate: 0.085, vCPUs: 2, memoryGiB: 4 },
  'c5.xlarge': { instanceType: 'c5.xlarge', hourlyRate: 0.17, vCPUs: 4, memoryGiB: 8 },
  'c5.2xlarge': { instanceType: 'c5.2xlarge', hourlyRate: 0.34, vCPUs: 8, memoryGiB: 16 },
  'c5.4xlarge': { instanceType: 'c5.4xlarge', hourlyRate: 0.68, vCPUs: 16, memoryGiB: 32 },

  // R5 instances (memory optimized)
  'r5.large': { instanceType: 'r5.large', hourlyRate: 0.126, vCPUs: 2, memoryGiB: 16 },
  'r5.xlarge': { instanceType: 'r5.xlarge', hourlyRate: 0.252, vCPUs: 4, memoryGiB: 32 },
  'r5.2xlarge': { instanceType: 'r5.2xlarge', hourlyRate: 0.504, vCPUs: 8, memoryGiB: 64 },
  'r5.4xlarge': { instanceType: 'r5.4xlarge', hourlyRate: 1.008, vCPUs: 16, memoryGiB: 128 },
};

// Pricing configuration (monthly rates in USD)
export interface PricingConfig {
  // Compute costs per unit per month (calculated from instance pricing)
  cpuCorePerMonth: number;      // Cost per CPU core
  memoryGiBPerMonth: number;    // Cost per GiB of memory
  storageGiBPerMonth: number;   // Cost per GiB of storage

  // Overhead allocation percentages
  clusterOverheadRate: number;  // % of compute cost for cluster management (control plane, monitoring, etc.)
  networkOverheadRate: number;  // % of compute cost for networking (ingress, load balancer, etc.)

  // Instance type used for calculation (if from actual cluster)
  instanceType?: string;
  derivedFromInstance?: boolean;
}

// Calculate per-unit pricing from instance type
function calculatePricingFromInstance(instanceType: string): { cpuCorePerMonth: number; memoryGiBPerMonth: number } {
  const pricing = EC2_INSTANCE_PRICING[instanceType.toLowerCase()];

  if (!pricing) {
    logger.warn(`Unknown instance type: ${instanceType}, using default pricing`);
    return {
      cpuCorePerMonth: 30.00,
      memoryGiBPerMonth: 4.00,
    };
  }

  // Convert hourly to monthly (730 hours/month average)
  const monthlyInstanceCost = pricing.hourlyRate * 730;

  // Divide by vCPUs and memory to get per-unit cost
  const cpuCorePerMonth = monthlyInstanceCost / pricing.vCPUs;
  const memoryGiBPerMonth = monthlyInstanceCost / pricing.memoryGiB;

  logger.info(`Calculated pricing from ${instanceType}:`, {
    monthlyInstanceCost: monthlyInstanceCost.toFixed(2),
    cpuCorePerMonth: cpuCorePerMonth.toFixed(2),
    memoryGiBPerMonth: memoryGiBPerMonth.toFixed(2),
  });

  return { cpuCorePerMonth, memoryGiBPerMonth };
}

// Default pricing based on t3a.xlarge (common choice for EKS)
// This is a fallback when instance type is not available
const DEFAULT_INSTANCE_TYPE = 't3a.xlarge';
const defaultInstancePricing = calculatePricingFromInstance(DEFAULT_INSTANCE_TYPE);

const DEFAULT_PRICING: PricingConfig = {
  // Pricing derived from t3a.xlarge instance
  cpuCorePerMonth: defaultInstancePricing.cpuCorePerMonth,
  memoryGiBPerMonth: defaultInstancePricing.memoryGiBPerMonth,
  storageGiBPerMonth: 0.10,      // ~$0.10/GiB/month for EBS gp3 storage

  // Overhead costs (distributed across workspaces)
  clusterOverheadRate: 0.20,     // 20% overhead for cluster management
  networkOverheadRate: 0.10,     // 10% overhead for networking

  instanceType: DEFAULT_INSTANCE_TYPE,
  derivedFromInstance: true,
};

export interface WorkspaceCostBreakdown {
  workspaceId: string;
  workspaceName: string;

  // Direct compute costs
  computeCosts: {
    cpu: {
      cores: number;
      costPerMonth: number;
    };
    memory: {
      gibibytes: number;
      costPerMonth: number;
    };
    storage: {
      gibibytes: number;
      costPerMonth: number;
    };
    totalComputeCost: number;
  };

  // Overhead costs
  overheadCosts: {
    clusterManagement: {
      description: string;
      costPerMonth: number;
    };
    networking: {
      description: string;
      costPerMonth: number;
    };
    totalOverheadCost: number;
  };

  // Total cost
  totalMonthlyCost: number;

  // Usage factor (for running vs stopped workspaces)
  usageFactor: number; // 0-1, where 1 = always running
  actualMonthlyCost: number; // totalMonthlyCost * usageFactor

  // Pricing config used for calculation
  pricingConfig: PricingConfig;
}

/**
 * Parse resource string to numeric value
 * Handles formats like "2", "2.5", "4Gi", "500Mi"
 */
function parseResourceValue(value: string, unit: 'cpu' | 'memory' | 'storage'): number {
  if (!value) return 0;

  // CPU cores (e.g., "2", "2.5", "500m")
  if (unit === 'cpu') {
    if (value.endsWith('m')) {
      // Millicores to cores
      return parseFloat(value.slice(0, -1)) / 1000;
    }
    return parseFloat(value);
  }

  // Memory and storage (e.g., "4Gi", "500Mi", "20Gi")
  if (unit === 'memory' || unit === 'storage') {
    if (value.endsWith('Gi')) {
      return parseFloat(value.slice(0, -2));
    } else if (value.endsWith('Mi')) {
      // Convert MiB to GiB
      return parseFloat(value.slice(0, -2)) / 1024;
    } else if (value.endsWith('G')) {
      return parseFloat(value.slice(0, -1));
    } else if (value.endsWith('M')) {
      return parseFloat(value.slice(0, -1)) / 1024;
    }
    // Assume GiB if no unit
    return parseFloat(value);
  }

  return 0;
}

/**
 * Calculate workspace cost breakdown
 */
export function calculateWorkspaceCost(
  workspace: Workspace,
  pricingConfig: PricingConfig = DEFAULT_PRICING,
  usageFactor: number = 1.0 // 1.0 = always running, 0.5 = running half the time, etc.
): WorkspaceCostBreakdown {
  const { resources } = workspace;

  // Parse resource values
  const cpuCores = parseResourceValue(resources.cpu, 'cpu');
  const memoryGiB = parseResourceValue(resources.memory, 'memory');
  const storageGiB = parseResourceValue(resources.storage, 'storage');

  // Calculate direct compute costs
  const cpuCost = cpuCores * pricingConfig.cpuCorePerMonth;
  const memoryCost = memoryGiB * pricingConfig.memoryGiBPerMonth;
  const storageCost = storageGiB * pricingConfig.storageGiBPerMonth;
  const totalComputeCost = cpuCost + memoryCost + storageCost;

  // Calculate overhead costs (based on compute cost)
  const clusterOverheadCost = totalComputeCost * pricingConfig.clusterOverheadRate;
  const networkOverheadCost = totalComputeCost * pricingConfig.networkOverheadRate;
  const totalOverheadCost = clusterOverheadCost + networkOverheadCost;

  // Total monthly cost
  const totalMonthlyCost = totalComputeCost + totalOverheadCost;
  const actualMonthlyCost = totalMonthlyCost * usageFactor;

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,

    computeCosts: {
      cpu: {
        cores: cpuCores,
        costPerMonth: cpuCost,
      },
      memory: {
        gibibytes: memoryGiB,
        costPerMonth: memoryCost,
      },
      storage: {
        gibibytes: storageGiB,
        costPerMonth: storageCost,
      },
      totalComputeCost,
    },

    overheadCosts: {
      clusterManagement: {
        description: 'Control plane, monitoring, logging, and cluster operations',
        costPerMonth: clusterOverheadCost,
      },
      networking: {
        description: 'Ingress controller, load balancer, and network egress',
        costPerMonth: networkOverheadCost,
      },
      totalOverheadCost,
    },

    totalMonthlyCost,
    usageFactor,
    actualMonthlyCost,

    pricingConfig,
  };
}

/**
 * Calculate usage factor based on workspace status and uptime
 * This is a simple implementation - in production, you'd track actual uptime
 */
export function estimateUsageFactor(workspace: Workspace): number {
  // If workspace is currently running, assume it runs most of the time
  if (workspace.status === 'running') {
    return 0.75; // Assume 75% uptime (18 hours/day or ~22 days/month)
  }

  // If stopped or other states, assume lower usage
  if (workspace.status === 'stopped') {
    return 0.0; // No compute cost when stopped (storage cost still applies)
  }

  // Default for pending/starting/stopping states
  return 0.1;
}

/**
 * Calculate cost with estimated usage factor
 */
export function calculateWorkspaceCostWithUsage(
  workspace: Workspace,
  pricingConfig: PricingConfig = DEFAULT_PRICING
): WorkspaceCostBreakdown {
  const usageFactor = estimateUsageFactor(workspace);
  return calculateWorkspaceCost(workspace, pricingConfig, usageFactor);
}

/**
 * Get default pricing configuration
 */
export function getDefaultPricing(): PricingConfig {
  return { ...DEFAULT_PRICING };
}

/**
 * Load pricing configuration from environment variables or instance type
 */
export function loadPricingConfig(instanceType?: string): PricingConfig {
  // If instance type is provided, calculate pricing from it
  if (instanceType) {
    const instancePricing = calculatePricingFromInstance(instanceType);
    return {
      cpuCorePerMonth: instancePricing.cpuCorePerMonth,
      memoryGiBPerMonth: instancePricing.memoryGiBPerMonth,
      storageGiBPerMonth: parseFloat(process.env.PRICING_STORAGE_GIB_PER_MONTH || String(DEFAULT_PRICING.storageGiBPerMonth)),
      clusterOverheadRate: parseFloat(process.env.PRICING_CLUSTER_OVERHEAD_RATE || String(DEFAULT_PRICING.clusterOverheadRate)),
      networkOverheadRate: parseFloat(process.env.PRICING_NETWORK_OVERHEAD_RATE || String(DEFAULT_PRICING.networkOverheadRate)),
      instanceType,
      derivedFromInstance: true,
    };
  }

  // Check if explicit pricing is set via environment variables
  const hasExplicitPricing = process.env.PRICING_CPU_CORE_PER_MONTH || process.env.PRICING_MEMORY_GIB_PER_MONTH;

  if (hasExplicitPricing) {
    return {
      cpuCorePerMonth: parseFloat(process.env.PRICING_CPU_CORE_PER_MONTH || String(DEFAULT_PRICING.cpuCorePerMonth)),
      memoryGiBPerMonth: parseFloat(process.env.PRICING_MEMORY_GIB_PER_MONTH || String(DEFAULT_PRICING.memoryGiBPerMonth)),
      storageGiBPerMonth: parseFloat(process.env.PRICING_STORAGE_GIB_PER_MONTH || String(DEFAULT_PRICING.storageGiBPerMonth)),
      clusterOverheadRate: parseFloat(process.env.PRICING_CLUSTER_OVERHEAD_RATE || String(DEFAULT_PRICING.clusterOverheadRate)),
      networkOverheadRate: parseFloat(process.env.PRICING_NETWORK_OVERHEAD_RATE || String(DEFAULT_PRICING.networkOverheadRate)),
      derivedFromInstance: false,
    };
  }

  // Use default pricing (based on t3a.xlarge)
  return { ...DEFAULT_PRICING };
}

/**
 * Get list of supported instance types
 */
export function getSupportedInstanceTypes(): InstancePricing[] {
  return Object.values(EC2_INSTANCE_PRICING);
}

export const costService = {
  calculateWorkspaceCost,
  calculateWorkspaceCostWithUsage,
  estimateUsageFactor,
  getDefaultPricing,
  loadPricingConfig,
  parseResourceValue,
  getSupportedInstanceTypes,
  calculatePricingFromInstance,
};
