import { AppState } from '../src/core/state';
import { CONFIG } from '../src/core/config';

describe('CONFIG', () => {
    test('has required database configuration', () => {
        expect(CONFIG.DB_NAME).toBe('FundsDB');
        expect(CONFIG.FUNDS_STORE).toBe('funds');
        expect(CONFIG.FUNDNAMES_STORE).toBe('fundNames');
        expect(CONFIG.GROUPS_STORE).toBe('groups');
        expect(CONFIG.DB_VERSION).toBeGreaterThan(0);
    });

    test('has valid IRR calculation parameters', () => {
        expect(CONFIG.IRR_MAX_ITERATIONS).toBeGreaterThan(0);
        expect(CONFIG.IRR_PRECISION).toBeGreaterThan(0);
        expect(CONFIG.IRR_PRECISION).toBeLessThan(1);
        expect(CONFIG.IRR_MIN_RATE).toBeLessThan(CONFIG.IRR_MAX_RATE);
    });

    test('has valid currency constraints', () => {
        expect(CONFIG.CURRENCY_MIN).toBeLessThan(0);
        expect(CONFIG.CURRENCY_MAX).toBeGreaterThan(0);
        expect(CONFIG.CURRENCY_MIN).toBeLessThan(CONFIG.CURRENCY_MAX);
    });

    test('has valid file size limit', () => {
        expect(CONFIG.MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });

    test('has valid fund name constraints', () => {
        expect(CONFIG.FUND_NAME_MIN_LENGTH).toBeLessThan(CONFIG.FUND_NAME_MAX_LENGTH);
        expect(CONFIG.FUND_NAME_MIN_LENGTH).toBeGreaterThan(0);
    });

    test('has valid date format regex', () => {
        expect(CONFIG.DATE_FORMAT.test('2020-01-01')).toBe(true);
        expect(CONFIG.DATE_FORMAT.test('2020-1-1')).toBe(false);
        expect(CONFIG.DATE_FORMAT.test('01-01-2020')).toBe(false);
    });

    test('has dangerous keys for security', () => {
        expect(CONFIG.DANGEROUS_KEYS).toContain('__proto__');
        expect(CONFIG.DANGEROUS_KEYS).toContain('constructor');
        expect(CONFIG.DANGEROUS_KEYS).toContain('prototype');
    });
});

describe('AppState', () => {
    beforeEach(() => {
        // Reset state before each test
        AppState.setFunds([]);
        AppState.setGroups([]);
        AppState.setUnsavedChanges(false);
        AppState.setSortColumns([]);
        AppState.setCurrentActionFundId(null);
        AppState.setCurrentDetailsFundId(null);
        AppState.clearMetricsCache();
    });

    describe('fund management', () => {
        test('setFunds and getFunds work correctly', () => {
            const funds = [
                { id: 1, fundName: 'Fund A', cashFlows: [], navs: [] },
                { id: 2, fundName: 'Fund B', cashFlows: [], navs: [] }
            ];
            AppState.setFunds(funds);
            expect(AppState.getFunds()).toEqual(funds);
            expect(AppState.currentFunds).toEqual(funds);
        });

        test('setFunds replaces existing funds', () => {
            AppState.setFunds([{ id: 1, fundName: 'Fund A', cashFlows: [], navs: [] }]);
            AppState.setFunds([{ id: 2, fundName: 'Fund B', cashFlows: [], navs: [] }]);
            expect(AppState.getFunds().length).toBe(1);
            expect(AppState.getFunds()[0].fundName).toBe('Fund B');
        });
    });

    describe('group management', () => {
        const testGroups = [
            { id: 1, name: 'Parent', parentGroupId: null },
            { id: 2, name: 'Child 1', parentGroupId: 1 },
            { id: 3, name: 'Child 2', parentGroupId: 1 },
            { id: 4, name: 'Grandchild', parentGroupId: 2 }
        ];

        test('setGroups and getGroups work correctly', () => {
            AppState.setGroups(testGroups);
            expect(AppState.getGroups()).toEqual(testGroups);
        });

        test('getGroupByIdSync returns correct group', () => {
            AppState.setGroups(testGroups);
            expect(AppState.getGroupByIdSync(1)?.name).toBe('Parent');
            expect(AppState.getGroupByIdSync(2)?.name).toBe('Child 1');
            expect(AppState.getGroupByIdSync(999)).toBeUndefined();
        });

        test('getDirectChildIds returns direct children', () => {
            AppState.setGroups(testGroups);
            const children = AppState.getDirectChildIds(1);
            expect(children).toContain(2);
            expect(children).toContain(3);
            expect(children).not.toContain(4);
        });

        test('getAncestorIds returns all ancestors', () => {
            AppState.setGroups(testGroups);
            const ancestors = AppState.getAncestorIds(4);
            expect(ancestors).toContain(4);
            expect(ancestors).toContain(2);
            expect(ancestors).toContain(1);
        });

        test('getAncestorIds uses cache on second call', () => {
            AppState.setGroups(testGroups);
            const first = AppState.getAncestorIds(4);
            const second = AppState.getAncestorIds(4);
            expect(first).toBe(second); // Same reference from cache
        });

        test('getDescendantIds returns all descendants', () => {
            AppState.setGroups(testGroups);
            const descendants = AppState.getDescendantIds(1);
            expect(descendants).toContain(1);
            expect(descendants).toContain(2);
            expect(descendants).toContain(3);
        });

        test('setGroups clears caches', () => {
            AppState.setGroups(testGroups);
            AppState.getAncestorIds(4); // Populate cache
            AppState.setGroups(testGroups); // Should clear cache
            expect(AppState.ancestorCache.size).toBe(0);
        });
    });

    describe('UI state', () => {
        test('setUnsavedChanges updates state', () => {
            expect(AppState.hasUnsavedChanges).toBe(false);
            AppState.setUnsavedChanges(true);
            expect(AppState.hasUnsavedChanges).toBe(true);
        });

        test('setSortColumns updates state', () => {
            const columns = [{ key: 'fundName', direction: 'asc' }];
            AppState.setSortColumns(columns);
            expect(AppState.sortColumns).toEqual(columns);
        });

        test('setCurrentActionFundId updates state', () => {
            AppState.setCurrentActionFundId(123);
            expect(AppState.currentActionFundId).toBe(123);
        });

        test('setCurrentDetailsFundId updates state', () => {
            AppState.setCurrentDetailsFundId(456);
            expect(AppState.currentDetailsFundId).toBe(456);
        });
    });

    describe('metrics cache', () => {
        test('setMetricsCache and getMetricsFromCache work correctly', () => {
            const metrics = { irr: 0.15, moic: 1.5, dpi: 0.5, rvpi: 1.0, tvpi: 1.5, paidIn: 100, distributed: 50, nav: 100 };
            AppState.setMetricsCache(1, '2023-12-31', metrics);
            const cached = AppState.getMetricsFromCache(1, '2023-12-31');
            expect(cached).toEqual(metrics);
        });

        test('getMetricsFromCache returns null for missing entry', () => {
            const cached = AppState.getMetricsFromCache(999, '2023-12-31');
            expect(cached).toBeNull();
        });

        test('clearMetricsCache clears all cached metrics', () => {
            const metrics = { irr: 0.15, moic: 1.5 };
            AppState.setMetricsCache(1, '2023-12-31', metrics);
            AppState.clearMetricsCache();
            const cached = AppState.getMetricsFromCache(1, '2023-12-31');
            expect(cached).toBeNull();
        });
    });

    describe('fund names', () => {
        test('setFundNames updates state', () => {
            const names = new Set(['Fund A', 'Fund B']);
            AppState.setFundNames(names);
            expect(AppState.fundNames).toEqual(names);
        });

        test('setFundNameData updates state', () => {
            const data = new Map([['Fund A', { accountNumber: '123', group: 'Group 1' }]]);
            AppState.setFundNameData(data);
            expect(AppState.fundNameData).toEqual(data);
        });
    });

    describe('abort controller', () => {
        test('setAbortController updates state', () => {
            const controller = new AbortController();
            AppState.setAbortController(controller);
            expect(AppState.abortController).toBe(controller);
        });

        test('setAbortController accepts null', () => {
            AppState.setAbortController(new AbortController());
            AppState.setAbortController(null);
            expect(AppState.abortController).toBeNull();
        });
    });
});
