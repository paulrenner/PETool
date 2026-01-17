# Testing Documentation

This document describes the comprehensive unit testing setup for the PE Fund Manager application.

## Overview

The application now includes a full test suite using Jest with:
- **152 unit tests** across 4 test suites
- **95.78% statement coverage**
- **86.45% branch coverage**
- **97.72% function coverage**

## Test Setup

### Dependencies

- **Jest**: Testing framework
- **Babel**: Transpiler for ES6 modules
- **jsdom**: Browser environment simulation

### Directory Structure

```
/home/user/PETool/
├── src/                    # Modular source code
│   ├── calculations.js     # IRR, MOIC, metrics calculations
│   ├── validation.js       # Input validation functions
│   └── formatting.js       # Currency and number formatting
├── __tests__/              # Test files
│   ├── calculations.test.js
│   ├── validation.test.js
│   ├── formatting.test.js
│   └── tags.test.js
├── package.json            # Dependencies and scripts
├── jest.config.js          # Jest configuration
└── babel.config.js         # Babel configuration
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

## Test Coverage by Module

### calculations.js (93.26% coverage)
Tests for financial calculations:
- **calculateIRR()** - Internal Rate of Return using Newton-Raphson method
  - Handles positive and negative IRR
  - Validates against unreasonable values (>1000% or <-100%)
  - Sorts cash flows automatically by date
- **calculateMOIC()** - Multiple on Invested Capital
  - Handles multiple contributions and distributions
  - Returns null when no contributions exist
- **getVintageYear()** - First contribution year
- **getTotalByType()** - Sum contributions or distributions
- **getLatestNav()** - Latest NAV with subsequent cash flow adjustments
- **getOutstandingCommitment()** - Remaining commitment calculation
- **parseCashFlowsForIRR()** - Prepare cash flows for IRR calculation
- **calculateMetrics()** - Comprehensive metrics calculation

### validation.js (100% coverage)
Tests for input validation:
- **isValidDate()** - YYYY-MM-DD format validation
  - Validates regex format
  - Checks for invalid dates (e.g., 2020-02-30)
  - Prevents date rollover
- **validateFundName()** - Fund name validation
  - Length constraints (2-100 characters)
  - Trimming whitespace
- **validateMultiplier()** - Duplicate multiplier validation
  - Positive value check
  - Warnings for extreme values (>1000 or <0.001)
- **validateFileSize()** - Import file size validation
  - Default 50MB limit
  - Customizable max size
- **validateCashFlow()** - Cash flow structure validation
- **validateNavEntry()** - NAV entry structure validation

### formatting.js (97.14% coverage)
Tests for formatting and parsing:
- **parseCurrency()** - Parse currency strings to numbers
  - Handles $, commas, parentheses for negatives
  - Whitespace trimming
- **formatNumberWithCommas()** - Add thousand separators
- **formatCurrency()** - Format as USD currency
  - Optional cents display
  - Handles large and small numbers
- **formatNumber()** - Format with 2 decimal places (for CSV)
- **escapeHtml()** - Escape HTML special characters
- **escapeCSV()** - Escape CSV special characters

### tags.test.js (29 tests)
Tests for tag functionality:
- **Tag Structure** - Array storage on fund objects
  - Tags stored as array
  - Empty arrays for funds without tags
  - Special character handling
- **Tag Validation** - Input validation rules
  - Empty string prevention
  - Whitespace trimming
  - Duplicate tag detection
  - Case-sensitive storage
- **Tag Search** - Search functionality integration
  - Exact tag name matching
  - Partial tag name matching
  - Multi-tag search support
  - Handling missing tags
- **Tag Display** - UI rendering
  - Table tag formatting
  - Modal tag chips with remove buttons
  - Empty state handling
- **Tag Data Operations** - Data manipulation
  - Set to Array conversion
  - Uniqueness in Set
  - Tag removal from arrays
- **Tag Export/Import** - Data portability
  - Tags included in exports
  - Missing tags in imports
  - Unique tag collection
  - Tag preservation in duplication
- **Tag Autocomplete** - User experience
  - Datalist population
  - Selected tag filtering
- **Tag Edge Cases** - Robustness
  - Very long tag names
  - Special characters and Unicode
  - Null and undefined handling

## Key Test Cases

### IRR Calculation Edge Cases
```javascript
// Positive 20% return
{ date: '2020-01-01', amount: -1000 },
{ date: '2021-01-01', amount: 1200 }
// IRR ≈ 0.20 (20%)

// Negative return
{ date: '2020-01-01', amount: -1000 },
{ date: '2021-01-01', amount: 800 }
// IRR ≈ -0.20 (-20%)

// Unreasonable IRR rejected
{ date: '2020-01-01', amount: -1 },
{ date: '2020-01-02', amount: 1000 }
// Returns null (>1000% is unreasonable)
```

### Date Validation
```javascript
isValidDate('2020-01-01')   // true
isValidDate('2020-02-30')   // false (invalid day)
isValidDate('2020-13-01')   // false (invalid month)
isValidDate('01/01/2020')   // false (wrong format)
```

### Currency Parsing
```javascript
parseCurrency('$1,000.50')    // 1000.50
parseCurrency('($1,000)')     // -1000 (parentheses = negative)
parseCurrency('  $1000  ')    // 1000 (whitespace trimmed)
```

## Coverage Thresholds

The project enforces minimum coverage thresholds:
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

Tests will fail if coverage drops below these thresholds.

## Continuous Integration

To integrate with CI/CD:

```bash
# Run tests and fail if coverage drops
npm test -- --coverage --coverageThreshold='{"global":{"branches":70,"functions":70,"lines":70,"statements":70}}'
```

## Adding New Tests

### Test file naming
- Place tests in `__tests__/` directory
- Name files `*.test.js`

### Test structure
```javascript
import { functionToTest } from '../src/module.js';

describe('functionToTest', () => {
    test('description of what it should do', () => {
        expect(functionToTest(input)).toBe(expectedOutput);
    });

    test('handles edge case', () => {
        expect(functionToTest(edgeCase)).toBeNull();
    });
});
```

## Benefits of Testing

1. **Regression Prevention**: Catch bugs before they reach production
2. **Refactoring Confidence**: Make changes without fear of breaking existing functionality
3. **Documentation**: Tests serve as examples of how functions should be used
4. **Code Quality**: Writing testable code leads to better architecture
5. **Debugging**: Failing tests pinpoint exact issues

## Next Steps

Future testing enhancements:
- Integration tests for database operations (IndexedDB)
- End-to-end tests for user workflows
- Performance tests for large datasets
- Visual regression tests for UI components

## Troubleshooting

### Tests fail with "Cannot use import statement"
- Ensure `"type": "module"` is in package.json
- Check babel.config.js is properly configured

### Coverage not working
- Run `npm install` to ensure all dependencies are installed
- Check jest.config.js has correct collectCoverageFrom patterns

### Tests timeout
- Increase timeout in jest.config.js
- Check for infinite loops in calculation functions (especially IRR)
