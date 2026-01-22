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
  // Use UTC methods to avoid timezone issues
  // new Date("2021-08-01") is parsed as UTC, so we must use getUTC* methods
  const date = new Date(dateStr + 'T00:00:00');
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

/**
 * Validation errors collection
 */
export interface FundValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a fund before saving to database
 *
 * This ensures data integrity by checking:
 * - Required fields are present
 * - Numeric values are valid (not NaN, Infinity)
 * - Dates are in correct format
 * - Cash flow types are valid
 *
 * IMPORTANT: This validation prevents financial data corruption.
 * Invalid data should NEVER be persisted to the database.
 */
export function validateFund(fund: unknown): FundValidationResult {
  const errors: string[] = [];

  if (!fund || typeof fund !== 'object') {
    return { valid: false, errors: ['Fund data is required'] };
  }

  const f = fund as Record<string, unknown>;

  // Required string fields
  if (!f.fundName || typeof f.fundName !== 'string' || !f.fundName.trim()) {
    errors.push('Fund name is required');
  }

  if (!f.accountNumber || typeof f.accountNumber !== 'string' || !f.accountNumber.trim()) {
    errors.push('Account number is required');
  }

  // Commitment validation (critical for financial calculations)
  if (typeof f.commitment !== 'number') {
    errors.push('Commitment must be a number');
  } else if (isNaN(f.commitment)) {
    errors.push('Commitment is NaN (invalid number)');
  } else if (!isFinite(f.commitment)) {
    errors.push('Commitment must be a finite number');
  } else if (f.commitment < 0) {
    errors.push('Commitment cannot be negative');
  }

  // Cash flows validation
  if (f.cashFlows !== undefined) {
    if (!Array.isArray(f.cashFlows)) {
      errors.push('Cash flows must be an array');
    } else {
      f.cashFlows.forEach((cf: unknown, i: number) => {
        if (!cf || typeof cf !== 'object') {
          errors.push(`Cash flow at index ${i} is invalid`);
          return;
        }

        const cashFlow = cf as Record<string, unknown>;

        // Amount validation (critical - prevents NaN corruption)
        if (typeof cashFlow.amount !== 'number') {
          errors.push(`Cash flow ${i}: amount must be a number`);
        } else if (isNaN(cashFlow.amount)) {
          errors.push(`Cash flow ${i}: amount is NaN (invalid number)`);
        } else if (!isFinite(cashFlow.amount)) {
          errors.push(`Cash flow ${i}: amount must be finite`);
        }

        // Date validation
        if (!cashFlow.date || typeof cashFlow.date !== 'string') {
          errors.push(`Cash flow ${i}: date is required`);
        } else if (!isValidDate(cashFlow.date)) {
          errors.push(`Cash flow ${i}: invalid date format (expected YYYY-MM-DD)`);
        }

        // Type validation
        if (!cashFlow.type) {
          errors.push(`Cash flow ${i}: type is required`);
        } else if (!['Contribution', 'Distribution', 'Adjustment'].includes(cashFlow.type as string)) {
          errors.push(`Cash flow ${i}: invalid type "${cashFlow.type}"`);
        }
      });
    }
  }

  // NAV entries validation
  if (f.monthlyNav !== undefined) {
    if (!Array.isArray(f.monthlyNav)) {
      errors.push('Monthly NAV must be an array');
    } else {
      f.monthlyNav.forEach((nav: unknown, i: number) => {
        if (!nav || typeof nav !== 'object') {
          errors.push(`NAV entry at index ${i} is invalid`);
          return;
        }

        const navEntry = nav as Record<string, unknown>;

        // Amount validation
        if (typeof navEntry.amount !== 'number') {
          errors.push(`NAV ${i}: amount must be a number`);
        } else if (isNaN(navEntry.amount)) {
          errors.push(`NAV ${i}: amount is NaN (invalid number)`);
        } else if (!isFinite(navEntry.amount)) {
          errors.push(`NAV ${i}: amount must be finite`);
        }

        // Date validation
        if (!navEntry.date || typeof navEntry.date !== 'string') {
          errors.push(`NAV ${i}: date is required`);
        } else if (!isValidDate(navEntry.date)) {
          errors.push(`NAV ${i}: invalid date format (expected YYYY-MM-DD)`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
