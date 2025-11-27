import { WorkspaceResources, Workspace } from '../types';
import { logger } from '../config/logger';

/**
 * Cost calculation service for workspace resource pricing
 *
 * This service calculates the monthly cost estimate for workspaces based on:
 * 1. Direct compute costs (CPU, memory, storage)
 * 2. Overhead costs (cluster management, networking, control plane)
 */

// Pricing configuration (monthly rates in USD)
export interface PricingConfig {
  // Compute costs per unit per month
  cpuCorePerMonth: number;      // Cost per CPU core
  memoryGiBPerMonth: number;    // Cost per GiB of memory
  storageGiBPerMonth: number;   // Cost per GiB of storage

  // Overhead allocation percentages
  clusterOverheadRate: number;  // % of compute cost for cluster management (control plane, monitoring, etc.)
  networkOverheadRate: number;  // % of compute cost for networking (ingress, load balancer, etc.)
}

// Default pricing based on typical cloud provider costs
// These are rough estimates and should be adjusted based on actual infrastructure costs
const DEFAULT_PRICING: PricingConfig = {
  // Typical cloud pricing (average of major providers)
  cpuCorePerMonth: 30.00,        // ~$30/core/month
  memoryGiBPerMonth: 4.00,       // ~$4/GiB/month
  storageGiBPerMonth: 0.10,      // ~$0.10/GiB/month for persistent storage

  // Overhead costs (distributed across workspaces)
  clusterOverheadRate: 0.20,     // 20% overhead for cluster management
  networkOverheadRate: 0.10,     // 10% overhead for networking
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
 * Update pricing configuration from environment variables or settings
 */
export function loadPricingConfig(): PricingConfig {
  return {
    cpuCorePerMonth: parseFloat(process.env.PRICING_CPU_CORE_PER_MONTH || String(DEFAULT_PRICING.cpuCorePerMonth)),
    memoryGiBPerMonth: parseFloat(process.env.PRICING_MEMORY_GIB_PER_MONTH || String(DEFAULT_PRICING.memoryGiBPerMonth)),
    storageGiBPerMonth: parseFloat(process.env.PRICING_STORAGE_GIB_PER_MONTH || String(DEFAULT_PRICING.storageGiBPerMonth)),
    clusterOverheadRate: parseFloat(process.env.PRICING_CLUSTER_OVERHEAD_RATE || String(DEFAULT_PRICING.clusterOverheadRate)),
    networkOverheadRate: parseFloat(process.env.PRICING_NETWORK_OVERHEAD_RATE || String(DEFAULT_PRICING.networkOverheadRate)),
  };
}

export const costService = {
  calculateWorkspaceCost,
  calculateWorkspaceCostWithUsage,
  estimateUsageFactor,
  getDefaultPricing,
  loadPricingConfig,
  parseResourceValue,
};
