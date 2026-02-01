import { isValidDate } from '../src/utils/validation';

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
