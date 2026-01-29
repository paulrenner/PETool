/**
 * Application configuration constants
 */
export const CONFIG = {
  // Database
  DB_NAME: 'FundsDB',
  FUNDS_STORE: 'funds',
  FUNDNAMES_STORE: 'fundNames',
  GROUPS_STORE: 'groups',
  AUDIT_STORE: 'auditLog',
  DISMISSED_ISSUES_STORE: 'dismissedHealthIssues',
  DB_VERSION: 12,

  // Currency formatting
  CURRENCY_FORMAT: 'en-US',
  CURRENCY_CODE: 'USD',
  CURRENCY_MIN: -1e12,
  CURRENCY_MAX: 1e12,

  // IRR calculation
  IRR_MAX_ITERATIONS: 1000,
  IRR_PRECISION: 1e-6,
  IRR_GUESS: 0.1,
  IRR_MIN_RATE: -0.99,
  IRR_MAX_RATE: 10.0,
  IRR_MIN_DAYS: 30, // Minimum days between first and last cash flow for meaningful IRR

  // Date format validation
  DATE_FORMAT: /^\d{4}-\d{2}-\d{2}$/,

  // Debounce delays (ms)
  DEBOUNCE_FILTER: 300,
  DEBOUNCE_SEARCH: 300,
  DEBOUNCE_INPUT: 300,

  // UI constraints
  MIN_COLUMN_WIDTH: 50,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  FUND_NAME_MIN_LENGTH: 2,
  FUND_NAME_MAX_LENGTH: 100,

  // Performance
  METRICS_CACHE_TTL: 5000, // 5 seconds
  LAZY_RENDER_TIMELINE: true, // Only render timeline when expanded
  TABLE_LOADING_DELAY: 150, // Show loading indicator after this delay (ms)

  // Validation & Security
  ALLOWED_FUND_NAME_PATTERN: /^[a-zA-Z0-9\s\-_.,&']+$/,
  MAX_IMPORT_FUNDS: 10000,
  MAX_IMPORT_GROUPS: 1000,
  MAX_IMPORT_FUNDNAMES: 5000,
  MAX_JSON_DEPTH: 10,
  DANGEROUS_KEYS: ['__proto__', 'constructor', 'prototype'] as const,

  // LocalStorage keys
  STORAGE_COLUMN_WIDTHS: 'columnWidths',
  STORAGE_SHOW_TAGS: 'showTags',
  STORAGE_GROUP_BY_FUND: 'groupByFund',
  STORAGE_MASK_ACCOUNTS: 'maskAccounts',
  STORAGE_BACKUP_WARNING: 'backupWarningShown',
  STORAGE_LAST_BACKUP: 'lastBackupDate',

  // Backup reminder
  BACKUP_REMINDER_DAYS: 30,
} as const;

export type Config = typeof CONFIG;
