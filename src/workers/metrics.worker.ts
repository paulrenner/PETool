/**
 * Web Worker for calculating fund metrics
 * Offloads CPU-intensive IRR/MOIC calculations from the main thread
 */

import type { Fund, FundMetrics } from '../types';
import { calculateMetrics } from '../calculations/metrics';

export interface MetricsWorkerRequest {
  type: 'calculateMetrics';
  funds: Fund[];
  cutoffDate?: string;
  requestId: number;
}

export interface MetricsWorkerResponse {
  type: 'metricsResult';
  results: Array<{ fundId: number | undefined; metrics: FundMetrics }>;
  requestId: number;
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = (event: MessageEvent<MetricsWorkerRequest>) => {
  const { type, funds, cutoffDate, requestId } = event.data;

  if (type === 'calculateMetrics') {
    const cutoff = cutoffDate ? new Date(cutoffDate + 'T00:00:00') : undefined;

    const results = funds.map(fund => ({
      fundId: fund.id,
      metrics: calculateMetrics(fund, cutoff),
    }));

    const response: MetricsWorkerResponse = {
      type: 'metricsResult',
      results,
      requestId,
    };

    self.postMessage(response);
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
