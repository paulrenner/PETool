/**
 * Web Worker management for metrics calculations
 */

import type { Fund, FundMetrics } from '../types';
import type { MetricsWorkerRequest, MetricsWorkerResponse } from './metrics.worker';
import { CONFIG } from '../core/config';
// Import worker as inline using Vite's ?worker&inline query
import MetricsWorker from './metrics.worker?worker&inline';

let metricsWorker: Worker | null = null;
let requestIdCounter = 0;
const pendingRequests = new Map<number, {
  resolve: (results: Array<{ fundId: number | undefined; metrics: FundMetrics }>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  createdAt: number; // Timestamp for stale request cleanup
}>();

// Periodic cleanup interval for stale requests
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
const STALE_REQUEST_THRESHOLD = CONFIG.WORKER_CALCULATION_TIMEOUT * 2;

/**
 * Clean up stale pending requests that weren't properly resolved
 */
function cleanupStaleRequests(): void {
  const now = Date.now();
  for (const [id, pending] of pendingRequests) {
    if (now - pending.createdAt > STALE_REQUEST_THRESHOLD) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Request expired during cleanup'));
      pendingRequests.delete(id);
    }
  }
}

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
      let initTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const wrappedResolve = () => {
        if (!initResolved) {
          initResolved = true;
          // Clear timeout on successful init to prevent stale rejection
          if (initTimeoutId) {
            clearTimeout(initTimeoutId);
            initTimeoutId = null;
          }
          resolve();
        }
      };

      const wrappedReject = (err: Error) => {
        if (!initResolved) {
          initResolved = true;
          if (initTimeoutId) {
            clearTimeout(initTimeoutId);
            initTimeoutId = null;
          }
          reject(err);
        }
      };

      metricsWorker.onmessage = (event: MessageEvent<MetricsWorkerResponse | { type: 'ready' }>) => {
        const data = event.data;

        if (data.type === 'ready') {
          // Start periodic cleanup of stale requests
          if (!cleanupIntervalId) {
            cleanupIntervalId = setInterval(cleanupStaleRequests, STALE_REQUEST_THRESHOLD);
          }
          wrappedResolve();
          return;
        }

        if (data.type === 'metricsResult') {
          const pending = pendingRequests.get(data.requestId);
          if (pending) {
            // Clear timeout before resolving to prevent memory leaks
            clearTimeout(pending.timeoutId);

            // Validate response structure before resolving
            if (Array.isArray(data.results)) {
              pending.resolve(data.results);
            } else {
              pending.reject(new Error('Invalid worker response: results is not an array'));
            }
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

      // Timeout for initialization
      initTimeoutId = setTimeout(() => {
        wrappedReject(new Error('Worker initialization timeout'));
      }, CONFIG.WORKER_INIT_TIMEOUT);
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

    // Generate unique request ID using timestamp + counter to prevent collisions
    // This avoids overflow issues and ensures uniqueness even with rapid requests
    const requestId = Date.now() * 1000 + (++requestIdCounter % 1000);

    // Reset counter periodically to prevent overflow (doesn't affect uniqueness due to timestamp)
    if (requestIdCounter > 1000000) {
      requestIdCounter = 0;
    }

    // Set up timeout with cleanup reference
    const timeoutId = setTimeout(() => {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error('Worker request timeout'));
        pendingRequests.delete(requestId);
      }
    }, CONFIG.WORKER_CALCULATION_TIMEOUT);

    // Store request with timeout ID and timestamp for proper cleanup
    pendingRequests.set(requestId, { resolve, reject, timeoutId, createdAt: Date.now() });

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

    // Stop cleanup interval
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  }
}

/**
 * Check if worker is initialized and ready
 */
export function isWorkerReady(): boolean {
  return metricsWorker !== null;
}
