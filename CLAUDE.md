# Claude Code Instructions

## Project Architecture

This is a Private Equity fund management application built with **TypeScript** and **Vite**. The source code is in `src/` and builds to a single `index.html` file for deployment.

### Key Technologies
- **TypeScript** for type-safe code
- **Vite** with `vite-plugin-singlefile` for building
- **IndexedDB** for client-side data storage
- **Jest** for unit testing

### Directory Structure
```
src/
├── main.ts          # Application entry point, event listeners
├── index.html       # HTML template
├── styles.css       # All CSS styles
├── types/           # TypeScript type definitions
│   ├── fund.ts      # Fund, CashFlow, Nav types
│   ├── group.ts     # Group type
│   ├── state.ts     # AppState type definitions
│   └── index.ts     # Re-exports
├── core/            # Core functionality
│   ├── config.ts    # Application constants
│   ├── state.ts     # AppState singleton
│   ├── db.ts        # IndexedDB operations
│   └── index.ts     # Re-exports
├── calculations/    # Financial calculations
│   ├── irr.ts       # IRR and MOIC calculations
│   ├── metrics.ts   # Fund metrics (DPI, RVPI, TVPI, etc.)
│   └── index.ts     # Re-exports
├── utils/           # Utility functions
│   ├── formatting.ts # Currency, date formatting
│   ├── validation.ts # Input validation
│   ├── escaping.ts   # HTML/CSV escaping
│   └── index.ts     # Re-exports
├── ui/              # Reusable UI components
│   ├── modal.ts     # Modal dialog utilities
│   ├── multiselect.ts # Multi-select dropdown component
│   ├── formatter.ts # Display formatting helpers
│   ├── storage.ts   # localStorage utilities
│   ├── utils.ts     # DOM utilities
│   └── index.ts     # Re-exports
└── app/             # Application modules
    ├── modals.ts    # Fund/cash flow modal dialogs
    ├── table.ts     # Table rendering
    ├── filters.ts   # Filter functionality
    ├── bulk.ts      # Bulk operations
    ├── import.ts    # Data import
    ├── export.ts    # Data export
    ├── timeline.ts  # Timeline visualization
    └── index.ts     # Re-exports
```

## Development Workflow

### Building
```bash
npm run build    # TypeScript check + Vite build
```
Output goes to `dist/index.html`. Copy to root `index.html` for deployment.

### Testing
```bash
npm test         # Run Jest tests
```
- 265 tests across 7 test suites
- Tests import directly from `src/` TypeScript modules

### Development
The source of truth is the TypeScript code in `src/`. The root `index.html` is the **built output** for GitHub Pages deployment.

## Code Patterns

### State Management
Use `AppState` singleton for all application state:
```typescript
import { AppState } from './core/state';

// CORRECT - use setter methods
AppState.setUnsavedChanges(true);
AppState.setSortColumns(newColumns);
AppState.setFunds(funds);

// WRONG - direct assignment
AppState.hasUnsavedChanges = true;
```

### Database Operations
All database functions are async:
```typescript
import { getAllFunds, saveFundToDB, deleteFundFromDB } from './core/db';

const funds = await getAllFunds();
const id = await saveFundToDB(fundData);
await deleteFundFromDB(id);
```

### Date Handling
**Critical**: JavaScript has timezone issues with date-only strings.
```typescript
// WRONG - timezone issues
new Date("2021-08-01")  // Parsed as UTC, getMonth() returns local time

// CORRECT - append time to force local interpretation
new Date("2021-08-01T00:00:00")
```

The `isValidDate()` function in `src/utils/validation.ts` handles this correctly.

### Security
- Use `escapeHtml()` for user data displayed in DOM
- Use `escapeCSV()` for CSV exports
- Validate all user input before processing

### CSS
- CSS variables defined in `:root` in `src/styles.css`
- Dark mode: `[data-theme="dark"]` selectors
- Print styles: `@media print { }` blocks

## Common Tasks

### Adding a New Feature
1. Add types to `src/types/` if needed
2. Add state to `AppState` with setter method if needed
3. Implement logic in appropriate `src/` module
4. Add event listeners in `src/main.ts`
5. Update HTML in `src/index.html` if needed
6. Run `npm test` and `npm run build`
7. Copy `dist/index.html` to root and commit

### Fixing a Bug
1. Identify the root cause in the TypeScript source
2. Fix in the appropriate `src/` module
3. Run `npm test` to verify
4. Run `npm run build`
5. Copy `dist/index.html` to root and commit

### Adding Tests
Tests are in `__tests__/` and import from `src/`:
```javascript
import { calculateIRR } from '../src/calculations/irr';
```

## Important Notes

### Data Normalization
The `normalizeFund()` function in `src/core/db.ts` handles legacy data formats:
- Normalizes dates to YYYY-MM-DD format
- Normalizes cash flow types (case-insensitive)
- Ensures proper numeric types for amounts

### Calculation Functions
Key calculation functions in `src/calculations/`:
- `calculateIRR()` - Internal Rate of Return (Newton-Raphson method)
- `calculateMOIC()` - Multiple on Invested Capital
- `calculateMetrics()` - All fund metrics (IRR, MOIC, DPI, RVPI, TVPI)
- `getTotalByType()` - Sum contributions or distributions
- `getLatestNav()` - Latest NAV adjusted for subsequent cash flows

### Module Exports
Each directory has an `index.ts` that re-exports public functions. Import from the directory:
```typescript
import { calculateMetrics, calculateIRR } from './calculations';
import { formatCurrency, parseCurrency } from './utils/formatting';
```
