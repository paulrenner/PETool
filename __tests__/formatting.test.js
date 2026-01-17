import {
    parseCurrency,
    formatNumberWithCommas,
    formatCurrency,
    formatNumber,
    escapeHtml,
    escapeCSV
} from '../src/formatting.js';

describe('parseCurrency', () => {
    test('parses plain number', () => {
        expect(parseCurrency(1000)).toBe(1000);
        expect(parseCurrency(1000.50)).toBe(1000.50);
    });

    test('parses currency string with dollar sign', () => {
        expect(parseCurrency('$1000')).toBe(1000);
        expect(parseCurrency('$1,000.50')).toBe(1000.50);
    });

    test('parses string with commas', () => {
        expect(parseCurrency('1,000')).toBe(1000);
        expect(parseCurrency('10,000,000')).toBe(10000000);
    });

    test('parses negative numbers in parentheses', () => {
        expect(parseCurrency('($1000)')).toBe(-1000);
        expect(parseCurrency('($1,000.50)')).toBe(-1000.50);
    });

    test('handles whitespace', () => {
        expect(parseCurrency('  $1000  ')).toBe(1000);
        expect(parseCurrency(' 1,000.50 ')).toBe(1000.50);
    });

    test('returns NaN for null or undefined', () => {
        expect(parseCurrency(null)).toBeNaN();
        expect(parseCurrency(undefined)).toBeNaN();
    });

    test('returns NaN for empty string', () => {
        expect(parseCurrency('')).toBeNaN();
        expect(parseCurrency('   ')).toBeNaN();
    });

    test('returns NaN for non-numeric string', () => {
        expect(parseCurrency('abc')).toBeNaN();
        expect(parseCurrency('N/A')).toBeNaN();
    });

    test('returns NaN for Infinity', () => {
        expect(parseCurrency(Infinity)).toBeNaN();
        expect(parseCurrency(-Infinity)).toBeNaN();
    });

    test('handles decimal numbers correctly', () => {
        expect(parseCurrency('0.5')).toBe(0.5);
        expect(parseCurrency('$0.01')).toBe(0.01);
    });

    test('parses zero correctly', () => {
        expect(parseCurrency(0)).toBe(0);
        expect(parseCurrency('$0')).toBe(0);
        expect(parseCurrency('0.00')).toBe(0);
    });
});

describe('formatNumberWithCommas', () => {
    test('formats integer with commas', () => {
        expect(formatNumberWithCommas(1000)).toBe('1,000');
        expect(formatNumberWithCommas(1000000)).toBe('1,000,000');
    });

    test('formats decimal with commas', () => {
        expect(formatNumberWithCommas(1000.50)).toBe('1,000.5');
        expect(formatNumberWithCommas(1234567.89)).toBe('1,234,567.89');
    });

    test('does not add commas to small numbers', () => {
        expect(formatNumberWithCommas(100)).toBe('100');
        expect(formatNumberWithCommas(99.99)).toBe('99.99');
    });

    test('handles zero', () => {
        expect(formatNumberWithCommas(0)).toBe('0');
    });

    test('returns empty string for null, undefined, or NaN', () => {
        expect(formatNumberWithCommas(null)).toBe('');
        expect(formatNumberWithCommas(undefined)).toBe('');
        expect(formatNumberWithCommas(NaN)).toBe('');
    });

    test('handles negative numbers', () => {
        expect(formatNumberWithCommas(-1000)).toBe('-1,000');
        expect(formatNumberWithCommas(-1234567.89)).toBe('-1,234,567.89');
    });
});

describe('formatCurrency', () => {
    test('formats as USD currency without cents by default', () => {
        expect(formatCurrency(1000)).toBe('$1,000');
        expect(formatCurrency(1000000)).toBe('$1,000,000');
    });

    test('shows cents when showCents is true', () => {
        expect(formatCurrency(1000, true)).toBe('$1,000.00');
        expect(formatCurrency(1000.50, true)).toBe('$1,000.50');
    });

    test('rounds to nearest dollar when showCents is false', () => {
        expect(formatCurrency(1000.49)).toBe('$1,000');
        expect(formatCurrency(1000.50)).toBe('$1,001');
    });

    test('handles zero', () => {
        expect(formatCurrency(0)).toBe('$0');
        expect(formatCurrency(0, true)).toBe('$0.00');
    });

    test('handles negative numbers', () => {
        expect(formatCurrency(-1000)).toBe('-$1,000');
        expect(formatCurrency(-1000.50, true)).toBe('-$1,000.50');
    });

    test('returns $0 for NaN or Infinity', () => {
        expect(formatCurrency(NaN)).toBe('$0');
        expect(formatCurrency(Infinity)).toBe('$0');
        expect(formatCurrency(-Infinity)).toBe('$0');
    });

    test('handles very large numbers', () => {
        expect(formatCurrency(1000000000)).toBe('$1,000,000,000');
    });

    test('handles very small numbers', () => {
        expect(formatCurrency(0.01, true)).toBe('$0.01');
        expect(formatCurrency(0.001, true)).toBe('$0.00');
    });
});

describe('formatNumber', () => {
    test('formats number with 2 decimal places', () => {
        expect(formatNumber(1000)).toBe('1000.00');
        expect(formatNumber(1234.5)).toBe('1234.50');
    });

    test('handles zero', () => {
        expect(formatNumber(0)).toBe('0.00');
    });

    test('returns 0 for NaN or Infinity', () => {
        expect(formatNumber(NaN)).toBe('0');
        expect(formatNumber(Infinity)).toBe('0');
        expect(formatNumber(-Infinity)).toBe('0');
    });

    test('handles negative numbers', () => {
        expect(formatNumber(-1234.56)).toBe('-1234.56');
    });

    test('rounds to 2 decimal places', () => {
        expect(formatNumber(1.234)).toBe('1.23');
        expect(formatNumber(1.235)).toBe('1.24');
    });
});

describe('escapeHtml', () => {
    test('escapes special HTML characters', () => {
        expect(escapeHtml('<script>alert("xss")</script>'))
            .toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    test('escapes ampersand', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('does not escape quotes (textContent behavior)', () => {
        // textContent doesn't escape quotes, only innerHTML does
        expect(escapeHtml('"quoted"')).toBe('"quoted"');
    });

    test('returns empty string for non-string input', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(123)).toBe('');
    });

    test('handles plain text without special characters', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });
});

describe('escapeCSV', () => {
    test('escapes value with comma', () => {
        expect(escapeCSV('Hello, World')).toBe('"Hello, World"');
    });

    test('escapes value with double quote', () => {
        expect(escapeCSV('Say "Hello"')).toBe('"Say ""Hello"""');
    });

    test('escapes value with newline', () => {
        expect(escapeCSV('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    test('does not escape simple values', () => {
        expect(escapeCSV('Hello World')).toBe('Hello World');
        expect(escapeCSV('12345')).toBe('12345');
    });

    test('returns empty string for null or undefined', () => {
        expect(escapeCSV(null)).toBe('');
        expect(escapeCSV(undefined)).toBe('');
    });

    test('converts numbers to strings', () => {
        expect(escapeCSV(123)).toBe('123');
        expect(escapeCSV(1.23)).toBe('1.23');
    });

    test('handles multiple special characters', () => {
        expect(escapeCSV('Hello, "World"\nNew Line'))
            .toBe('"Hello, ""World""\nNew Line"');
    });

    test('handles empty string', () => {
        expect(escapeCSV('')).toBe('');
    });
});
