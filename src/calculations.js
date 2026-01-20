/**
 * Calculation functions for PE Fund Manager
 */

import { isValidDate } from './validation.js';
import { parseCurrency } from './formatting.js';

/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * @param {Array} cashFlows - Array of {date, amount} objects
 * @param {number} guess - Initial guess for IRR
 * @returns {number|null} IRR as decimal (e.g., 0.15 for 15%) or null if cannot converge
 */
export function calculateIRR(cashFlows, guess = 0.1) {
    if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;

    const flows = [...cashFlows].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDate = new Date(flows[0].date);

    const npv = rate => flows.reduce((acc, cf) => {
        const yearsDiff = (new Date(cf.date) - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
        return acc + cf.amount / Math.pow(1 + rate, yearsDiff);
    }, 0);

    const dNpv = rate => flows.reduce((acc, cf) => {
        const yearsDiff = (new Date(cf.date) - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
        if (yearsDiff === 0) return acc;
        return acc - (yearsDiff * cf.amount) / Math.pow(1 + rate, yearsDiff + 1);
    }, 0);

    let rate = guess;
    const maxIterations = 1000;
    const precision = 1e-6;

    for (let i = 0; i < maxIterations; i++) {
        const npvValue = npv(rate);
        const derivativeValue = dNpv(rate);

        if (Math.abs(npvValue) < precision) {
            if (rate > 10 || rate < -1) return null;
            return rate;
        }
        if (Math.abs(derivativeValue) < precision) return null;

        const newRate = rate - npvValue / derivativeValue;
        if (Math.abs(newRate - rate) < precision) {
            if (newRate > 10 || newRate < -1) return null;
            return newRate;
        }

        rate = newRate;
    }

    return null;
}

/**
 * Calculate MOIC (Multiple on Invested Capital)
 * @param {Array} cashFlows - Array of {date, amount} objects
 * @returns {number|null} MOIC as decimal or null
 */
export function calculateMOIC(cashFlows) {
    if (!Array.isArray(cashFlows) || cashFlows.length === 0) return null;

    const contributions = cashFlows
        .filter(f => f.amount < 0)
        .reduce((sum, f) => sum + Math.abs(f.amount), 0);

    const distributions = cashFlows
        .filter(f => f.amount > 0)
        .reduce((sum, f) => sum + f.amount, 0);

    // Cannot calculate meaningful MOIC without contributions
    if (contributions === 0) return null;
    return distributions / contributions;
}

/**
 * Get vintage year (first contribution year)
 * @param {Object} fund - Fund object
 * @returns {number|null} Year or null
 */
export function getVintageYear(fund) {
    const contributions = (fund.cashFlows || [])
        .filter(cf => cf.type === 'Contribution' && isValidDate(cf.date))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return contributions.length > 0 ? new Date(contributions[0].date).getFullYear() : null;
}

/**
 * Get total contributions or distributions by type
 * @param {Object} fund - Fund object
 * @param {string} type - 'Contribution' or 'Distribution'
 * @param {Date} cutoffDate - Optional cutoff date
 * @returns {number} Total amount
 */
export function getTotalByType(fund, type, cutoffDate) {
    return (fund.cashFlows || [])
        .filter(cf =>
            cf.type === type &&
            isValidDate(cf.date) &&
            (!cutoffDate || new Date(cf.date) <= cutoffDate)
        )
        .reduce((sum, cf) => sum + Math.abs(parseCurrency(cf.amount) || 0), 0);
}

/**
 * Get latest NAV adjusted for subsequent cash flows
 * @param {Object} fund - Fund object
 * @param {Date} cutoffDate - Optional cutoff date
 * @returns {number} NAV amount
 */
export function getLatestNav(fund, cutoffDate) {
    const navs = (fund.monthlyNav || [])
        .filter(n => isValidDate(n.date) && (!cutoffDate || new Date(n.date) <= cutoffDate))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (navs.length === 0) return 0;

    const latestNav = navs[0];
    let navAmount = parseCurrency(latestNav.amount) || 0;
    const navDate = new Date(latestNav.date);

    // Adjust for cash flows after NAV date
    const subsequentFlows = (fund.cashFlows || []).filter(cf => {
        if (!isValidDate(cf.date)) return false;
        const cfDate = new Date(cf.date);
        return cfDate > navDate && (!cutoffDate || cfDate <= cutoffDate);
    });

    subsequentFlows.forEach(cf => {
        const amount = parseCurrency(cf.amount) || 0;
        if (cf.type === 'Contribution') {
            navAmount -= Math.abs(amount);
        } else if (cf.type === 'Distribution') {
            navAmount += Math.abs(amount);
        }
    });

    return navAmount;
}

/**
 * Calculate outstanding commitment
 * @param {Object} fund - Fund object
 * @param {Date} cutoffDate - Optional cutoff date
 * @returns {number} Outstanding commitment
 */
export function getOutstandingCommitment(fund, cutoffDate) {
    let outstanding = parseCurrency(fund.commitment) || 0;

    (fund.cashFlows || [])
        .filter(cf =>
            isValidDate(cf.date) &&
            (!cutoffDate || new Date(cf.date) <= cutoffDate) &&
            cf.affectsCommitment !== false
        )
        .forEach(cf => {
            if (cf.type === 'Contribution') {
                const amount = parseCurrency(cf.amount) || 0;
                outstanding -= Math.abs(amount);
            } else if (cf.type === 'Distribution') {
                // Recallable distribution - adds back to remaining commitment
                const amount = parseCurrency(cf.amount) || 0;
                outstanding += Math.abs(amount);
            } else if (cf.type === 'Adjustment') {
                // Adjustments directly modify outstanding commitment
                // Positive = increase remaining, Negative = decrease remaining
                const amount = parseCurrency(cf.amount) || 0;
                outstanding += amount;
            }
        });

    return Math.max(0, outstanding);
}

/**
 * Parse cash flows for IRR calculation
 * @param {Object} fund - Fund object
 * @param {Date} cutoffDate - Optional cutoff date
 * @returns {Array} Array of {date, amount} for IRR calculation
 */
export function parseCashFlowsForIRR(fund, cutoffDate) {
    const flows = (fund.cashFlows || [])
        .filter(cf => isValidDate(cf.date) && (!cutoffDate || new Date(cf.date) <= cutoffDate))
        .filter(cf => cf.type !== 'Adjustment') // Adjustments don't affect IRR/MOIC
        .map(cf => {
            const amount = parseCurrency(cf.amount) || 0;
            return {
                date: cf.date,
                amount: cf.type === 'Contribution' ? -Math.abs(amount) : Math.abs(amount)
            };
        });

    // Add NAV as final cash flow (include zero NAV for accurate IRR calculation)
    const nav = getLatestNav(fund, cutoffDate);
    if (nav >= 0) {
        const navs = (fund.monthlyNav || [])
            .filter(n => isValidDate(n.date) && (!cutoffDate || new Date(n.date) <= cutoffDate))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (navs.length > 0) {
            flows.push({ date: navs[0].date, amount: nav });
        }
    }

    return flows.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculate all metrics for a fund
 * @param {Object} fund - Fund object
 * @param {Date} cutoffDate - Optional cutoff date
 * @returns {Object} Object with all calculated metrics
 */
export function calculateMetrics(fund, cutoffDate) {
    const commitment = parseCurrency(fund.commitment) || 0;
    const totalContributions = getTotalByType(fund, 'Contribution', cutoffDate);
    const totalDistributions = getTotalByType(fund, 'Distribution', cutoffDate);
    const nav = getLatestNav(fund, cutoffDate);
    const outstandingCommitment = getOutstandingCommitment(fund, cutoffDate);
    const investmentReturn = totalDistributions + nav - totalContributions;
    const vintage = getVintageYear(fund);

    const cashFlowsForIRR = parseCashFlowsForIRR(fund, cutoffDate);
    const irr = calculateIRR(cashFlowsForIRR);
    const moic = calculateMOIC(cashFlowsForIRR);

    return {
        commitment,
        totalContributions,
        totalDistributions,
        nav,
        outstandingCommitment,
        investmentReturn,
        vintage,
        irr,
        moic
    };
}
