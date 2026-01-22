/**
 * Audit Log Types
 *
 * Tracks all data modifications for financial software compliance.
 * Audit logs are append-only and should never be deleted in production.
 */

/**
 * Types of auditable operations
 */
export type AuditOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'IMPORT'
  | 'EXPORT'
  | 'CLEAR_ALL';

/**
 * Entity types that can be audited
 */
export type AuditEntityType = 'Fund' | 'Group' | 'FundName' | 'System';

/**
 * A single audit log entry
 *
 * Records who did what, when, and what changed.
 * For financial software, this provides an immutable trail of all modifications.
 */
export interface AuditLogEntry {
  id?: number;
  /** When the operation occurred */
  timestamp: string;
  /** Type of operation performed */
  operation: AuditOperation;
  /** Type of entity affected */
  entityType: AuditEntityType;
  /** ID of the entity affected (null for bulk operations) */
  entityId: number | string | null;
  /** Human-readable description of the entity (e.g., fund name) */
  entityName: string | null;
  /** Summary of what changed */
  summary: string;
  /** Previous state (for UPDATE/DELETE operations) */
  previousValue?: unknown;
  /** New state (for CREATE/UPDATE operations) */
  newValue?: unknown;
  /** Number of records affected (for bulk operations) */
  recordCount?: number;
}

/**
 * Audit log filter options for querying
 */
export interface AuditLogFilter {
  /** Filter by operation type */
  operation?: AuditOperation;
  /** Filter by entity type */
  entityType?: AuditEntityType;
  /** Filter by entity ID */
  entityId?: number | string;
  /** Start date (inclusive) */
  startDate?: string;
  /** End date (inclusive) */
  endDate?: string;
  /** Maximum number of entries to return */
  limit?: number;
}

/**
 * Summary of changes for display
 */
export interface AuditChangeSummary {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Generate a human-readable summary of changes between two objects
 */
export function generateChangeSummary(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null
): AuditChangeSummary[] {
  const changes: AuditChangeSummary[] = [];

  if (!oldObj && newObj) {
    // New record
    return [{ field: 'record', oldValue: null, newValue: 'created' }];
  }

  if (oldObj && !newObj) {
    // Deleted record
    return [{ field: 'record', oldValue: 'existed', newValue: null }];
  }

  if (!oldObj || !newObj) {
    return changes;
  }

  // Compare fields
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    // Skip internal fields
    if (key === 'id' || key === 'timestamp') continue;

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    // Deep comparison for arrays/objects
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);

    if (oldStr !== newStr) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

/**
 * Format a change summary as a readable string
 */
export function formatChangeSummary(changes: AuditChangeSummary[]): string {
  if (changes.length === 0) return 'No changes';

  return changes
    .map((c) => {
      if (c.field === 'record') {
        return c.newValue === 'created' ? 'Created new record' : 'Deleted record';
      }

      // Truncate long values
      const formatValue = (val: unknown): string => {
        if (val === null || val === undefined) return 'empty';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.length > 50 ? str.substring(0, 47) + '...' : str;
      };

      return `${c.field}: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`;
    })
    .join('; ');
}
