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
  dataVersion: number; // Data version when cached - invalidates on data change
}

/**
 * Cached consolidated metrics entry (for grouped view)
 */
export interface ConsolidatedMetricsCacheEntry {
  metrics: FundMetrics;
  fundIdsHash: string; // Hash of sorted fund IDs for fast comparison
  dataVersion: number; // Data version when cached
}

/**
 * Cached filter results
 */
export interface FilterCacheEntry {
  fundIds: number[]; // Resulting fund IDs after filtering
  filterHash: string; // Hash of filter state
  dataVersion: number; // Data version when cached
}

/**
 * Cached group tree entry
 */
export interface GroupTreeCacheEntry {
  tree: unknown; // ConsolidatedGroup[] - using unknown to avoid circular import
  fundIdsHash: string; // Hash of fund IDs used to build tree
  expandedHash: string; // Hash of expanded group IDs
  dataVersion: number;
}
