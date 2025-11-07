import React from 'react';
import { cn } from 'utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  showValue?: boolean;
  label?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ 
    className, 
    value, 
    max = 100, 
    size = 'md', 
    variant = 'default',
    showValue = false,
    label,
    ...props 
  }, ref) => {
    const percentage = Math.min((value / max) * 100, 100);
    
    const heights = {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    };

    const getVariant = () => {
      if (variant !== 'default') return variant;
      
      // Auto-determine variant based on percentage
      if (percentage >= 90) return 'error';
      if (percentage >= 75) return 'warning';
      return 'success';
    };

    const actualVariant = getVariant();

    const variants = {
      default: 'bg-primary-500',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      error: 'bg-error-500',
    };

    return (
      <div className="space-y-1" {...props}>
        {(label || showValue) && (
          <div className="flex justify-between items-center">
            {label && (
              <span className="text-sm font-medium text-gray-700">
                {label}
              </span>
            )}
            {showValue && (
              <span className="text-sm text-gray-500">
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        )}
        <div
          ref={ref}
          className={cn(
            'w-full bg-gray-200 rounded-full overflow-hidden',
            heights[size],
            className
          )}
        >
          <div
            className={cn(
              'transition-all duration-300 ease-in-out rounded-full',
              heights[size],
              variants[actualVariant]
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export interface ResourceProgressProps {
  used: number;
  total: number;
  unit: string;
  label: string;
  className?: string;
}

export const ResourceProgress: React.FC<ResourceProgressProps> = ({
  used,
  total,
  unit,
  label,
  className,
}) => {
  const percentage = total > 0 ? (used / total) * 100 : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">
          {label}
        </span>
        <span className="text-sm text-gray-500">
          {used.toFixed(1)} / {total.toFixed(1)} {unit}
        </span>
      </div>
      <Progress 
        value={percentage} 
        max={100} 
        size="md"
      />
    </div>
  );
};

export interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showValue?: boolean;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  variant = 'default',
  showValue = false,
  className,
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getVariant = () => {
    if (variant !== 'default') return variant;
    
    if (percentage >= 90) return 'error';
    if (percentage >= 75) return 'warning';
    return 'success';
  };

  const actualVariant = getVariant();

  const variants = {
    default: 'stroke-primary-500',
    success: 'stroke-success-500',
    warning: 'stroke-warning-500',
    error: 'stroke-error-500',
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={cn('transition-all duration-300 ease-in-out', variants[actualVariant])}
        />
      </svg>
      {showValue && (
        <span className="absolute text-sm font-medium text-gray-700">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};
