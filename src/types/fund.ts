/**
 * Cash flow types
 *
 * - Contribution: Capital called from LP (money flowing INTO the fund)
 * - Distribution: Capital returned to LP (money flowing OUT of the fund)
 * - Adjustment: Accounting correction (does not affect IRR/MOIC calculations)
 */
export type CashFlowType = 'Contribution' | 'Distribution' | 'Adjustment';

/**
 * A single cash flow transaction
 *
 * SIGN CONVENTIONS:
 * - The `amount` field stores the ABSOLUTE VALUE (always positive)
 * - The `type` field determines the direction of the cash flow
 * - For IRR/MOIC calculations, amounts are converted:
 *   - Contributions → negative (cash outflow from LP perspective)
 *   - Distributions → positive (cash inflow from LP perspective)
 *
 * This convention follows standard PE/VC reporting where IRR is calculated
 * from the Limited Partner's perspective.
 */
export interface CashFlow {
  id?: number;
  fundId?: number;
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  /** Absolute value of the cash flow amount (always positive) */
  amount: number;
  /** Determines direction: Contribution (in), Distribution (out), Adjustment (n/a) */
  type: CashFlowType;
  /** Whether this cash flow affects unfunded commitment calculation */
  affectsCommitment: boolean;
  /** Optional note describing this cash flow */
  note?: string;
}

/**
 * A Net Asset Value entry
 *
 * NAV represents the current market value of the LP's interest in the fund
 * at a specific point in time. This is typically reported quarterly.
 *
 * Note: NAV can be negative in cases of severe impairment or clawback provisions.
 * Negative NAV is included in IRR/MOIC calculations to accurately reflect losses.
 */
export interface Nav {
  id?: number;
  fundId?: number;
  /** ISO date string "YYYY-MM-DD" - the valuation date */
  date: string;
  /** Market value of LP's interest (can be negative for impaired funds) */
  amount: number;
}

/**
 * A fund/investment record
 */
export interface Fund {
  id?: number;
  fundName: string;
  accountNumber: string;
  commitment: number;
  groupId: number | null;
  cashFlows: CashFlow[];
  monthlyNav: Nav[];
  timestamp: string;
}

/**
 * Calculated metrics for a fund
 *
 * METRIC DEFINITIONS (Industry Standard):
 *
 * IRR (Internal Rate of Return):
 *   Annualized return considering timing of cash flows.
 *   Expressed as decimal (0.15 = 15%). Calculated using Newton-Raphson method.
 *
 * MOIC (Multiple on Invested Capital):
 *   Total value / Total invested = (Distributions + NAV) / Contributions
 *   A MOIC of 1.5x means $1.50 returned for every $1.00 invested.
 *
 * DPI (Distributions to Paid-In):
 *   Realized return = Distributions / Contributions
 *   Cash-on-cash return, ignoring unrealized value.
 *
 * RVPI (Residual Value to Paid-In):
 *   Unrealized return = NAV / Contributions
 *   Remaining value as multiple of invested capital.
 *
 * TVPI (Total Value to Paid-In):
 *   Total return = DPI + RVPI = (Distributions + NAV) / Contributions
 *   Note: TVPI should equal MOIC by definition.
 */
export interface FundMetrics {
  /** Total capital called from LP (sum of contributions) */
  calledCapital: number;
  /** Total capital returned to LP (sum of distributions) */
  distributions: number;
  /** Current Net Asset Value (can be negative for impaired funds) */
  nav: number;
  /** Date of the NAV valuation */
  navDate: string | null;
  /** Internal Rate of Return as decimal (0.15 = 15%), null if cannot calculate */
  irr: number | null;
  /** Multiple on Invested Capital = (Distributions + NAV) / Contributions */
  moic: number | null;
  /** Distributions to Paid-In = Distributions / Contributions */
  dpi: number | null;
  /** Residual Value to Paid-In = NAV / Contributions */
  rvpi: number | null;
  /** Total Value to Paid-In = (Distributions + NAV) / Contributions */
  tvpi: number | null;
  /** Whether NAV was adjusted for cash flows after the latest NAV date */
  navAdjusted: boolean;
  /** Remaining unfunded commitment */
  outstandingCommitment: number;
  /** Year of first contribution */
  vintageYear: number | null;
  // Backward-compatible aliases
  commitment?: number;
  totalContributions?: number;
  totalDistributions?: number;
  investmentReturn?: number;
  vintage?: number | null;
}

/**
 * A fund with calculated metrics attached
 */
export interface FundWithMetrics extends Fund {
  metrics: FundMetrics;
}

/**
 * Fund name metadata (stored separately from investments)
 */
export interface FundNameData {
  name: string;
  tags: string[];
  investmentTermStartDate: string | null;
  investmentTermYears: number | null;
}
