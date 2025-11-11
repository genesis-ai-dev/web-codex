import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { WorkspaceStatus } from '../types';

// Date formatting
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'MMM d, yyyy');
}

export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'MMM d, yyyy h:mm a');
}

export function formatRelativeTime(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting date:', date, error);
    return 'Invalid date';
  }
}

// Resource formatting
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatCPU(cpu: string): string {
  // Convert millicores to cores
  if (cpu.endsWith('m')) {
    const millicores = parseInt(cpu.slice(0, -1));
    return (millicores / 1000).toFixed(2) + ' cores';
  }
  return cpu + ' cores';
}

export function formatMemory(memory: string): string {
  // Handle different memory units
  if (memory.endsWith('Ki')) {
    return formatBytes(parseInt(memory.slice(0, -2)) * 1024);
  }
  if (memory.endsWith('Mi')) {
    return formatBytes(parseInt(memory.slice(0, -2)) * 1024 * 1024);
  }
  if (memory.endsWith('Gi')) {
    return formatBytes(parseInt(memory.slice(0, -2)) * 1024 * 1024 * 1024);
  }
  return memory;
}

export function parseResourceString(resource: string): number {
  // Parse resource strings like "2", "500m", "2Gi" into normalized numbers
  if (resource.endsWith('m')) {
    return parseInt(resource.slice(0, -1)) / 1000;
  }
  if (resource.endsWith('Ki')) {
    return parseInt(resource.slice(0, -2)) * 1024;
  }
  if (resource.endsWith('Mi')) {
    return parseInt(resource.slice(0, -2)) * 1024 * 1024;
  }
  if (resource.endsWith('Gi')) {
    return parseInt(resource.slice(0, -2)) * 1024 * 1024 * 1024;
  }
  return parseFloat(resource);
}

// Status helpers
export function getStatusColor(status: WorkspaceStatus): string {
  switch (status) {
    case 'running':
      return 'text-success-600';
    case 'stopped':
      return 'text-gray-500';
    case 'starting':
    case 'stopping':
      return 'text-warning-600';
    case 'error':
      return 'text-error-600';
    case 'pending':
      return 'text-gray-400';
    default:
      return 'text-gray-500';
  }
}

export function getStatusBadgeClass(status: WorkspaceStatus): string {
  const baseClass = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  
  switch (status) {
    case 'running':
      return `${baseClass} bg-success-100 text-success-800`;
    case 'stopped':
      return `${baseClass} bg-gray-100 text-gray-800`;
    case 'starting':
    case 'stopping':
      return `${baseClass} bg-warning-100 text-warning-800`;
    case 'error':
      return `${baseClass} bg-error-100 text-error-800`;
    case 'pending':
      return `${baseClass} bg-gray-100 text-gray-600`;
    default:
      return `${baseClass} bg-gray-100 text-gray-800`;
  }
}

export function getStatusIcon(status: WorkspaceStatus): string {
  switch (status) {
    case 'running':
      return '●'; // Green dot
    case 'stopped':
      return '○'; // Empty circle
    case 'starting':
    case 'stopping':
      return '◐'; // Half circle
    case 'error':
      return '⚠'; // Warning
    case 'pending':
      return '⏳'; // Hourglass
    default:
      return '○';
  }
}

// Percentage helpers
export function calculatePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

export function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'text-error-600';
  if (percentage >= 75) return 'text-warning-600';
  return 'text-success-600';
}

export function getUsageBarColor(percentage: number): string {
  if (percentage >= 90) return 'bg-error-500';
  if (percentage >= 75) return 'bg-warning-500';
  return 'bg-success-500';
}

// String helpers
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

// Validation helpers
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidKubernetesName(name: string): boolean {
  // DNS-1123 subdomain validation
  const nameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  return nameRegex.test(name) && name.length <= 63;
}

// Error helpers
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}

// Local storage helpers with type safety
export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
}

// Debounce helper
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Class name helper (similar to clsx)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
