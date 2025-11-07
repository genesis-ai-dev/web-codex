import React from 'react';
import { cn } from '../../utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', dot = false, children, ...props }, ref) => {
    const baseClass = 'inline-flex items-center font-medium rounded-full';
    
    const variants = {
      default: 'bg-gray-100 text-gray-800',
      success: 'bg-success-100 text-success-800',
      warning: 'bg-warning-100 text-warning-800',
      error: 'bg-error-100 text-error-800',
      info: 'bg-primary-100 text-primary-800',
    };
    
    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-0.5 text-xs',
      lg: 'px-3 py-1 text-sm',
    };

    const dotVariants = {
      default: 'bg-gray-400',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      error: 'bg-error-500',
      info: 'bg-primary-500',
    };

    return (
      <span
        className={cn(
          baseClass,
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      >
        {dot && (
          <span 
            className={cn(
              'mr-1.5 h-1.5 w-1.5 rounded-full',
              dotVariants[variant]
            )}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export interface StatusBadgeProps {
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'pending';
  children?: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children, className }) => {
  const statusConfig = {
    running: { variant: 'success' as const, dot: true },
    stopped: { variant: 'default' as const, dot: true },
    starting: { variant: 'warning' as const, dot: true },
    stopping: { variant: 'warning' as const, dot: true },
    error: { variant: 'error' as const, dot: true },
    pending: { variant: 'default' as const, dot: true },
  };

  const config = statusConfig[status];

  return (
    <Badge 
      variant={config.variant} 
      dot={config.dot}
      className={className}
    >
      {children || status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};
