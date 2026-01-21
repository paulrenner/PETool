import { escapeCSV, escapeAttribute, escapeHtml } from '../src/utils/escaping';

describe('escapeCSV', () => {
    test('returns empty string for null', () => {
        expect(escapeCSV(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(escapeCSV(undefined)).toBe('');
    });

    test('returns string unchanged if no special characters', () => {
        expect(escapeCSV('Hello World')).toBe('Hello World');
        expect(escapeCSV('Fund Name 123')).toBe('Fund Name 123');
    });

    test('wraps string with commas in quotes', () => {
        expect(escapeCSV('Hello, World')).toBe('"Hello, World"');
        expect(escapeCSV('First, Second, Third')).toBe('"First, Second, Third"');
    });

    test('wraps string with newlines in quotes', () => {
        expect(escapeCSV('Hello\nWorld')).toBe('"Hello\nWorld"');
    });

    test('escapes and wraps strings with quotes', () => {
        expect(escapeCSV('He said "Hello"')).toBe('"He said ""Hello"""');
    });

    test('handles strings with multiple special characters', () => {
        expect(escapeCSV('Hello, "World"\nNew Line')).toBe('"Hello, ""World""\nNew Line"');
    });

    test('converts numbers to strings', () => {
        expect(escapeCSV(12345)).toBe('12345');
        expect(escapeCSV(123.45)).toBe('123.45');
    });

    test('converts boolean to string', () => {
        expect(escapeCSV(true)).toBe('true');
        expect(escapeCSV(false)).toBe('false');
    });

    test('handles zero correctly', () => {
        expect(escapeCSV(0)).toBe('0');
    });
});

describe('escapeAttribute', () => {
    test('returns empty string for non-string input', () => {
        expect(escapeAttribute(null)).toBe('');
        expect(escapeAttribute(undefined)).toBe('');
        expect(escapeAttribute(123)).toBe('');
        expect(escapeAttribute({})).toBe('');
    });

    test('returns string unchanged if no special characters', () => {
        expect(escapeAttribute('Hello World')).toBe('Hello World');
        expect(escapeAttribute('FundName123')).toBe('FundName123');
    });

    test('escapes ampersands', () => {
        expect(escapeAttribute('Tom & Jerry')).toBe('Tom &amp; Jerry');
        expect(escapeAttribute('A & B & C')).toBe('A &amp; B &amp; C');
    });

    test('escapes double quotes', () => {
        expect(escapeAttribute('Say "Hello"')).toBe('Say &quot;Hello&quot;');
    });

    test('escapes single quotes', () => {
        expect(escapeAttribute("It's working")).toBe('It&#39;s working');
    });

    test('escapes less than sign', () => {
        expect(escapeAttribute('a < b')).toBe('a &lt; b');
        expect(escapeAttribute('<script>')).toBe('&lt;script&gt;');
    });

    test('escapes greater than sign', () => {
        expect(escapeAttribute('a > b')).toBe('a &gt; b');
    });

    test('handles multiple special characters', () => {
        expect(escapeAttribute('<a href="test">Click & Go</a>')).toBe(
            '&lt;a href=&quot;test&quot;&gt;Click &amp; Go&lt;/a&gt;'
        );
    });

    test('handles empty string', () => {
        expect(escapeAttribute('')).toBe('');
    });
});

describe('escapeHtml', () => {
    test('returns empty string for non-string input', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(123)).toBe('');
        expect(escapeHtml({})).toBe('');
    });

    test('returns string unchanged if no special characters', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    test('escapes HTML special characters', () => {
        expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
            '&lt;script&gt;alert("XSS")&lt;/script&gt;'
        );
    });

    test('escapes ampersands', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});
