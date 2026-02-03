import type {
  Fund,
  FundMetrics,
  FundNameData,
  Group,
  SortColumn,
  MetricsCacheEntry,
  ConsolidatedMetricsCacheEntry,
  FilterCacheEntry,
  GroupTreeCacheEntry,
} from '../types';
import { CONFIG } from './config';

/**
 * Fast hash function for arrays of numbers (FNV-1a inspired)
 */
function hashNumberArray(arr: number[]): string {
  let hash = 2166136261;
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (val !== undefined) {
      hash ^= val;
      hash = (hash * 16777619) >>> 0;
    }
  }
  return hash.toString(36);
}

/**
 * Hash function for filter state
 */
function hashFilterState(filters: Record<string, string[]>): string {
  const keys = Object.keys(filters).sort();
  let hash = 2166136261;
  for (const key of keys) {
    for (const char of key) {
      hash ^= char.charCodeAt(0);
      hash = (hash * 16777619) >>> 0;
    }
    const values = filters[key];
    if (values) {
      for (const val of values) {
        for (const char of val) {
          hash ^= char.charCodeAt(0);
          hash = (hash * 16777619) >>> 0;
        }
      }
    }
  }
  return hash.toString(36);
}

/**
 * Centralized application state management
 */
class AppStateClass {
  // Data
  currentFunds: Fund[] = [];
  fundNames: Set<string> = new Set();
  fundNameData: Map<string, FundNameData> = new Map();
  groups: Group[] = [];
  groupsMap: Map<number, Group> = new Map();

  // UI State
  sortColumns: SortColumn[] = [];
  currentActionFundId: number | null = null;
  currentDetailsFundId: number | null = null;
  hasUnsavedChanges = false; // For details modal
  fundModalHasUnsavedChanges = false; // For fund (add/edit) modal

  // Data change tracking
  dataVersion = 0; // Increments whenever data changes
  lastHealthCheckVersion = -1; // Data version when health check was last run
  dataChangedSinceLastExport = false; // Whether data has changed since last export
  lastExportReminderTime = 0; // Timestamp of last export reminder

  // Pagination
  displayLimit = 50; // Number of funds to show initially
  displayLimitIncrement = 50; // How many more to show on "Load More"

  // Cache
  metricsCache: Map<string, MetricsCacheEntry> = new Map();
  consolidatedMetricsCache: Map<string, ConsolidatedMetricsCacheEntry> = new Map();
  groupDescendantsCache: Map<number, number[]> = new Map();
  ancestorCache: Map<number, number[]> = new Map();
  childrenByParentId: Map<number | null, number[]> = new Map(); // O(1) children lookup
  filterCache: FilterCacheEntry | null = null; // Cached filter results
  groupTreeCache: GroupTreeCacheEntry | null = null; // Cached group tree

  // Performance
  abortController: AbortController | null = null;

  // Getters
  getFunds(): Fund[] {
    return this.currentFunds;
  }

  getGroups(): Group[] {
    return this.groups;
  }

  // Cache management
  clearMetricsCache(): void {
    this.metricsCache.clear();
    this.consolidatedMetricsCache.clear();
  }

  getMetricsFromCache(fundId: number, cutoffDate: string): FundMetrics | null {
    const key = `${fundId}-${cutoffDate}`;
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < CONFIG.METRICS_CACHE_TTL) {
      return cached.metrics;
    }
    return null;
  }

  setMetricsCache(fundId: number, cutoffDate: string, metrics: FundMetrics): void {
    const key = `${fundId}-${cutoffDate}`;

    // Evict oldest entry if cache is at capacity (FIFO eviction - O(1) using Map insertion order)
    if (this.metricsCache.size >= CONFIG.MAX_METRICS_CACHE_SIZE) {
      const firstKey = this.metricsCache.keys().next().value;
      if (firstKey) {
        this.metricsCache.delete(firstKey);
      }
    }

    this.metricsCache.set(key, { metrics, timestamp: Date.now() });
  }

  // Consolidated metrics cache (for grouped view) - O(1) lookup with hash
  getConsolidatedMetricsFromCache(
    fundName: string,
    cutoffDate: string,
    fundIds: number[]
  ): FundMetrics | null {
    const sortedIds = [...fundIds].sort((a, b) => a - b);
    const idsHash = hashNumberArray(sortedIds);
    const key = `${fundName}-${cutoffDate}-${idsHash}`;
    const cached = this.consolidatedMetricsCache.get(key);
    if (!cached) return null;

    // Invalidate if data has changed
    if (cached.dataVersion !== this.dataVersion) return null;

    return cached.metrics;
  }

  setConsolidatedMetricsCache(
    fundName: string,
    cutoffDate: string,
    fundIds: number[],
    metrics: FundMetrics
  ): void {
    const sortedIds = [...fundIds].sort((a, b) => a - b);
    const idsHash = hashNumberArray(sortedIds);
    const key = `${fundName}-${cutoffDate}-${idsHash}`;
    this.consolidatedMetricsCache.set(key, {
      metrics,
      fundIdsHash: idsHash,
      dataVersion: this.dataVersion,
    });
  }

  // Filter results cache
  getFilteredFundsFromCache(
    filterState: Record<string, string[]>,
    cutoffDateStr: string
  ): number[] | null {
    if (!this.filterCache) return null;
    if (this.filterCache.dataVersion !== this.dataVersion) return null;

    const currentHash = hashFilterState(filterState) + '-' + cutoffDateStr;
    if (this.filterCache.filterHash !== currentHash) return null;

    return this.filterCache.fundIds;
  }

  setFilteredFundsCache(
    filterState: Record<string, string[]>,
    cutoffDateStr: string,
    fundIds: number[]
  ): void {
    const filterHash = hashFilterState(filterState) + '-' + cutoffDateStr;
    this.filterCache = {
      fundIds,
      filterHash,
      dataVersion: this.dataVersion,
    };
  }

  clearFilterCache(): void {
    this.filterCache = null;
  }

  // Group tree cache
  getGroupTreeFromCache(
    fundIds: number[],
    expandedGroupIds: Set<number | string>
  ): unknown | null {
    if (!this.groupTreeCache) return null;
    if (this.groupTreeCache.dataVersion !== this.dataVersion) return null;

    const sortedIds = [...fundIds].sort((a, b) => a - b);
    const idsHash = hashNumberArray(sortedIds);
    if (this.groupTreeCache.fundIdsHash !== idsHash) return null;

    const expandedArr = Array.from(expandedGroupIds).map(id =>
      typeof id === 'string' ? parseInt(id) : id
    ).filter(id => !isNaN(id)).sort((a, b) => a - b);
    const expandedHash = hashNumberArray(expandedArr);
    if (this.groupTreeCache.expandedHash !== expandedHash) return null;

    return this.groupTreeCache.tree;
  }

  setGroupTreeCache(
    fundIds: number[],
    expandedGroupIds: Set<number | string>,
    tree: unknown
  ): void {
    const sortedIds = [...fundIds].sort((a, b) => a - b);
    const idsHash = hashNumberArray(sortedIds);

    const expandedArr = Array.from(expandedGroupIds).map(id =>
      typeof id === 'string' ? parseInt(id) : id
    ).filter(id => !isNaN(id)).sort((a, b) => a - b);
    const expandedHash = hashNumberArray(expandedArr);

    this.groupTreeCache = {
      tree,
      fundIdsHash: idsHash,
      expandedHash,
      dataVersion: this.dataVersion,
    };
  }

  clearGroupTreeCache(): void {
    this.groupTreeCache = null;
  }

  clearConsolidatedMetricsCache(): void {
    this.consolidatedMetricsCache.clear();
  }

  // State setters
  setFunds(funds: Fund[]): void {
    this.currentFunds = funds;
  }

  setGroups(groupList: Group[]): void {
    this.groups = groupList;
    // Update O(1) lookup map
    this.groupsMap.clear();
    groupList.forEach((g) => this.groupsMap.set(g.id, g));

    // Build children index for O(1) child lookups
    this.childrenByParentId.clear();
    for (const group of groupList) {
      const parentId = group.parentGroupId;
      const existing = this.childrenByParentId.get(parentId) || [];
      existing.push(group.id);
      this.childrenByParentId.set(parentId, existing);
    }

    // Clear caches since groups changed
    this.ancestorCache.clear();
    this.groupDescendantsCache.clear();
    this.groupTreeCache = null;
  }

  // O(1) group lookup by ID
  getGroupByIdSync(groupId: number): Group | undefined {
    return this.groupsMap.get(groupId);
  }

  // Get direct child group IDs - O(1) lookup
  getDirectChildIds(groupId: number): number[] {
    return this.childrenByParentId.get(groupId) || [];
  }

  // Get top-level group IDs (no parent) - O(1) lookup
  getTopLevelGroupIds(): number[] {
    return this.childrenByParentId.get(null) || [];
  }

  // Get ancestor group IDs with memoization
  getAncestorIds(groupId: number): number[] {
    const cached = this.ancestorCache.get(groupId);
    if (cached) {
      return cached;
    }

    const ancestors: number[] = [];
    let currentId: number | null = groupId;

    while (currentId != null) {
      const group = this.groupsMap.get(currentId);
      if (!group) break;
      ancestors.push(group.id);
      currentId = group.parentGroupId;
    }

    this.ancestorCache.set(groupId, ancestors);
    return ancestors;
  }

  // Get descendant group IDs with memoization (depth-first order) - uses O(1) children lookup
  getDescendantIds(groupId: number): number[] {
    const cached = this.groupDescendantsCache.get(groupId);
    if (cached) {
      return cached;
    }

    const descendants: number[] = [groupId];
    const childIds = this.childrenByParentId.get(groupId) || [];

    for (const childId of childIds) {
      // Add child and all its descendants (proper depth-first order)
      const childDescendants = this.getDescendantIds(childId);
      descendants.push(...childDescendants);
    }

    this.groupDescendantsCache.set(groupId, descendants);
    return descendants;
  }

  // Clear descendant cache
  clearDescendantCache(): void {
    this.groupDescendantsCache.clear();
  }

  setUnsavedChanges(value: boolean): void {
    this.hasUnsavedChanges = value;
  }

  setFundModalUnsavedChanges(value: boolean): void {
    this.fundModalHasUnsavedChanges = value;
  }

  setFundNames(names: Set<string>): void {
    this.fundNames = names;
  }

  setFundNameData(data: Map<string, FundNameData>): void {
    this.fundNameData = data;
  }

  setSortColumns(columns: SortColumn[]): void {
    this.sortColumns = columns;
  }

  setCurrentActionFundId(fundId: number | null): void {
    this.currentActionFundId = fundId;
  }

  setCurrentDetailsFundId(fundId: number | null): void {
    this.currentDetailsFundId = fundId;
  }

  setAbortController(controller: AbortController | null): void {
    this.abortController = controller;
  }

  // Data change tracking methods
  markDataChanged(): void {
    this.dataVersion++;
    this.dataChangedSinceLastExport = true;
  }

  markDataExported(): void {
    this.dataChangedSinceLastExport = false;
    this.lastExportReminderTime = Date.now();
  }

  needsHealthCheckRefresh(): boolean {
    return this.lastHealthCheckVersion !== this.dataVersion;
  }

  markHealthCheckRun(): void {
    this.lastHealthCheckVersion = this.dataVersion;
  }

  invalidateHealthCheck(): void {
    this.lastHealthCheckVersion = -1;
  }

  shouldShowExportReminder(intervalMs: number): boolean {
    if (!this.dataChangedSinceLastExport) return false;
    return Date.now() - this.lastExportReminderTime >= intervalMs;
  }

  dismissExportReminder(): void {
    this.lastExportReminderTime = Date.now();
  }

  // Pagination methods
  resetDisplayLimit(): void {
    this.displayLimit = 50;
  }

  loadMore(): void {
    this.displayLimit += this.displayLimitIncrement;
  }
}

export const AppState = new AppStateClass();
