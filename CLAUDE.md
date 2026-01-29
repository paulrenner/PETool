# Claude Code Instructions

## Allowed

- git commands
- gh commands
- npm test
- npm run build

## Workflow

- Always work directly on the `main` branch
- Automatically commit and push all changes to `main` after completing work

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
    ├── modals.ts    # Re-exports from modals/
    ├── modals/      # Modal dialog modules
    │   ├── common.ts      # Shared utilities (status, loading, confirm)
    │   ├── fund-modal.ts  # Fund add/edit/details/duplicate
    │   ├── group-modal.ts # Group management and sync
    │   ├── fund-names-modal.ts # Fund name/tag management
    │   └── index.ts       # Re-exports
    ├── table.ts     # Table rendering
    ├── filters.ts   # Filter functionality
    ├── bulk.ts      # Bulk operations
    ├── import.ts    # Data import
    ├── export.ts    # Data export
    ├── timeline.ts  # Timeline visualization
    ├── health-check.ts # Data integrity validation
    └── index.ts     # Re-exports
```

## Development Workflow

### Building
```bash
npm run build    # TypeScript check + Vite build
cp dist/index.html index.html  # REQUIRED: Copy to root for deployment
```

**IMPORTANT**: After every build, you MUST copy `dist/index.html` to the root `index.html`. The root file is what gets deployed to GitHub Pages. Forgetting this step means your changes won't be visible to users.

### Testing
```bash
npm test         # Run Jest tests
```
- 328 tests across 8 test suites
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
8. Update documentation if structure changed:
   - **CLAUDE.md**: Update "Directory Structure" section if adding new directories or files
   - **review-playbook.md**: Update phase scopes if adding new files (see table below)

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

### Review Playbook Maintenance
The `review-playbook.md` file defines a phased code review process with explicit file scopes per phase. **When adding new source files**, update the relevant phase scope:

| File Type | Update Phase |
|-----------|--------------|
| `src/calculations/*.ts` | Phase 2 (Financial Engine) |
| `src/core/*.ts` | Phase 3 (State/Persistence) |
| `src/types/*.ts` | Phase 2 and Phase 5 |
| `src/utils/*.ts` | Phase 4 (Security) |
| `src/app/*.ts` | Phase 4 (Security/Performance) |
| `src/app/modals/*.ts` | Phase 4 (Security/Performance) |
| `__tests__/*.ts` | Phase 6 (Tests) |

This ensures new code is included in future AI-assisted code reviews.
