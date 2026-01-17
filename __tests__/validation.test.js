import {
    isValidDate,
    validateFundName,
    validateMultiplier,
    validateFileSize,
    validateCashFlow,
    validateNavEntry
} from '../src/validation.js';

describe('isValidDate', () => {
    test('returns true for valid date in YYYY-MM-DD format', () => {
        expect(isValidDate('2020-01-01')).toBe(true);
        expect(isValidDate('2021-12-31')).toBe(true);
        expect(isValidDate('2019-06-15')).toBe(true);
    });

    test('returns false for invalid format', () => {
        expect(isValidDate('01/01/2020')).toBe(false);
        expect(isValidDate('2020-1-1')).toBe(false);
        expect(isValidDate('20-01-01')).toBe(false);
        expect(isValidDate('2020/01/01')).toBe(false);
    });

    test('returns false for invalid dates', () => {
        expect(isValidDate('2020-13-01')).toBe(false); // Invalid month
        expect(isValidDate('2020-02-30')).toBe(false); // Invalid day
        expect(isValidDate('2020-00-01')).toBe(false); // Invalid month
    });

    test('returns false for non-string input', () => {
        expect(isValidDate(123)).toBe(false);
        expect(isValidDate(null)).toBe(false);
        expect(isValidDate(undefined)).toBe(false);
        expect(isValidDate({})).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isValidDate('')).toBe(false);
    });
});

describe('validateFundName', () => {
    test('returns valid for proper fund name', () => {
        const result = validateFundName('ABC Capital Fund I');
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    test('returns invalid for empty string', () => {
        const result = validateFundName('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Fund name is required');
    });

    test('returns invalid for null or undefined', () => {
        expect(validateFundName(null).valid).toBe(false);
        expect(validateFundName(undefined).valid).toBe(false);
    });

    test('returns invalid for too short name', () => {
        const result = validateFundName('A');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too short');
    });

    test('returns invalid for too long name', () => {
        const longName = 'A'.repeat(101);
        const result = validateFundName(longName);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too long');
    });

    test('accepts exactly 2 characters', () => {
        const result = validateFundName('AB');
        expect(result.valid).toBe(true);
    });

    test('accepts exactly 100 characters', () => {
        const name = 'A'.repeat(100);
        const result = validateFundName(name);
        expect(result.valid).toBe(true);
    });

    test('trims whitespace', () => {
        const result = validateFundName('  Valid Name  ');
        expect(result.valid).toBe(true);
    });
});

describe('validateMultiplier', () => {
    test('returns valid for reasonable multiplier', () => {
        const result = validateMultiplier(2);
        expect(result.valid).toBe(true);
        expect(result.warning).toBeNull();
    });

    test('returns invalid for zero', () => {
        const result = validateMultiplier(0);
        expect(result.valid).toBe(false);
        expect(result.warning).toContain('positive');
    });

    test('returns invalid for negative number', () => {
        const result = validateMultiplier(-1);
        expect(result.valid).toBe(false);
        expect(result.warning).toContain('positive');
    });

    test('returns invalid for NaN', () => {
        const result = validateMultiplier(NaN);
        expect(result.valid).toBe(false);
    });

    test('returns valid with warning for very large multiplier', () => {
        const result = validateMultiplier(1500);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('very large');
    });

    test('returns valid with warning for very small multiplier', () => {
        const result = validateMultiplier(0.0001);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('very small');
    });

    test('accepts exactly 1000', () => {
        const result = validateMultiplier(1000);
        expect(result.valid).toBe(true);
        expect(result.warning).toBeNull();
    });

    test('accepts exactly 0.001', () => {
        const result = validateMultiplier(0.001);
        expect(result.valid).toBe(true);
        expect(result.warning).toBeNull();
    });
});

describe('validateFileSize', () => {
    test('returns valid for file under limit', () => {
        const result = validateFileSize(1024 * 1024); // 1MB
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    test('returns invalid for file over default limit (50MB)', () => {
        const result = validateFileSize(51 * 1024 * 1024); // 51MB
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too large');
    });

    test('accepts custom max size', () => {
        const result = validateFileSize(10 * 1024 * 1024, 5 * 1024 * 1024); // 10MB file, 5MB limit
        expect(result.valid).toBe(false);
    });

    test('accepts file at exactly the limit', () => {
        const result = validateFileSize(50 * 1024 * 1024); // Exactly 50MB
        expect(result.valid).toBe(true);
    });

    test('shows file size in error message', () => {
        const result = validateFileSize(100 * 1024 * 1024); // 100MB
        expect(result.error).toContain('100.00MB');
    });
});

describe('validateCashFlow', () => {
    test('returns valid for proper cash flow', () => {
        const cashFlow = {
            date: '2020-01-01',
            amount: -1000,
            type: 'Contribution'
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    test('returns invalid for null cash flow', () => {
        const result = validateCashFlow(null, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid cash flow');
    });

    test('returns invalid for missing date', () => {
        const cashFlow = {
            amount: -1000,
            type: 'Contribution'
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing date');
    });

    test('returns invalid for invalid date format', () => {
        const cashFlow = {
            date: '01/01/2020',
            amount: -1000,
            type: 'Contribution'
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid date format');
    });

    test('returns invalid for missing amount', () => {
        const cashFlow = {
            date: '2020-01-01',
            type: 'Contribution'
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing amount');
    });

    test('returns invalid for missing type', () => {
        const cashFlow = {
            date: '2020-01-01',
            amount: -1000
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing type');
    });

    test('returns invalid for invalid type', () => {
        const cashFlow = {
            date: '2020-01-01',
            amount: -1000,
            type: 'Investment'
        };
        const result = validateCashFlow(cashFlow, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid cash flow type');
    });

    test('accepts both Contribution and Distribution types', () => {
        const contribution = {
            date: '2020-01-01',
            amount: -1000,
            type: 'Contribution'
        };
        const distribution = {
            date: '2020-01-01',
            amount: 1000,
            type: 'Distribution'
        };
        expect(validateCashFlow(contribution, 0).valid).toBe(true);
        expect(validateCashFlow(distribution, 0).valid).toBe(true);
    });

    test('includes index in error messages', () => {
        const cashFlow = { date: '2020-01-01', amount: -1000 };
        const result = validateCashFlow(cashFlow, 5);
        expect(result.error).toContain('index 5');
    });
});

describe('validateNavEntry', () => {
    test('returns valid for proper NAV entry', () => {
        const nav = {
            date: '2020-12-31',
            amount: 1500
        };
        const result = validateNavEntry(nav, 0);
        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
    });

    test('returns invalid for null NAV entry', () => {
        const result = validateNavEntry(null, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid NAV entry');
    });

    test('returns invalid for missing date', () => {
        const nav = {
            amount: 1500
        };
        const result = validateNavEntry(nav, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing date');
    });

    test('returns invalid for invalid date format', () => {
        const nav = {
            date: '12/31/2020',
            amount: 1500
        };
        const result = validateNavEntry(nav, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid date format');
    });

    test('returns invalid for missing amount', () => {
        const nav = {
            date: '2020-12-31'
        };
        const result = validateNavEntry(nav, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing amount');
    });

    test('accepts zero amount', () => {
        const nav = {
            date: '2020-12-31',
            amount: 0
        };
        const result = validateNavEntry(nav, 0);
        expect(result.valid).toBe(true);
    });

    test('includes index in error messages', () => {
        const nav = { date: '2020-12-31' };
        const result = validateNavEntry(nav, 3);
        expect(result.error).toContain('index 3');
    });
});
