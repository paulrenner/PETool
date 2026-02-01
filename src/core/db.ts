import type { Fund, FundNameData, Group, AuditLogEntry, AuditLogFilter, AuditEntityType, DismissedHealthIssue } from '../types';
import { generateChangeSummary, formatChangeSummary } from '../types/audit';
import { CONFIG } from './config';
import { validateFund } from '../utils/validation';
import { AppState } from './state';

// Database instance
let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB database
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const transaction = (event.target as IDBOpenDBRequest).transaction!;

      // Funds store
      if (!database.objectStoreNames.contains(CONFIG.FUNDS_STORE)) {
        const fundsStore = database.createObjectStore(CONFIG.FUNDS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        fundsStore.createIndex('fundName', 'fundName', { unique: false });
        fundsStore.createIndex('accountNumber', 'accountNumber', { unique: false });
      }

      // Fund names store
      if (!database.objectStoreNames.contains(CONFIG.FUNDNAMES_STORE)) {
        database.createObjectStore(CONFIG.FUNDNAMES_STORE, { keyPath: 'name' });
      }

      // Groups store
      if (!database.objectStoreNames.contains(CONFIG.GROUPS_STORE)) {
        const groupsStore = database.createObjectStore(CONFIG.GROUPS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        groupsStore.createIndex('parentGroupId', 'parentGroupId', { unique: false });
        groupsStore.createIndex('name', 'name', { unique: false });
      }

      // Audit log store (v11+)
      if (!database.objectStoreNames.contains(CONFIG.AUDIT_STORE)) {
        const auditStore = database.createObjectStore(CONFIG.AUDIT_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        auditStore.createIndex('operation', 'operation', { unique: false });
        auditStore.createIndex('entityType', 'entityType', { unique: false });
        auditStore.createIndex('entityId', 'entityId', { unique: false });
      }

      // Dismissed health issues store (v12+)
      if (!database.objectStoreNames.contains(CONFIG.DISMISSED_ISSUES_STORE)) {
        const dismissedStore = database.createObjectStore(CONFIG.DISMISSED_ISSUES_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        // Compound index for quick lookup by fund pair (order-independent)
        dismissedStore.createIndex('fund1Id', 'fund1Id', { unique: false });
        dismissedStore.createIndex('fund2Id', 'fund2Id', { unique: false });
      }

      // Migration v5 to v6: Move tags from investments to fund names
      if (oldVersion < 6 && oldVersion >= 5) {
        if (database.objectStoreNames.contains('tags')) {
          database.deleteObjectStore('tags');
        }

        const fundsStore = transaction.objectStore(CONFIG.FUNDS_STORE);
        const fundNamesStore = transaction.objectStore(CONFIG.FUNDNAMES_STORE);
        const fundNameTagsMap = new Map<string, Set<string>>();

        fundsStore.openCursor().onsuccess = function (event) {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const fund = cursor.value as Fund & { tags?: string[] };
            if (fund.tags && Array.isArray(fund.tags) && fund.tags.length > 0) {
              if (!fundNameTagsMap.has(fund.fundName)) {
                fundNameTagsMap.set(fund.fundName, new Set());
              }
              fund.tags.forEach((tag) => fundNameTagsMap.get(fund.fundName)!.add(tag));
            }
            delete fund.tags;
            cursor.update(fund);
            cursor.continue();
          } else {
            fundNamesStore.getAll().onsuccess = function (event) {
              const fundNames = (event.target as IDBRequest<FundNameData[]>).result;
              fundNames.forEach((fundNameObj) => {
                const name = fundNameObj.name;
                const tags = fundNameTagsMap.has(name)
                  ? Array.from(fundNameTagsMap.get(name)!)
                  : [];
                fundNamesStore.put({ name, tags });
              });
            };
          }
        };
      }

      // Migration v9 to v10: Fix store names
      if (oldVersion === 9) {
        if (
          database.objectStoreNames.contains('investments') &&
          !database.objectStoreNames.contains('funds')
        ) {
          const fundsStore = database.createObjectStore('funds', {
            keyPath: 'id',
            autoIncrement: true,
          });
          fundsStore.createIndex('fundName', 'fundName', { unique: false });
          fundsStore.createIndex('accountNumber', 'accountNumber', { unique: false });

          const investmentsStore = transaction.objectStore('investments');
          investmentsStore.openCursor().onsuccess = function (event) {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              fundsStore.put(cursor.value);
              cursor.continue();
            }
          };
        }

        if (
          database.objectStoreNames.contains('investmentNames') &&
          !database.objectStoreNames.contains('fundNames')
        ) {
          database.createObjectStore('fundNames', { keyPath: 'name' });
          const investmentNamesStore = transaction.objectStore('investmentNames');
          const fundNamesStore = transaction.objectStore('fundNames');
          investmentNamesStore.openCursor().onsuccess = function (event) {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              fundNamesStore.put(cursor.value);
              cursor.continue();
            }
          };
        }

        if (database.objectStoreNames.contains('investments')) {
          database.deleteObjectStore('investments');
        }
        if (database.objectStoreNames.contains('investmentNames')) {
          database.deleteObjectStore('investmentNames');
        }
      }
    };
  });
}
// ===========================
// Generic DB Helper
// ===========================

async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return new Promise((resolve, reject) => {
    const tx = db!.transaction([storeName], mode);
    const store = tx.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===========================
// Funds Operations
// ===========================

/**
 * Save a fund to the database
 *
 * IMPORTANT: This function validates data before saving to prevent corruption.
 * Invalid data (NaN amounts, malformed dates, etc.) will be rejected.
 *
 * @param fundData - The fund to save
 * @returns Promise resolving to the fund ID
 * @throws Error if validation fails or database error occurs
 */
export function saveFundToDB(fundData: Fund): Promise<number> {
  return new Promise((resolve, reject) => {
    // Validate fund data before saving to prevent corruption
    const validation = validateFund(fundData);
    if (!validation.valid) {
      const errorMsg = `Fund validation failed: ${validation.errors.join('; ')}`;
      console.error(errorMsg, fundData);
      reject(new Error(errorMsg));
      return;
    }

    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const isUpdate = !!fundData.id;
    let previousFund: Fund | undefined;

    // For updates, get the previous state for audit logging
    if (isUpdate) {
      const getRequest = db.transaction([CONFIG.FUNDS_STORE], 'readonly')
        .objectStore(CONFIG.FUNDS_STORE)
        .get(fundData.id!);

      getRequest.onsuccess = () => {
        previousFund = getRequest.result ? normalizeFund(getRequest.result) : undefined;
        performSave();
      };
      getRequest.onerror = () => {
        // Continue without previous state if lookup fails
        performSave();
      };
    } else {
      performSave();
    }

    function performSave() {
      const tx = db!.transaction([CONFIG.FUNDS_STORE], 'readwrite');
      const objectStore = tx.objectStore(CONFIG.FUNDS_STORE);

      let request: IDBRequest<IDBValidKey>;
      if (fundData.id) {
        request = objectStore.put(fundData);
      } else {
        const { id: _, ...dataWithoutId } = fundData;
        request = objectStore.add(dataWithoutId);
      }

      request.onsuccess = () => {
        const savedId = request.result as number;

        // Mark data as changed for export reminders and health check cache
        AppState.markDataChanged();

        // Log audit entry (async, don't wait)
        const savedFund = { ...fundData, id: savedId };
        logFundModification(
          isUpdate ? 'UPDATE' : 'CREATE',
          savedFund,
          previousFund
        ).catch(console.error);

        resolve(savedId);
      };
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Normalize date to YYYY-MM-DD format
 * Handles various input formats: YYYY-MM-DD, MM/DD/YYYY, YYYY/MM/DD, M/D/YYYY, etc.
 */
function normalizeDate(dateInput: any): string {
  if (!dateInput) return '';

  // Already in correct format
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  let dateStr = String(dateInput).trim();

  // Try MM/DD/YYYY or M/D/YYYY format
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  // Try YYYY/MM/DD format
  const ymdSlashMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlashMatch) {
    const [, year, month, day] = ymdSlashMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  // Try DD-MM-YYYY format (European)
  const dmyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  // Try ISO format with time (2024-01-15T00:00:00.000Z)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  // NOTE: We intentionally do NOT use new Date(dateStr) as a fallback here.
  // The Date constructor has timezone issues that can shift dates by 1 day.
  // Instead, preserve the original and let validation catch invalid formats.
  console.warn('Could not normalize date format:', dateInput);
  return dateStr;
}

/**
 * Normalize cash flow type to proper case
 */
function normalizeCashFlowType(type: any, amount: number): 'Contribution' | 'Distribution' | 'Adjustment' {
  if (typeof type === 'string') {
    const lower = type.toLowerCase().trim();
    if (lower === 'contribution' || lower === 'capital call') return 'Contribution';
    if (lower === 'distribution') return 'Distribution';
    if (lower === 'adjustment') return 'Adjustment';
  }
  // Fallback based on amount sign
  return amount < 0 ? 'Contribution' : 'Distribution';
}

/**
 * Normalize a fund object to ensure all fields have correct types
 * This handles data that may have been stored in older formats
 */
function normalizeFund(fund: any): Fund {
  // Ensure cashFlows is an array with proper structure
  const cashFlows = Array.isArray(fund.cashFlows)
    ? fund.cashFlows.map((cf: any) => {
        const amount = typeof cf.amount === 'number' ? cf.amount : parseFloat(cf.amount) || 0;
        const normalizedDate = normalizeDate(cf.date);
        return {
          date: normalizedDate,
          amount,
          type: normalizeCashFlowType(cf.type, amount),
          affectsCommitment: cf.affectsCommitment !== undefined ? cf.affectsCommitment : true,
        };
      })
    : [];

  // Ensure monthlyNav is an array with proper structure
  const monthlyNav = Array.isArray(fund.monthlyNav)
    ? fund.monthlyNav.map((nav: any) => ({
        date: normalizeDate(nav.date),
        amount: typeof nav.amount === 'number' ? nav.amount : parseFloat(nav.amount) || 0,
      }))
    : [];

  return {
    id: fund.id,
    fundName: fund.fundName || '',
    accountNumber: fund.accountNumber || '',
    commitment: typeof fund.commitment === 'number' ? fund.commitment : parseFloat(fund.commitment) || 0,
    groupId: fund.groupId ?? null,
    cashFlows,
    monthlyNav,
    timestamp: fund.timestamp || new Date().toISOString(),
  };
}

export async function getAllFunds(): Promise<Fund[]> {
  const rawFunds = await transaction<any[]>(CONFIG.FUNDS_STORE, 'readonly', (store) => store.getAll());
  return rawFunds.map(normalizeFund);
}

export async function getFundById(id: number): Promise<Fund | undefined> {
  const rawFund = await transaction<any>(CONFIG.FUNDS_STORE, 'readonly', (store) => store.get(id));
  return rawFund ? normalizeFund(rawFund) : undefined;
}

export function deleteFundFromDB(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    // Get the fund data before deleting for audit log
    const getRequest = db.transaction([CONFIG.FUNDS_STORE], 'readonly')
      .objectStore(CONFIG.FUNDS_STORE)
      .get(id);

    getRequest.onsuccess = () => {
      const fundToDelete = getRequest.result ? normalizeFund(getRequest.result) : null;

      const tx = db!.transaction([CONFIG.FUNDS_STORE], 'readwrite');
      const objectStore = tx.objectStore(CONFIG.FUNDS_STORE);
      const deleteRequest = objectStore.delete(id);

      deleteRequest.onsuccess = () => {
        // Mark data as changed
        AppState.markDataChanged();

        // Log audit entry (async, don't wait)
        if (fundToDelete) {
          logFundModification('DELETE', fundToDelete).catch(console.error);
        }
        resolve();
      };
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };

    getRequest.onerror = () => {
      // Still try to delete even if get fails
      const tx = db!.transaction([CONFIG.FUNDS_STORE], 'readwrite');
      const objectStore = tx.objectStore(CONFIG.FUNDS_STORE);
      const deleteRequest = objectStore.delete(id);

      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// ===========================
// Fund Names Operations
// ===========================

interface RawFundNameData {
  name: string;
  tags?: string[];
  investmentTermStartDate?: string | null;
  investmentTermYears?: number | null;
  finalCloseDate?: string | null; // Backward compatibility
}

export function getAllFundNameObjects(): Promise<FundNameData[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction([CONFIG.FUNDNAMES_STORE], 'readonly');
    const objectStore = tx.objectStore(CONFIG.FUNDNAMES_STORE);
    const request = objectStore.getAll() as IDBRequest<RawFundNameData[]>;

    request.onsuccess = () => {
      const objects: FundNameData[] = request.result.map((item) => ({
        name: item.name,
        tags: item.tags || [],
        investmentTermStartDate: item.investmentTermStartDate || item.finalCloseDate || null,
        investmentTermYears: item.investmentTermYears || null,
      }));
      resolve(objects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllFundNames(): Promise<string[]> {
  const objects = await getAllFundNameObjects();
  return objects.map((obj) => obj.name);
}

export function saveFundName(nameOrObject: string | Partial<FundNameData>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const fundNameObj: FundNameData =
      typeof nameOrObject === 'string'
        ? { name: nameOrObject, tags: [], investmentTermStartDate: null, investmentTermYears: null }
        : {
            name: nameOrObject.name!,
            tags: nameOrObject.tags || [],
            investmentTermStartDate: nameOrObject.investmentTermStartDate || null,
            investmentTermYears: nameOrObject.investmentTermYears || null,
          };

    const tx = db.transaction([CONFIG.FUNDNAMES_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.FUNDNAMES_STORE);
    const request = objectStore.put(fundNameObj);

    request.onsuccess = () => {
      AppState.markDataChanged();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export function deleteFundName(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction([CONFIG.FUNDNAMES_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.FUNDNAMES_STORE);
    const request = objectStore.delete(name);

    request.onsuccess = () => {
      AppState.markDataChanged();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ===========================
// Groups Operations
// ===========================

export function getAllGroups(): Promise<Group[]> {
  return transaction(CONFIG.GROUPS_STORE, 'readonly', (store) => store.getAll());
}

export function saveGroup(groupData: Omit<Group, 'id'> | Group): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction([CONFIG.GROUPS_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.GROUPS_STORE);
    const request = objectStore.put(groupData);

    request.onsuccess = () => {
      AppState.markDataChanged();
      resolve(request.result as number);
    };
    request.onerror = () => reject(request.error);
  });
}

export function deleteGroup(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction([CONFIG.GROUPS_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.GROUPS_STORE);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      AppState.markDataChanged();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ===========================
// Bulk Operations
// ===========================

export function clearAllData(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction(
      [CONFIG.FUNDS_STORE, CONFIG.FUNDNAMES_STORE, CONFIG.GROUPS_STORE],
      'readwrite'
    );

    let completed = 0;
    let settled = false;
    const storeNames = [CONFIG.FUNDS_STORE, CONFIG.FUNDNAMES_STORE, CONFIG.GROUPS_STORE];

    storeNames.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => {
        if (settled) return;
        completed++;
        if (completed === storeNames.length) {
          settled = true;
          // Mark data as changed
          AppState.markDataChanged();
          // Log the clear operation
          logAuditEntry({
            operation: 'CLEAR_ALL',
            entityType: 'System',
            entityId: null,
            entityName: null,
            summary: 'Cleared all data (funds, groups, fund names)',
          }).catch(console.error);
          resolve();
        }
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error);
      };
    });
  });
}

// ===========================
// Audit Log Operations
// ===========================

/**
 * Log an audit entry
 *
 * Audit logs track all data modifications for compliance and debugging.
 * Entries are append-only and include timestamp, operation type, and change details.
 */
export function logAuditEntry(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db) {
      // If DB not ready, just log to console and resolve
      console.warn('[AUDIT] DB not ready, logging to console:', entry);
      resolve(-1);
      return;
    }

    // Check if audit store exists (for backward compatibility)
    if (!db.objectStoreNames.contains(CONFIG.AUDIT_STORE)) {
      console.warn('[AUDIT] Audit store not available, logging to console:', entry);
      resolve(-1);
      return;
    }

    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const tx = db.transaction([CONFIG.AUDIT_STORE], 'readwrite');
    const store = tx.objectStore(CONFIG.AUDIT_STORE);
    const request = store.add(auditEntry);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => {
      console.error('[AUDIT] Failed to log entry:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get audit log entries with optional filtering
 */
export function getAuditLog(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    if (!db.objectStoreNames.contains(CONFIG.AUDIT_STORE)) {
      resolve([]);
      return;
    }

    const tx = db.transaction([CONFIG.AUDIT_STORE], 'readonly');
    const store = tx.objectStore(CONFIG.AUDIT_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      let entries: AuditLogEntry[] = request.result;

      // Apply filters
      if (filter) {
        if (filter.operation) {
          entries = entries.filter((e) => e.operation === filter.operation);
        }
        if (filter.entityType) {
          entries = entries.filter((e) => e.entityType === filter.entityType);
        }
        if (filter.entityId !== undefined) {
          entries = entries.filter((e) => e.entityId === filter.entityId);
        }
        if (filter.startDate) {
          entries = entries.filter((e) => e.timestamp >= filter.startDate!);
        }
        if (filter.endDate) {
          entries = entries.filter((e) => e.timestamp <= filter.endDate!);
        }
      }

      // Sort by timestamp descending (most recent first)
      entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Apply limit
      if (filter?.limit && entries.length > filter.limit) {
        entries = entries.slice(0, filter.limit);
      }

      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Log a fund modification with change tracking
 */
export async function logFundModification(
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  fund: Fund,
  previousFund?: Fund
): Promise<void> {
  const changes = generateChangeSummary(
    (previousFund as unknown) as Record<string, unknown> | null,
    operation === 'DELETE' ? null : (fund as unknown as Record<string, unknown>)
  );

  await logAuditEntry({
    operation,
    entityType: 'Fund',
    entityId: fund.id ?? null,
    entityName: fund.fundName,
    summary: formatChangeSummary(changes),
    previousValue: previousFund,
    newValue: operation === 'DELETE' ? undefined : fund,
  });
}

/**
 * Log a bulk import operation
 */
export async function logBulkImport(
  entityType: AuditEntityType,
  recordCount: number,
  summary: string
): Promise<void> {
  await logAuditEntry({
    operation: 'IMPORT',
    entityType,
    entityId: null,
    entityName: null,
    summary,
    recordCount,
  });
}

// ===========================
// Dismissed Health Issues Operations
// ===========================

/**
 * Get all dismissed health issues
 */
export function getDismissedHealthIssues(): Promise<DismissedHealthIssue[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    if (!db.objectStoreNames.contains(CONFIG.DISMISSED_ISSUES_STORE)) {
      resolve([]);
      return;
    }

    const tx = db.transaction([CONFIG.DISMISSED_ISSUES_STORE], 'readonly');
    const store = tx.objectStore(CONFIG.DISMISSED_ISSUES_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Dismiss a health check issue (add to dismissed list)
 * Fund IDs are normalized so (1,2) and (2,1) are treated as the same pair
 */
export function dismissHealthIssue(fund1Id: number, fund2Id: number, reason: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    if (!db.objectStoreNames.contains(CONFIG.DISMISSED_ISSUES_STORE)) {
      reject(new Error('Dismissed issues store not available'));
      return;
    }

    // Normalize fund IDs so order doesn't matter
    const normalizedFund1Id = Math.min(fund1Id, fund2Id);
    const normalizedFund2Id = Math.max(fund1Id, fund2Id);

    const dismissedIssue: Omit<DismissedHealthIssue, 'id'> = {
      fund1Id: normalizedFund1Id,
      fund2Id: normalizedFund2Id,
      reason,
      dismissedAt: new Date().toISOString(),
    };

    const tx = db.transaction([CONFIG.DISMISSED_ISSUES_STORE], 'readwrite');
    const store = tx.objectStore(CONFIG.DISMISSED_ISSUES_STORE);
    const request = store.add(dismissedIssue);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Dismiss an individual fund health issue (warning/info)
 * Uses fund1Id for the fund, fund2Id = 0 to distinguish from duplicate pairs
 */
export function dismissFundIssue(fundId: number, category: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    if (!db.objectStoreNames.contains(CONFIG.DISMISSED_ISSUES_STORE)) {
      reject(new Error('Dismissed issues store not available'));
      return;
    }

    const dismissedIssue: Omit<DismissedHealthIssue, 'id'> = {
      fund1Id: fundId,
      fund2Id: 0, // 0 indicates this is a fund issue, not a duplicate pair
      category,
      message,
      reason: `${category}: ${message}`,
      dismissedAt: new Date().toISOString(),
    };

    const tx = db.transaction([CONFIG.DISMISSED_ISSUES_STORE], 'readwrite');
    const store = tx.objectStore(CONFIG.DISMISSED_ISSUES_STORE);
    const request = store.add(dismissedIssue);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

