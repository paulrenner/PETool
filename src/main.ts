/**
 * PE Fund Manager - Main Entry Point
 *
 * This file initializes the application and sets up event listeners.
 * The full UI migration from index.html will happen incrementally.
 */

// Re-export core modules for use in the application
export { CONFIG, AppState } from './core';
export * from './core/db';
export * from './types';
export * from './calculations';
export * from './utils';

// For now, import the styles (will be inlined by Vite)
import './styles.css';

console.log('PE Fund Manager TypeScript modules loaded');
