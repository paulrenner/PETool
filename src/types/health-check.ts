/**
 * Types for health check functionality
 */

/**
 * A dismissed health check issue (stored in IndexedDB)
 */
export interface DismissedHealthIssue {
  id?: number;
  fund1Id: number;
  fund2Id: number;
  reason: string;
  dismissedAt: string;
}
