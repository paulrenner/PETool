/**
 * Web Worker management for metrics calculations
 */

import type { Fund, FundMetrics } from '../types';
import type { MetricsWorkerRequest, MetricsWorkerResponse } from './metrics.worker';
// Import worker as inline using Vite's ?worker&inline query
import MetricsWorker from './metrics.worker?worker&inline';

let metricsWorker: Worker | null = null;
let requestIdCounter = 0;
const pendingRequests = new Map<number, {
  resolve: (results: Array<{ fundId: number | undefined; metrics: FundMetrics }>) => void;
  reject: (error: Error) => void;
}>();

/**
 * Check if Web Workers are supported
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Initialize the metrics worker
 */
export function initMetricsWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWorkerSupported()) {
      reject(new Error('Web Workers not supported'));
      return;
    }

    if (metricsWorker) {
      resolve();
      return;
    }

    try {
      // Use inline worker (bundled as blob URL)
      metricsWorker = new MetricsWorker();

      metricsWorker.onmessage = (event: MessageEvent<MetricsWorkerResponse | { type: 'ready' }>) => {
        const data = event.data;

        if (data.type === 'ready') {
          resolve();
          return;
        }

        if (data.type === 'metricsResult') {
          const pending = pendingRequests.get(data.requestId);
          if (pending) {
            pending.resolve(data.results);
            pendingRequests.delete(data.requestId);
          }
        }
      };

      metricsWorker.onerror = (error) => {
        console.error('Metrics worker error:', error);
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          pending.reject(new Error('Worker error'));
          pendingRequests.delete(id);
        }
      };

      // Timeout for initialization
      setTimeout(() => {
        if (!metricsWorker) {
          reject(new Error('Worker initialization timeout'));
        }
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate metrics for a batch of funds using the worker
 */
export function calculateMetricsInWorker(
  funds: Fund[],
  cutoffDate?: Date
): Promise<Array<{ fundId: number | undefined; metrics: FundMetrics }>> {
  return new Promise((resolve, reject) => {
    if (!metricsWorker) {
      reject(new Error('Worker not initialized'));
      return;
    }

    const requestId = ++requestIdCounter;
    pendingRequests.set(requestId, { resolve, reject });

    const request: MetricsWorkerRequest = {
      type: 'calculateMetrics',
      funds,
      cutoffDate: cutoffDate?.toISOString().split('T')[0],
      requestId,
    };

    metricsWorker.postMessage(request);

    // Timeout for long-running requests (30 seconds)
    setTimeout(() => {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error('Worker request timeout'));
        pendingRequests.delete(requestId);
      }
    }, 30000);
  });
}

/**
 * Terminate the worker
 */
export function terminateMetricsWorker(): void {
  if (metricsWorker) {
    metricsWorker.terminate();
    metricsWorker = null;
    pendingRequests.clear();
  }
}

/**
 * Check if worker is initialized and ready
 */
export function isWorkerReady(): boolean {
  return metricsWorker !== null;
}
