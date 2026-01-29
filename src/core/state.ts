import type {
  Fund,
  FundMetrics,
  FundNameData,
  Group,
  SortColumn,
  MetricsCacheEntry,
} from '../types';
import { CONFIG } from './config';

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
  displayLimit = 100; // Number of funds to show initially
  displayLimitIncrement = 100; // How many more to show on "Load More"

  // Cache
  metricsCache: Map<string, MetricsCacheEntry> = new Map();
  groupDescendantsCache: Map<number, number[]> = new Map();
  ancestorCache: Map<number, number[]> = new Map();

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
    this.metricsCache.set(key, { metrics, timestamp: Date.now() });
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
    // Clear caches since groups changed
    this.ancestorCache.clear();
    this.groupDescendantsCache.clear();
  }

  // O(1) group lookup by ID
  getGroupByIdSync(groupId: number): Group | undefined {
    return this.groupsMap.get(groupId);
  }

  // Get direct child group IDs
  getDirectChildIds(groupId: number): number[] {
    const children: number[] = [];
    for (const [id, group] of this.groupsMap) {
      if (group.parentGroupId === groupId) {
        children.push(id);
      }
    }
    return children;
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

  // Get descendant group IDs with memoization (depth-first order)
  getDescendantIds(groupId: number): number[] {
    const cached = this.groupDescendantsCache.get(groupId);
    if (cached) {
      return cached;
    }

    const descendants: number[] = [groupId];

    for (const [id, group] of this.groupsMap) {
      if (group.parentGroupId === groupId) {
        // Add child and all its descendants (proper depth-first order)
        const childDescendants = this.getDescendantIds(id);
        descendants.push(...childDescendants);
      }
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

  shouldShowExportReminder(intervalMs: number): boolean {
    if (!this.dataChangedSinceLastExport) return false;
    return Date.now() - this.lastExportReminderTime >= intervalMs;
  }

  dismissExportReminder(): void {
    this.lastExportReminderTime = Date.now();
  }

  // Pagination methods
  resetDisplayLimit(): void {
    this.displayLimit = 100;
  }

  loadMore(): void {
    this.displayLimit += this.displayLimitIncrement;
  }
}

export const AppState = new AppStateClass();
