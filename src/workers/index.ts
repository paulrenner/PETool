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
  timeoutId: ReturnType<typeof setTimeout>;
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

      // Track initialization state to prevent double resolve/reject
      let initResolved = false;

      const wrappedResolve = () => {
        if (!initResolved) {
          initResolved = true;
          resolve();
        }
      };

      const wrappedReject = (err: Error) => {
        if (!initResolved) {
          initResolved = true;
          reject(err);
        }
      };

      metricsWorker.onmessage = (event: MessageEvent<MetricsWorkerResponse | { type: 'ready' }>) => {
        const data = event.data;

        if (data.type === 'ready') {
          wrappedResolve();
          return;
        }

        if (data.type === 'metricsResult') {
          const pending = pendingRequests.get(data.requestId);
          if (pending) {
            // Clear timeout before resolving to prevent memory leaks
            clearTimeout(pending.timeoutId);
            pending.resolve(data.results);
            pendingRequests.delete(data.requestId);
          }
        }
      };

      metricsWorker.onerror = (error) => {
        console.error('Metrics worker error:', error);
        wrappedReject(new Error('Worker initialization failed'));
        // Reject all pending requests and clear their timeouts
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timeoutId);
          pending.reject(new Error('Worker error'));
          pendingRequests.delete(id);
        }
      };

      // Timeout for initialization (2s is sufficient for inline worker)
      setTimeout(() => {
        wrappedReject(new Error('Worker initialization timeout'));
      }, 2000);
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

    // Set up timeout with cleanup reference
    const timeoutId = setTimeout(() => {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error('Worker request timeout'));
        pendingRequests.delete(requestId);
      }
    }, 30000);

    // Store request with timeout ID for proper cleanup
    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    const request: MetricsWorkerRequest = {
      type: 'calculateMetrics',
      funds,
      cutoffDate: cutoffDate?.toISOString().split('T')[0],
      requestId,
    };

    metricsWorker.postMessage(request);
  });
}

/**
 * Terminate the worker and clean up all pending requests
 */
export function terminateMetricsWorker(): void {
  if (metricsWorker) {
    metricsWorker.terminate();
    metricsWorker = null;

    // Clear all pending request timeouts to prevent memory leaks
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
    }
    pendingRequests.clear();
  }
}

/**
 * Check if worker is initialized and ready
 */
export function isWorkerReady(): boolean {
  return metricsWorker !== null;
}
