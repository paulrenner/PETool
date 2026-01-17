# PE Fund Manager

A comprehensive web-based application for managing Private Equity fund investments, tracking performance metrics, and analyzing portfolio returns.

## Features

### Fund Management
- **Add and Edit Funds**: Create new fund investments with detailed information
- **Custom Tags**: Organize funds with custom tags (e.g., Venture Capital, Growth Equity, Real Estate)
- **Account Tracking**: Manage multiple accounts per fund
- **Commitment Tracking**: Monitor total commitments and outstanding amounts
- **Group Organization**: Organize funds into hierarchical groups and subgroups

### Cash Flow Tracking
- **Contributions**: Record capital calls and contributions with dates and amounts
- **Distributions**: Track distributions received from funds
- **Commitment Impact**: Flag cash flows that affect outstanding commitments
- **Flexible Entry**: Add, edit, or remove cash flows at any time

### NAV (Net Asset Value) Management
- **Monthly NAV**: Record fund valuations at any frequency
- **Historical Tracking**: View NAV trends over time
- **Automatic Adjustments**: NAV automatically adjusts for subsequent cash flows

### Performance Metrics
Automatically calculated for each fund:
- **IRR (Internal Rate of Return)**: Time-weighted return calculation
- **MOIC (Multiple on Invested Capital)**: Total return multiple
- **Total Contributions**: Sum of all capital calls
- **Total Distributions**: Sum of all distributions received
- **Current NAV**: Latest reported net asset value
- **Outstanding Commitment**: Remaining unfunded commitment
- **Vintage Year**: Year of first contribution

### Search and Filtering
- **Real-time Search**: Search across fund names, account numbers, and tags
- **Group Filtering**: Filter funds by group membership
- **Instant Results**: Filter results update as you type

### Data Management
- **Import/Export**: Backup and restore data via JSON
- **Duplicate Funds**: Quickly create similar funds with one click
- **Bulk Operations**: Export to CSV or PDF for analysis
- **Data Validation**: Input validation prevents errors

### Reporting
- **Summary Table**: View all funds and metrics in one table
- **Export Options**:
  - CSV export for Excel analysis
  - PDF export for presentations and reports
- **Group Summaries**: Aggregate metrics by group

## Custom Tags Feature

### Adding Tags to Funds

1. **Open Fund Modal**: When adding or editing a fund, scroll to the "Tags" section
2. **Enter Tag Name**: Type a tag name (e.g., "Venture Capital", "Technology", "Asia-Pacific")
3. **Press Enter**: Hit Enter to add the tag
4. **Autocomplete**: Previously used tags appear as suggestions while you type
5. **Remove Tags**: Click the × button on any tag to remove it

### Tag Examples

Common tag categories:
- **Asset Class**: Venture Capital, Growth Equity, Buyout, Real Estate, Infrastructure
- **Sector**: Technology, Healthcare, Financial Services, Energy, Consumer
- **Geography**: North America, Europe, Asia-Pacific, Emerging Markets
- **Stage**: Early Stage, Growth Stage, Late Stage, Mature
- **Strategy**: Value, Growth, Distressed, Special Situations

### Searching by Tags

Use the search box at the top of the table to find funds by tag:
- Type any tag name (partial matches work)
- Search is case-insensitive
- Searches across fund name, account number, and all tags simultaneously

### Tag Display

- **In Modal**: Tags appear as blue pills with × buttons for removal
- **In Table**: Tags appear as small light-blue pills below the fund name
- **In Exports**: Tags are included in JSON and CSV exports

### Tag Management

Tags are automatically:
- **Saved**: First time you use a tag, it's saved for autocomplete
- **Persisted**: Tags are stored in your browser's IndexedDB
- **Exported**: Included in database exports
- **Imported**: Restored when importing database backups

## Technical Details

### Technology Stack
- **Frontend**: Pure HTML/CSS/JavaScript (no framework dependencies)
- **Storage**: IndexedDB for local browser storage
- **Testing**: Jest with 152 unit tests (95.78% coverage)
- **Exports**: jsPDF and jsPDF-AutoTable for PDF generation

### Browser Compatibility
- Modern browsers with IndexedDB support (Chrome, Firefox, Safari, Edge)
- No server required - runs entirely in the browser
- Data stored locally for privacy and speed

### Data Storage
- All data stored in browser's IndexedDB
- No data sent to external servers
- Manual backup/restore via JSON export/import
- Data persists across sessions

### Security Features
- Input validation on all fields
- HTML escaping prevents XSS attacks
- CSV injection prevention
- File size limits on imports (50MB)

## Installation

No installation required! Simply:
1. Open `index.html` in a web browser
2. Start adding funds

For development:
```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Testing

The application includes comprehensive unit tests:
- **152 tests** across 4 test suites
- **95.78%** statement coverage
- **86.45%** branch coverage
- **97.72%** function coverage

See [TESTING.md](TESTING.md) for detailed testing documentation.

## Usage Tips

### Keyboard Shortcuts
- **Ctrl/Cmd + F**: Jump to search box
- **Escape**: Close modals
- **Enter**: Add tags in tag input field

### Best Practices
1. **Regular Exports**: Periodically export your database as backup
2. **Consistent Naming**: Use consistent fund names and tags
3. **Tag Strategy**: Develop a tagging taxonomy early
4. **Group Structure**: Plan your group hierarchy before creating many funds
5. **Monthly Updates**: Update NAV and cash flows regularly

### Performance Tips
- **Search**: Use search to quickly find funds instead of scrolling
- **Groups**: Use groups to organize large portfolios
- **Tags**: Tag funds for multi-dimensional organization
- **Export**: Use CSV export for large-scale data analysis in Excel

## Data Privacy

- **100% Local**: All data stays in your browser
- **No Tracking**: No analytics or tracking code
- **No Cloud**: No data sent to external servers
- **You Control**: Manual backup via export/import

## Troubleshooting

### Data Not Saving
- Ensure browser allows IndexedDB storage
- Check browser storage limits (usually several GB available)
- Try clearing browser cache and re-importing data

### Import Errors
- Verify JSON file is valid (use a JSON validator)
- Check file size is under 50MB
- Ensure file was exported from this application

### Performance Issues
- Close other browser tabs to free memory
- Export and reimport database to optimize
- Use search/filter instead of scrolling large tables

## Contributing

This is a standalone application with modular code structure:
- `/src/calculations.js` - Financial calculations (IRR, MOIC, metrics)
- `/src/validation.js` - Input validation functions
- `/src/formatting.js` - Currency and number formatting
- `/src/__tests__/` - Jest unit tests

## License

This application is provided as-is for personal and commercial use.

## Version History

### v1.3.0 (Current)
- Added custom tagging system
- Tag autocomplete functionality
- Tag search integration
- 29 new tests for tag features

### v1.2.0
- Comprehensive unit testing (152 tests)
- Modular code structure
- Code coverage reporting

### v1.1.0
- Security improvements (XSS prevention, validation)
- UX enhancements (loading indicators, keyboard shortcuts)
- Search functionality
- Group management

### v1.0.0
- Initial release
- Basic fund management
- Cash flow and NAV tracking
- Performance metrics calculation
- Import/export functionality
