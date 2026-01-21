import {
    Formatter,
    formatNumberWithCommas,
    formatIRR,
    formatMOIC,
    formatDateDisplay
} from '../src/ui/formatter';
import { Storage } from '../src/ui/storage';

describe('Formatter', () => {
    describe('number()', () => {
        test('formats basic numbers', () => {
            expect(Formatter.number(1234)).toBe('1,234');
            expect(Formatter.number(1000000)).toBe('1,000,000');
        });

        test('handles null and undefined', () => {
            expect(Formatter.number(null)).toBe('N/A');
            expect(Formatter.number(undefined)).toBe('N/A');
        });

        test('handles NaN', () => {
            expect(Formatter.number(NaN)).toBe('N/A');
        });

        test('respects decimals option', () => {
            expect(Formatter.number(1234.567, { decimals: 2 })).toBe('1,234.57');
            expect(Formatter.number(1234, { decimals: 2 })).toBe('1,234.00');
        });

        test('respects prefix option', () => {
            expect(Formatter.number(1234, { prefix: '$' })).toBe('$1,234');
            expect(Formatter.number(1234, { prefix: '€' })).toBe('€1,234');
        });

        test('respects suffix option', () => {
            expect(Formatter.number(1234, { suffix: '%' })).toBe('1,234%');
            expect(Formatter.number(1.5, { suffix: 'x', decimals: 2 })).toBe('1.50x');
        });

        test('respects showSign option', () => {
            expect(Formatter.number(100, { showSign: true })).toBe('+100');
            expect(Formatter.number(-100, { showSign: true })).toBe('-100');
            expect(Formatter.number(0, { showSign: true })).toBe('0');
        });

        test('respects useCommas option', () => {
            expect(Formatter.number(1234567, { useCommas: false })).toBe('1234567');
            expect(Formatter.number(1234.56, { useCommas: false, decimals: 2 })).toBe('1234.56');
        });

        test('respects custom fallback', () => {
            expect(Formatter.number(null, { fallback: '-' })).toBe('-');
            expect(Formatter.number(undefined, { fallback: 'N/A' })).toBe('N/A');
        });

        test('combines multiple options', () => {
            expect(Formatter.number(1234.5, { prefix: '$', suffix: ' USD', decimals: 2 })).toBe('$1,234.50 USD');
        });
    });

    describe('currency()', () => {
        test('formats currency with dollar sign', () => {
            expect(Formatter.currency(1234)).toBe('$1,234');
            expect(Formatter.currency(1000000)).toBe('$1,000,000');
        });

        test('handles null with $0 fallback', () => {
            expect(Formatter.currency(null)).toBe('$0');
            expect(Formatter.currency(undefined)).toBe('$0');
        });

        test('handles negative values', () => {
            expect(Formatter.currency(-1234)).toBe('$-1,234');
        });

        test('handles zero', () => {
            expect(Formatter.currency(0)).toBe('$0');
        });
    });

    describe('percent()', () => {
        test('formats decimal as percentage', () => {
            expect(Formatter.percent(0.15)).toBe('15.0%');
            expect(Formatter.percent(0.1234)).toBe('12.3%');
            expect(Formatter.percent(1.0)).toBe('100.0%');
        });

        test('handles null and undefined', () => {
            expect(Formatter.percent(null)).toBe('N/A');
            expect(Formatter.percent(undefined)).toBe('N/A');
        });

        test('handles negative percentages', () => {
            expect(Formatter.percent(-0.15)).toBe('-15.0%');
        });

        test('handles zero', () => {
            expect(Formatter.percent(0)).toBe('0.0%');
        });
    });

    describe('multiple()', () => {
        test('formats multiple with x suffix', () => {
            expect(Formatter.multiple(1.5)).toBe('1.50x');
            expect(Formatter.multiple(2.0)).toBe('2.00x');
            expect(Formatter.multiple(0.75)).toBe('0.75x');
        });

        test('handles null and undefined', () => {
            expect(Formatter.multiple(null)).toBe('N/A');
            expect(Formatter.multiple(undefined)).toBe('N/A');
        });
    });
});

describe('formatNumberWithCommas', () => {
    test('formats integers with commas', () => {
        expect(formatNumberWithCommas(1000)).toBe('1,000');
        expect(formatNumberWithCommas(1000000)).toBe('1,000,000');
        expect(formatNumberWithCommas(123456789)).toBe('123,456,789');
    });

    test('preserves decimal places', () => {
        expect(formatNumberWithCommas(1234.56)).toBe('1,234.56');
        expect(formatNumberWithCommas(1000000.99)).toBe('1,000,000.99');
    });

    test('handles small numbers', () => {
        expect(formatNumberWithCommas(999)).toBe('999');
        expect(formatNumberWithCommas(99)).toBe('99');
        expect(formatNumberWithCommas(0)).toBe('0');
    });

    test('handles negative numbers', () => {
        expect(formatNumberWithCommas(-1234)).toBe('-1,234');
        expect(formatNumberWithCommas(-1000000)).toBe('-1,000,000');
    });

    test('handles null and undefined', () => {
        expect(formatNumberWithCommas(null)).toBe('');
        expect(formatNumberWithCommas(undefined)).toBe('');
    });

    test('handles NaN', () => {
        expect(formatNumberWithCommas(NaN)).toBe('');
    });
});

describe('formatIRR', () => {
    test('formats IRR as percentage', () => {
        expect(formatIRR(0.15)).toBe('15.0%');
        expect(formatIRR(0.2)).toBe('20.0%');
        expect(formatIRR(0.1234)).toBe('12.3%');
    });

    test('handles negative IRR', () => {
        expect(formatIRR(-0.15)).toBe('-15.0%');
    });

    test('handles zero IRR', () => {
        expect(formatIRR(0)).toBe('0.0%');
    });

    test('handles null and undefined', () => {
        expect(formatIRR(null)).toBe('N/A');
        expect(formatIRR(undefined)).toBe('N/A');
    });

    test('handles large IRR values', () => {
        expect(formatIRR(1.5)).toBe('150.0%');
        expect(formatIRR(2.0)).toBe('200.0%');
    });
});

describe('formatMOIC', () => {
    test('formats MOIC with x suffix', () => {
        expect(formatMOIC(1.5)).toBe('1.50x');
        expect(formatMOIC(2.0)).toBe('2.00x');
        expect(formatMOIC(1.234)).toBe('1.23x');
    });

    test('handles values less than 1', () => {
        expect(formatMOIC(0.75)).toBe('0.75x');
        expect(formatMOIC(0.5)).toBe('0.50x');
    });

    test('handles null and undefined', () => {
        expect(formatMOIC(null)).toBe('N/A');
        expect(formatMOIC(undefined)).toBe('N/A');
    });

    test('handles zero', () => {
        expect(formatMOIC(0)).toBe('0.00x');
    });
});

describe('formatDateDisplay', () => {
    test('converts YYYY-MM-DD to MM/DD/YYYY', () => {
        expect(formatDateDisplay('2023-12-31')).toBe('12/31/2023');
        expect(formatDateDisplay('2020-01-01')).toBe('01/01/2020');
        expect(formatDateDisplay('2021-06-15')).toBe('06/15/2021');
    });

    test('handles null and undefined', () => {
        expect(formatDateDisplay(null)).toBe('N/A');
        expect(formatDateDisplay(undefined)).toBe('N/A');
    });

    test('handles empty string', () => {
        expect(formatDateDisplay('')).toBe('N/A');
    });
});

describe('Storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('get()', () => {
        test('returns parsed JSON from localStorage', () => {
            localStorage.setItem('testKey', JSON.stringify({ foo: 'bar' }));
            expect(Storage.get('testKey')).toEqual({ foo: 'bar' });
        });

        test('returns default value when key does not exist', () => {
            expect(Storage.get('nonexistent', 'default')).toBe('default');
            expect(Storage.get('nonexistent')).toBeNull();
        });

        test('returns default value for invalid JSON', () => {
            localStorage.setItem('badJson', 'not valid json');
            expect(Storage.get('badJson', 'fallback')).toBe('fallback');
        });

        test('handles various data types', () => {
            localStorage.setItem('string', JSON.stringify('hello'));
            localStorage.setItem('number', JSON.stringify(42));
            localStorage.setItem('array', JSON.stringify([1, 2, 3]));
            localStorage.setItem('boolean', JSON.stringify(true));

            expect(Storage.get('string')).toBe('hello');
            expect(Storage.get('number')).toBe(42);
            expect(Storage.get('array')).toEqual([1, 2, 3]);
            expect(Storage.get('boolean')).toBe(true);
        });
    });

    describe('set()', () => {
        test('stores value as JSON in localStorage', () => {
            Storage.set('testKey', { foo: 'bar' });
            expect(localStorage.getItem('testKey')).toBe('{"foo":"bar"}');
        });

        test('returns true on success', () => {
            expect(Storage.set('testKey', 'value')).toBe(true);
        });

        test('handles various data types', () => {
            Storage.set('string', 'hello');
            Storage.set('number', 42);
            Storage.set('array', [1, 2, 3]);
            Storage.set('object', { a: 1 });
            Storage.set('boolean', true);
            Storage.set('null', null);

            expect(JSON.parse(localStorage.getItem('string'))).toBe('hello');
            expect(JSON.parse(localStorage.getItem('number'))).toBe(42);
            expect(JSON.parse(localStorage.getItem('array'))).toEqual([1, 2, 3]);
            expect(JSON.parse(localStorage.getItem('object'))).toEqual({ a: 1 });
            expect(JSON.parse(localStorage.getItem('boolean'))).toBe(true);
            expect(JSON.parse(localStorage.getItem('null'))).toBeNull();
        });
    });

    describe('remove()', () => {
        test('removes item from localStorage', () => {
            localStorage.setItem('testKey', 'value');
            Storage.remove('testKey');
            expect(localStorage.getItem('testKey')).toBeNull();
        });

        test('returns true on success', () => {
            localStorage.setItem('testKey', 'value');
            expect(Storage.remove('testKey')).toBe(true);
        });

        test('returns true even if key does not exist', () => {
            expect(Storage.remove('nonexistent')).toBe(true);
        });
    });
});
