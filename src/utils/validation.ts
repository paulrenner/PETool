import type { CashFlow, Nav } from '../types';

/**
 * Validation result with optional error message
 */
export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validation result with optional warning message
 */
export interface ValidationWarning {
  valid: boolean;
  warning: string | null;
}

/**
 * Validate date string in YYYY-MM-DD format
 */
export function isValidDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return false;
  }
  // Check that the date components match (catches invalid dates like 2020-02-30)
  const [year, month, day] = dateStr.split('-').map(Number);
  return (
    date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day!
  );
}

/**
 * Validate fund name
 */
export function validateFundName(name: unknown): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Fund name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Fund name too short (min 2 characters)' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Fund name too long (max 100 characters)' };
  }

  return { valid: true, error: null };
}

/**
 * Validate multiplier for duplicate operations
 */
export function validateMultiplier(multiplier: number): ValidationWarning {
  if (typeof multiplier !== 'number' || isNaN(multiplier)) {
    return { valid: false, warning: 'Multiplier must be a number' };
  }

  if (multiplier <= 0) {
    return { valid: false, warning: 'Multiplier must be positive' };
  }

  if (multiplier > 1000) {
    return {
      valid: true,
      warning: `Multiplier of ${multiplier} is very large and will create extremely large amounts`,
    };
  }

  if (multiplier < 0.001) {
    return {
      valid: true,
      warning: `Multiplier of ${multiplier} is very small and may result in rounding to zero`,
    };
  }

  return { valid: true, warning: null };
}

/**
 * Validate file size for import
 */
export function validateFileSize(
  fileSize: number,
  maxSize: number = 50 * 1024 * 1024
): ValidationResult {
  if (fileSize > maxSize) {
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
    const maxMB = (maxSize / 1024 / 1024).toFixed(0);
    return {
      valid: false,
      error: `File too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`,
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate cash flow structure
 */
export function validateCashFlow(cashFlow: unknown, index: number): ValidationResult {
  if (!cashFlow || typeof cashFlow !== 'object') {
    return { valid: false, error: `Invalid cash flow at index ${index}` };
  }

  const cf = cashFlow as Partial<CashFlow>;

  if (!cf.date) {
    return { valid: false, error: `Missing date at index ${index}` };
  }

  if (!isValidDate(cf.date)) {
    return { valid: false, error: `Invalid date format at index ${index}` };
  }

  if (typeof cf.amount === 'undefined') {
    return { valid: false, error: `Missing amount at index ${index}` };
  }

  if (!cf.type) {
    return { valid: false, error: `Missing type at index ${index}` };
  }

  if (!['Contribution', 'Distribution', 'Adjustment'].includes(cf.type)) {
    return { valid: false, error: `Invalid cash flow type at index ${index}` };
  }

  return { valid: true, error: null };
}

/**
 * Validate NAV entry structure
 */
export function validateNavEntry(nav: unknown, index: number): ValidationResult {
  if (!nav || typeof nav !== 'object') {
    return { valid: false, error: `Invalid NAV entry at index ${index}` };
  }

  const n = nav as Partial<Nav>;

  if (!n.date) {
    return { valid: false, error: `Missing date at index ${index}` };
  }

  if (!isValidDate(n.date)) {
    return { valid: false, error: `Invalid date format at index ${index}` };
  }

  if (typeof n.amount === 'undefined') {
    return { valid: false, error: `Missing amount at index ${index}` };
  }

  return { valid: true, error: null };
}
