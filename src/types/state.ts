import type { Fund, FundMetrics, FundNameData } from './fund';
import type { Group } from './group';

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
 * Application configuration constants
 */
export interface AppConfig {
  DB_NAME: string;
  DB_VERSION: number;
  STORE_FUNDS: string;
  STORE_GROUPS: string;
  STORE_SETTINGS: string;
  STORE_FUND_NAMES: string;
  METRICS_CACHE_TTL: number;
  DEBOUNCE_FILTER: number;
  DEBOUNCE_SEARCH: number;
  DEBOUNCE_INPUT: number;
  MAX_IRR_ITERATIONS: number;
  IRR_TOLERANCE: number;
  MAX_NESTED_GROUP_DEPTH: number;
}

/**
 * Filter dropdown option
 */
export interface FilterOption {
  value: string;
  label: string;
  indent?: number;
}

/**
 * Application state interface
 */
export interface AppStateType {
  // Data
  currentFunds: Fund[];
  fundNames: Set<string>;
  fundNameData: Map<string, FundNameData>;
  groups: Group[];
  groupsMap: Map<number, Group>;

  // UI State
  currentGroupDescendants: number[] | null;
  sortColumns: SortColumn[];
  currentActionFundId: number | null;
  currentDetailsFundId: number | null;
  hasUnsavedChanges: boolean;
  isResizingColumn: boolean;
  lastMousedownOnResizer: boolean;

  // Cache
  metricsCache: Map<string, MetricsCacheEntry>;
  groupDescendantsCache: Map<number, number[]>;
  ancestorCache: Map<number, number[]>;

  // Performance
  abortController: AbortController | null;
}
