import { ResourceTier, WorkspaceResources } from '../types';

/**
 * Default resource configurations by tier
 * - No CPU limits (only requests)
 * - Memory limits equal memory requests
 */
export const RESOURCE_TIER_CONFIGS: Record<ResourceTier, WorkspaceResources> = {
  [ResourceTier.SINGLE_USER]: {
    cpu: '1',
    memory: '2Gi',
    storage: '20Gi',
  },
  [ResourceTier.SMALL_TEAM]: {
    cpu: '2',
    memory: '4Gi',
    storage: '20Gi',
  },
  [ResourceTier.ENTERPRISE]: {
    cpu: '2', // Placeholder - users should contact us
    memory: '4Gi', // Placeholder - users should contact us
    storage: '20Gi', // Placeholder - users should contact us
  },
};

/**
 * Get resource configuration for a given tier
 */
export function getResourcesForTier(tier: ResourceTier): WorkspaceResources {
  return { ...RESOURCE_TIER_CONFIGS[tier] };
}

/**
 * Tier descriptions for UI display
 */
export const TIER_DESCRIPTIONS: Record<ResourceTier, { name: string; description: string; users: string }> = {
  [ResourceTier.SINGLE_USER]: {
    name: 'Single User',
    description: 'Perfect for individual developers',
    users: '1 concurrent user',
  },
  [ResourceTier.SMALL_TEAM]: {
    name: 'Small Team',
    description: 'For small collaborative teams',
    users: '2-4 concurrent users',
  },
  [ResourceTier.ENTERPRISE]: {
    name: 'Enterprise',
    description: 'For larger teams - contact us for custom pricing',
    users: '5+ concurrent users',
  },
};
