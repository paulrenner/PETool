import type { Fund, FundNameData, Group } from '../types';
import { CONFIG } from './config';

// Database instance
let db: IDBDatabase | null = null;
let dbReady = false;

/**
 * Initialize IndexedDB database
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      dbReady = true;
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

      console.log(`Database upgrade from v${oldVersion} to v${CONFIG.DB_VERSION}`);

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

/**
 * Check if database is ready
 */
export function isDBReady(): boolean {
  return dbReady;
}

/**
 * Get database instance
 */
export function getDB(): IDBDatabase | null {
  return db;
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

export function saveFundToDB(fundData: Fund): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction([CONFIG.FUNDS_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.FUNDS_STORE);

    let request: IDBRequest<IDBValidKey>;
    if (fundData.id) {
      request = objectStore.put(fundData);
    } else {
      const { id: _, ...dataWithoutId } = fundData;
      request = objectStore.add(dataWithoutId);
    }

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
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

  // Try parsing as a Date object as fallback
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Return original if we can't parse it
  console.warn('Could not normalize date:', dateInput);
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

    const tx = db.transaction([CONFIG.FUNDS_STORE], 'readwrite');
    const objectStore = tx.objectStore(CONFIG.FUNDS_STORE);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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

    request.onsuccess = () => resolve();
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

    request.onsuccess = () => resolve();
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

    request.onsuccess = () => resolve(request.result as number);
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

    request.onsuccess = () => resolve();
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
    const storeNames = [CONFIG.FUNDS_STORE, CONFIG.FUNDNAMES_STORE, CONFIG.GROUPS_STORE];

    storeNames.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => {
        completed++;
        if (completed === storeNames.length) {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}
