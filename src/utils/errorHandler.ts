/**
 * Centralized Error Handler
 *
 * Provides consistent error handling, logging, and user notification
 * across the application. Errors are categorized by severity and type.
 */

/**
 * Error severity levels
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'
  | 'database'
  | 'network'
  | 'calculation'
  | 'import'
  | 'export'
  | 'ui'
  | 'unknown';

/**
 * Structured error information
 */
export interface AppError {
  message: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  originalError?: Error;
  context?: Record<string, unknown>;
  timestamp: string;
  userMessage?: string;
}

/**
 * Error handler callback type
 */
export type ErrorHandler = (error: AppError) => void;

/**
 * Global error handlers registry
 */
const errorHandlers: ErrorHandler[] = [];

/**
 * Error history for debugging (limited to last 50 errors)
 */
const errorHistory: AppError[] = [];
const MAX_ERROR_HISTORY = 50;

/**
 * Register a global error handler
 */
export function registerErrorHandler(handler: ErrorHandler): () => void {
  errorHandlers.push(handler);
  // Return unregister function
  return () => {
    const index = errorHandlers.indexOf(handler);
    if (index > -1) {
      errorHandlers.splice(index, 1);
    }
  };
}

/**
 * Create a structured app error
 */
export function createAppError(
  message: string,
  options: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    originalError?: Error;
    context?: Record<string, unknown>;
    userMessage?: string;
  } = {}
): AppError {
  return {
    message,
    severity: options.severity ?? 'error',
    category: options.category ?? 'unknown',
    originalError: options.originalError,
    context: options.context,
    timestamp: new Date().toISOString(),
    userMessage: options.userMessage ?? message,
  };
}

/**
 * Handle an error through the centralized system
 */
export function handleError(error: AppError | Error | string): AppError {
  let appError: AppError;

  if (typeof error === 'string') {
    appError = createAppError(error);
  } else if (error instanceof Error) {
    appError = createAppError(error.message, {
      originalError: error,
      category: categorizeError(error),
    });
  } else {
    appError = error;
  }

  // Log to console based on severity
  logError(appError);

  // Add to history
  errorHistory.unshift(appError);
  if (errorHistory.length > MAX_ERROR_HISTORY) {
    errorHistory.pop();
  }

  // Notify all registered handlers
  errorHandlers.forEach((handler) => {
    try {
      handler(appError);
    } catch (handlerError) {
      console.error('Error in error handler:', handlerError);
    }
  });

  return appError;
}

/**
 * Attempt to categorize an error based on its message/type
 */
function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation';
  }
  if (message.includes('database') || message.includes('indexeddb') || message.includes('transaction')) {
    return 'database';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'network';
  }
  if (message.includes('calculation') || message.includes('nan') || message.includes('infinity')) {
    return 'calculation';
  }
  if (message.includes('import') || message.includes('parse')) {
    return 'import';
  }
  if (message.includes('export') || message.includes('download')) {
    return 'export';
  }

  return 'unknown';
}

/**
 * Log error to console with appropriate level
 */
function logError(error: AppError): void {
  const prefix = `[${error.category.toUpperCase()}]`;
  const contextStr = error.context ? ` Context: ${JSON.stringify(error.context)}` : '';

  switch (error.severity) {
    case 'info':
      console.info(prefix, error.message, contextStr);
      break;
    case 'warning':
      console.warn(prefix, error.message, contextStr);
      break;
    case 'error':
    case 'critical':
      console.error(prefix, error.message, contextStr);
      if (error.originalError) {
        console.error('Original error:', error.originalError);
      }
      break;
  }
}

/**
 * Get recent error history
 */
export function getErrorHistory(): readonly AppError[] {
  return errorHistory;
}

/**
 * Clear error history
 */
export function clearErrorHistory(): void {
  errorHistory.length = 0;
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: {
    category?: ErrorCategory;
    userMessage?: string;
    rethrow?: boolean;
  } = {}
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = handleError(
        createAppError(error instanceof Error ? error.message : String(error), {
          originalError: error instanceof Error ? error : undefined,
          category: options.category,
          userMessage: options.userMessage,
        })
      );

      if (options.rethrow) {
        throw appError;
      }

      return undefined;
    }
  }) as T;
}

/**
 * Safe execution wrapper that catches and handles errors
 */
export function safeExecute<T>(
  fn: () => T,
  options: {
    category?: ErrorCategory;
    fallback?: T;
    userMessage?: string;
  } = {}
): T | undefined {
  try {
    return fn();
  } catch (error) {
    handleError(
      createAppError(error instanceof Error ? error.message : String(error), {
        originalError: error instanceof Error ? error : undefined,
        category: options.category,
        userMessage: options.userMessage,
      })
    );
    return options.fallback;
  }
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: AppError): string {
  if (error.userMessage) {
    return error.userMessage;
  }

  // Provide friendly messages based on category
  switch (error.category) {
    case 'validation':
      return 'Please check your input and try again.';
    case 'database':
      return 'There was a problem saving your data. Please try again.';
    case 'network':
      return 'Network error. Please check your connection and try again.';
    case 'calculation':
      return 'There was an error in the calculations. Please verify your data.';
    case 'import':
      return 'There was a problem importing the file. Please check the format.';
    case 'export':
      return 'There was a problem exporting. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Initialize global error handlers for uncaught errors
 */
export function initGlobalErrorHandlers(): void {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    handleError(
      createAppError(event.message, {
        severity: 'critical',
        category: 'unknown',
        originalError: event.error,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      })
    );
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
    handleError(
      createAppError(message, {
        severity: 'critical',
        category: 'unknown',
        originalError: event.reason instanceof Error ? event.reason : undefined,
      })
    );
  });
}
