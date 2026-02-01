import type { FundMetrics } from './fund';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * A column sorting configuration
 */
export interface SortColumn {
  column: string;
  direction: SortDirection;
}

/**
 * Cached metrics entry
 */
export interface MetricsCacheEntry {
  metrics: FundMetrics;
  timestamp: number;
}

/**
 * Cached consolidated metrics entry (for grouped view)
 */
export interface ConsolidatedMetricsCacheEntry {
  metrics: FundMetrics;
  fundIds: number[]; // Sorted fund IDs that were consolidated
  dataVersion: number; // Data version when cached
}
