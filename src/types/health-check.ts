/**
 * Types for health check functionality
 */

/**
 * A dismissed health check issue (stored in IndexedDB)
 * Supports both duplicate pairs and individual fund issues
 */
export interface DismissedHealthIssue {
  id?: number;
  // For duplicate pairs
  fund1Id: number;
  fund2Id: number;
  // For individual fund issues (fund1Id = fundId, fund2Id = 0)
  category?: string;  // e.g., 'Data Anomaly', 'Timeline Issue'
  message?: string;   // The specific issue message
  reason: string;
  dismissedAt: string;
}
