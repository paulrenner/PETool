# Claude Code Instructions

## Core Constraints

1. **Single File Architecture**: All application code must remain in `index.html`. Do not split code into separate files.

2. **No External Dependencies**: The application runs entirely in the browser with no external libraries (except jsPDF/jsPDF-AutoTable for PDF export which are loaded via CDN). Do not introduce npm packages, frameworks, or build tools for the main application.

## Project Context

This is a Private Equity fund management application that:
- Runs entirely client-side in the browser
- Uses IndexedDB for persistent local storage
- Has ~8000+ lines of HTML/CSS/JavaScript in a single file

## Code Patterns

### State Management
- Use `AppState` for all application state (centralized state management)
- **Critical**: Always use AppState setter methods, never assign directly to properties
  ```javascript
  // CORRECT
  AppState.setUnsavedChanges(true);
  AppState.setSortColumns(newColumns);

  // WRONG - bypasses sync with legacy variables
  AppState.hasUnsavedChanges = true;
  ```
- Legacy variable aliases exist for backward compatibility but are synced one-way from AppState setters

### Async Patterns
- Database operations are async - always use `await` when calling them
- Event handlers that call async functions should be marked `async`
- Modal openers and other UI functions that touch the database should have try/catch

### Security
- Always escape HTML output: use `escapeHtml()` for user data displayed in DOM
- Use `escapeCSV()` for CSV exports to prevent injection
- Validate all user input before processing

### IIFE and Global Function Exposure
The JavaScript code is wrapped in an IIFE (Immediately Invoked Function Expression), so all functions are private by default. When adding functions that need to be called from dynamically generated HTML (e.g., `onclick` handlers in innerHTML), you must expose them on `window`:

```javascript
// At the end of the IIFE, before init():
window.myNewFunction = myNewFunction;
```

Look for the existing list near `window.showAddFundModal = showAddFundModal;` and add new functions there.

**Common mistake**: Adding `onclick="myFunction()"` in dynamic HTML without exposing `myFunction` to `window` - the click will silently fail.

### CSS
- Use CSS variables defined in `:root` for colors, spacing, shadows
- Dark mode support via `[data-theme="dark"]` selectors
- Print styles go in `@media print { }` blocks

## Testing

Run tests before committing changes:
```bash
npm test
```

- 164 tests across 4 test suites
- Tests are in `__tests__/` directory
- Testable logic is extracted to `src/` modules (calculations, validation, formatting)

### Critical: Duplicated Logic in `src/` and `index.html`

**Warning**: The `src/` modules contain logic that is **duplicated** from `index.html` for unit testing purposes. These are NOT shared—they are separate copies of the same functions.

When modifying calculation, validation, or formatting logic, you **must update both places**:
1. `index.html` - the actual application code
2. `src/*.js` - the testable copy used by Jest

Functions that exist in both places include:
- `src/calculations.js`: `calculateIRR`, `calculateMOIC`, `getOutstandingCommitment`, `parseCashFlowsForIRR`, `getTotalByType`, `getLatestNav`, `getVintageYear`, `calculateMetrics`
- `src/validation.js`: `isValidDate`, `validateFundData`, `validateCashFlow`, `validateNav`
- `src/formatting.js`: `formatCurrency`, `formatDate`, `parseCurrency`, `escapeHtml`, `escapeCSV`

**Always check both files when making changes to shared logic.**

## Common Tasks

### Adding a new feature
1. Add any new state to AppState with a setter method
2. Add UI elements directly in the HTML
3. Add CSS in the `<style>` section
4. Add JavaScript in the main `<script>` section
5. **If adding/modifying calculation, validation, or formatting logic**: Update both `index.html` AND the corresponding `src/*.js` file
6. Run tests to ensure nothing is broken

### Fixing a bug
1. Identify the root cause
2. Check if AppState setters are being used correctly
3. Check for proper `await` on async calls
4. **If fixing calculation, validation, or formatting logic**: Update both `index.html` AND the corresponding `src/*.js` file
5. Test the fix manually and run `npm test`
