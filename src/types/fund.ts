/**
 * Cash flow types
 */
export type CashFlowType = 'Contribution' | 'Distribution' | 'Adjustment';

/**
 * A single cash flow transaction
 */
export interface CashFlow {
  id?: number;
  fundId?: number;
  date: string; // ISO date string "YYYY-MM-DD"
  amount: number; // Negative = contribution, Positive = distribution
  type: CashFlowType;
  affectsCommitment: boolean;
  note?: string;
}

/**
 * A Net Asset Value entry
 */
export interface Nav {
  id?: number;
  fundId?: number;
  date: string; // ISO date string "YYYY-MM-DD"
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
 */
export interface FundMetrics {
  calledCapital: number;
  distributions: number;
  nav: number;
  navDate: string | null;
  irr: number | null;
  moic: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  outstandingCommitment: number;
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
