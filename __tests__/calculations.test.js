import {
    calculateIRR,
    calculateMOIC,
    getVintageYear,
    getTotalByType,
    parseCashFlowsForIRR,
    calculateMetrics
} from '../src/calculations';

describe('calculateIRR', () => {
    test('returns null for empty array', () => {
        expect(calculateIRR([])).toBeNull();
    });

    test('returns null for single cash flow', () => {
        expect(calculateIRR([{ date: '2020-01-01', amount: -1000 }])).toBeNull();
    });

    test('calculates positive IRR correctly', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2021-01-01', amount: 1200 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).toBeCloseTo(0.2, 2); // 20% IRR
    });

    test('calculates negative IRR correctly', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2021-01-01', amount: 800 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).toBeCloseTo(-0.2, 2); // -20% IRR
    });

    test('handles multiple cash flows', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2020-06-01', amount: 200 },
            { date: '2021-01-01', amount: 300 },
            { date: '2021-06-01', amount: 600 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).not.toBeNull();
        expect(typeof irr).toBe('number');
    });

    test('returns null for unreasonable IRR (>1000%)', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1 },
            { date: '2020-01-02', amount: 1000 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).toBeNull();
    });

    test('sorts cash flows by date automatically', () => {
        const cashFlows = [
            { date: '2021-01-01', amount: 1200 },
            { date: '2020-01-01', amount: -1000 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).toBeCloseTo(0.2, 2);
    });

    test('handles dates at year boundary consistently (timezone safety)', () => {
        // This test verifies that date parsing doesn't shift dates due to timezone issues.
        // With incorrect UTC parsing, dates near year boundaries could be misinterpreted.
        // Using a 1-year period that spans Dec 31 -> Dec 31 to test year boundary handling.
        const cashFlows = [
            { date: '2019-12-31', amount: -1000 },
            { date: '2020-12-31', amount: 1200 }
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).not.toBeNull();
        // Exactly 1 year (or very close), 20% return
        expect(irr).toBeCloseTo(0.2, 2);
    });

    test('handles mid-year dates without timezone drift', () => {
        // Test dates that could be affected by DST transitions
        const cashFlows = [
            { date: '2020-03-15', amount: -1000 },  // Around DST transition
            { date: '2020-11-15', amount: 1100 }   // After DST transition
        ];
        const irr = calculateIRR(cashFlows);
        expect(irr).not.toBeNull();
        expect(irr).toBeGreaterThan(0.1);  // Should be positive return
    });
});

describe('calculateMOIC', () => {
    test('returns null for empty array', () => {
        expect(calculateMOIC([])).toBeNull();
    });

    test('returns null when no contributions', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: 1000 },
            { date: '2021-01-01', amount: 2000 }
        ];
        expect(calculateMOIC(cashFlows)).toBeNull();
    });

    test('calculates MOIC correctly for 2x return', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2021-01-01', amount: 2000 }
        ];
        const moic = calculateMOIC(cashFlows);
        expect(moic).toBeCloseTo(2.0, 2);
    });

    test('calculates MOIC correctly for partial return', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2021-01-01', amount: 500 }
        ];
        const moic = calculateMOIC(cashFlows);
        expect(moic).toBeCloseTo(0.5, 2);
    });

    test('handles multiple contributions and distributions', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2020-06-01', amount: -500 },
            { date: '2021-01-01', amount: 2000 },
            { date: '2021-06-01', amount: 1000 }
        ];
        const moic = calculateMOIC(cashFlows);
        expect(moic).toBeCloseTo(2.0, 2); // 3000 / 1500 = 2.0
    });

    test('calculates MOIC with NAV as final distribution', () => {
        const cashFlows = [
            { date: '2020-01-01', amount: -1000 },
            { date: '2021-01-01', amount: 500 },
            { date: '2022-01-01', amount: 800 } // NAV
        ];
        const moic = calculateMOIC(cashFlows);
        expect(moic).toBeCloseTo(1.3, 2);
    });
});

describe('getVintageYear', () => {
    test('returns null for fund with no cash flows', () => {
        const fund = { cashFlows: [] };
        expect(getVintageYear(fund)).toBeNull();
    });

    test('returns year of first contribution', () => {
        const fund = {
            cashFlows: [
                { date: '2020-06-15', type: 'Contribution', amount: -1000 },
                { date: '2019-01-01', type: 'Contribution', amount: -500 },
                { date: '2021-01-01', type: 'Distribution', amount: 2000 }
            ]
        };
        expect(getVintageYear(fund)).toBe(2019);
    });

    test('ignores distributions when finding vintage', () => {
        const fund = {
            cashFlows: [
                { date: '2018-01-01', type: 'Distribution', amount: 1000 },
                { date: '2020-01-01', type: 'Contribution', amount: -500 }
            ]
        };
        expect(getVintageYear(fund)).toBe(2020);
    });

    test('handles invalid dates in cash flows', () => {
        const fund = {
            cashFlows: [
                { date: 'invalid', type: 'Contribution', amount: -1000 },
                { date: '2020-01-01', type: 'Contribution', amount: -500 }
            ]
        };
        expect(getVintageYear(fund)).toBe(2020);
    });
});

describe('getTotalByType', () => {
    test('returns 0 for fund with no cash flows', () => {
        const fund = { cashFlows: [] };
        expect(getTotalByType(fund, 'Contribution')).toBe(0);
    });

    test('sums contributions correctly', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 },
                { date: '2020-06-01', type: 'Contribution', amount: -500 },
                { date: '2021-01-01', type: 'Distribution', amount: 2000 }
            ]
        };
        expect(getTotalByType(fund, 'Contribution')).toBe(1500);
    });

    test('sums distributions correctly', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 },
                { date: '2021-01-01', type: 'Distribution', amount: 2000 },
                { date: '2021-06-01', type: 'Distribution', amount: 500 }
            ]
        };
        expect(getTotalByType(fund, 'Distribution')).toBe(2500);
    });

    test('respects cutoff date', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 },
                { date: '2021-01-01', type: 'Contribution', amount: -500 },
                { date: '2022-01-01', type: 'Contribution', amount: -300 }
            ]
        };
        const cutoff = new Date('2021-06-30');
        expect(getTotalByType(fund, 'Contribution', cutoff)).toBe(1500);
    });

    test('handles string amounts', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: '$1,000' },
                { date: '2021-01-01', type: 'Contribution', amount: '$500.00' }
            ]
        };
        expect(getTotalByType(fund, 'Contribution')).toBe(1500);
    });
});

describe('calculateMetrics nav calculation', () => {
    test('returns 0 for fund with no NAV', () => {
        const fund = { monthlyNav: [], cashFlows: [] };
        expect(calculateMetrics(fund).nav).toBe(0);
    });

    test('returns latest NAV value', () => {
        const fund = {
            monthlyNav: [
                { date: '2020-12-31', amount: 1000 },
                { date: '2021-12-31', amount: 1500 },
                { date: '2021-06-30', amount: 1200 }
            ],
            cashFlows: []
        };
        expect(calculateMetrics(fund).nav).toBe(1500);
    });

    test('adjusts NAV for subsequent contributions', () => {
        // Contribution: fund receives cash → assets increase → NAV increases
        const fund = {
            monthlyNav: [
                { date: '2021-12-31', amount: 1500 }
            ],
            cashFlows: [
                { date: '2022-03-31', type: 'Contribution', amount: -500 }
            ]
        };
        expect(calculateMetrics(fund).nav).toBe(2000); // 1500 + 500 (fund received cash)
    });

    test('adjusts NAV for subsequent distributions', () => {
        // Distribution: fund pays out cash → assets decrease → NAV decreases
        const fund = {
            monthlyNav: [
                { date: '2021-12-31', amount: 1500 }
            ],
            cashFlows: [
                { date: '2022-03-31', type: 'Distribution', amount: 300 }
            ]
        };
        expect(calculateMetrics(fund).nav).toBe(1200); // 1500 - 300 (fund paid out cash)
    });

    test('respects cutoff date', () => {
        const fund = {
            monthlyNav: [
                { date: '2020-12-31', amount: 1000 },
                { date: '2021-12-31', amount: 1500 }
            ],
            cashFlows: []
        };
        const cutoff = new Date('2021-06-30');
        expect(calculateMetrics(fund, cutoff).nav).toBe(1000);
    });
});

describe('calculateMetrics outstandingCommitment calculation', () => {
    test('returns full commitment with no contributions', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [],
            monthlyNav: []
        };
        expect(calculateMetrics(fund).outstandingCommitment).toBe(10000);
    });

    test('reduces commitment by contributions', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -3000, affectsCommitment: true },
                { date: '2021-01-01', type: 'Contribution', amount: -2000, affectsCommitment: true }
            ],
            monthlyNav: []
        };
        expect(calculateMetrics(fund).outstandingCommitment).toBe(5000);
    });

    test('ignores contributions that do not affect commitment', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -3000, affectsCommitment: true },
                { date: '2021-01-01', type: 'Contribution', amount: -2000, affectsCommitment: false }
            ],
            monthlyNav: []
        };
        expect(calculateMetrics(fund).outstandingCommitment).toBe(7000);
    });

    test('does not go below zero', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -12000, affectsCommitment: true }
            ],
            monthlyNav: []
        };
        expect(calculateMetrics(fund).outstandingCommitment).toBe(0);
    });

    test('ignores non-recallable distributions', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -3000, affectsCommitment: true },
                { date: '2021-01-01', type: 'Distribution', amount: 5000, affectsCommitment: false }
            ],
            monthlyNav: []
        };
        expect(calculateMetrics(fund).outstandingCommitment).toBe(7000);
    });

    test('handles recallable distributions', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -5000, affectsCommitment: true },
                { date: '2021-01-01', type: 'Distribution', amount: 2000, affectsCommitment: true }
            ],
            monthlyNav: []
        };
        // 10000 - 5000 + 2000 = 7000
        expect(calculateMetrics(fund).outstandingCommitment).toBe(7000);
    });
});

describe('parseCashFlowsForIRR', () => {
    test('converts contributions to negative amounts', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 }
            ],
            monthlyNav: []
        };
        const flows = parseCashFlowsForIRR(fund);
        expect(flows).toHaveLength(1);
        expect(flows[0].amount).toBe(-1000);
    });

    test('converts distributions to positive amounts', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 },
                { date: '2021-01-01', type: 'Distribution', amount: 500 }
            ],
            monthlyNav: []
        };
        const flows = parseCashFlowsForIRR(fund);
        expect(flows).toHaveLength(2);
        expect(flows[1].amount).toBe(500);
    });

    test('adds NAV as final cash flow', () => {
        const fund = {
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -1000 }
            ],
            monthlyNav: [
                { date: '2021-12-31', amount: 1500 }
            ]
        };
        const flows = parseCashFlowsForIRR(fund);
        expect(flows).toHaveLength(2);
        expect(flows[1].amount).toBe(1500);
        expect(flows[1].date).toBe('2021-12-31');
    });

    test('sorts flows by date', () => {
        const fund = {
            cashFlows: [
                { date: '2021-01-01', type: 'Distribution', amount: 500 },
                { date: '2020-01-01', type: 'Contribution', amount: -1000 }
            ],
            monthlyNav: []
        };
        const flows = parseCashFlowsForIRR(fund);
        expect(flows[0].date).toBe('2020-01-01');
        expect(flows[1].date).toBe('2021-01-01');
    });
});

describe('calculateMetrics', () => {
    test('calculates all metrics correctly', () => {
        const fund = {
            commitment: 10000,
            cashFlows: [
                { date: '2020-01-01', type: 'Contribution', amount: -5000, affectsCommitment: true },
                { date: '2021-01-01', type: 'Distribution', amount: 3000, affectsCommitment: false }
            ],
            monthlyNav: [
                { date: '2021-12-31', amount: 4000 }
            ]
        };

        const metrics = calculateMetrics(fund);

        expect(metrics.commitment).toBe(10000);
        expect(metrics.totalContributions).toBe(5000);
        expect(metrics.totalDistributions).toBe(3000);
        expect(metrics.nav).toBe(4000);
        expect(metrics.outstandingCommitment).toBe(5000);
        expect(metrics.investmentReturn).toBe(2000); // 3000 + 4000 - 5000
        expect(metrics.vintage).toBe(2020);
        expect(metrics.irr).not.toBeNull();
        expect(metrics.moic).not.toBeNull();
    });

    test('handles missing or invalid data', () => {
        const fund = {
            commitment: null,
            cashFlows: [],
            monthlyNav: []
        };

        const metrics = calculateMetrics(fund);

        expect(metrics.commitment).toBe(0);
        expect(metrics.totalContributions).toBe(0);
        expect(metrics.totalDistributions).toBe(0);
        expect(metrics.nav).toBe(0);
        expect(metrics.outstandingCommitment).toBe(0);
        expect(metrics.investmentReturn).toBe(0);
        expect(metrics.vintage).toBeNull();
        expect(metrics.irr).toBeNull();
        expect(metrics.moic).toBeNull();
    });
});
