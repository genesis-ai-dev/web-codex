import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './Card';
import { WorkspaceCostBreakdown as CostBreakdown } from '../types';
import { apiService } from '../services/api';

interface WorkspaceCostBreakdownProps {
  workspaceId: string;
  workspaceName?: string;
}

export const WorkspaceCostBreakdown: React.FC<WorkspaceCostBreakdownProps> = ({
  workspaceId,
  workspaceName,
}) => {
  const [costData, setCostData] = useState<CostBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCostBreakdown();
  }, [workspaceId]);

  const loadCostBreakdown = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiService.getWorkspaceCostBreakdown(workspaceId);
      setCostData(data);
    } catch (err: any) {
      console.error('Failed to load cost breakdown:', err);
      setError(err?.message || 'Failed to load cost breakdown');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (decimal: number): string => {
    return `${(decimal * 100).toFixed(0)}%`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="spinner w-8 h-8 mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading cost breakdown...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Error</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <button
              onClick={loadCostBreakdown}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Try Again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!costData) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header Card - Total Cost */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Estimated Monthly Cost
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-indigo-900 dark:text-indigo-100">
                  {formatCurrency(costData.actualMonthlyCost)}
                </span>
                {costData.usageFactor < 1 && (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    ({formatPercentage(costData.usageFactor)} usage)
                  </span>
                )}
              </div>
              {costData.usageFactor < 1 && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  Full-time cost: {formatCurrency(costData.totalMonthlyCost)}
                </p>
              )}
            </div>
            <div className="text-right">
              <svg className="w-16 h-16 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compute Costs Breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            Direct Compute Costs
          </h3>

          <div className="space-y-4">
            {/* CPU */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">CPU</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {costData.computeCosts.cpu.cores} cores @ {formatCurrency(costData.pricingConfig.cpuCorePerMonth)}/core
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(costData.computeCosts.cpu.costPerMonth)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">per month</p>
              </div>
            </div>

            {/* Memory */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Memory</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {costData.computeCosts.memory.gibibytes.toFixed(2)} GiB @ {formatCurrency(costData.pricingConfig.memoryGiBPerMonth)}/GiB
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(costData.computeCosts.memory.costPerMonth)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">per month</p>
              </div>
            </div>

            {/* Storage */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Storage</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {costData.computeCosts.storage.gibibytes.toFixed(2)} GiB @ {formatCurrency(costData.pricingConfig.storageGiBPerMonth)}/GiB
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(costData.computeCosts.storage.costPerMonth)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">per month</p>
              </div>
            </div>

            {/* Total Compute */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">Total Compute Cost</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(costData.computeCosts.totalComputeCost)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overhead Costs Breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Infrastructure Overhead
          </h3>

          <div className="space-y-4">
            {/* Cluster Management */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Cluster Management</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {costData.overheadCosts.clusterManagement.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(costData.overheadCosts.clusterManagement.costPerMonth)}
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatPercentage(costData.pricingConfig.clusterOverheadRate)} of compute cost
              </div>
            </div>

            {/* Networking */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Networking</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {costData.overheadCosts.networking.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(costData.overheadCosts.networking.costPerMonth)}
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatPercentage(costData.pricingConfig.networkOverheadRate)} of compute cost
              </div>
            </div>

            {/* Total Overhead */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">Total Overhead Cost</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(costData.overheadCosts.totalOverheadCost)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card className="bg-gray-50 dark:bg-gray-800">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Cost Summary</h3>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Direct Compute</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(costData.computeCosts.totalComputeCost)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Infrastructure Overhead</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(costData.overheadCosts.totalOverheadCost)}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="font-medium text-gray-900 dark:text-gray-100">Total (100% uptime)</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(costData.totalMonthlyCost)}
              </span>
            </div>
            {costData.usageFactor < 1 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Usage Factor ({formatPercentage(costData.usageFactor)})
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    × {costData.usageFactor.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-base pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-semibold text-indigo-900 dark:text-indigo-100">Estimated Actual Cost</span>
                  <span className="font-bold text-indigo-900 dark:text-indigo-100">
                    {formatCurrency(costData.actualMonthlyCost)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> These are estimated costs based on allocated resources and usage patterns.
              Actual costs may vary based on cloud provider pricing, reserved instances, and actual runtime.
              Storage costs apply even when the workspace is stopped.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
