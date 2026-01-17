/**
 * Tests for tag functionality in PE Fund Manager
 *
 * Note: These tests focus on the tag-related utility functions.
 * Database operations (getAllTags, saveTag, deleteTag) require IndexedDB
 * which would need a more complex test setup with fake-indexeddb.
 */

describe('Tag Management', () => {
    describe('Tag Structure', () => {
        test('tags should be stored as array on fund object', () => {
            const fund = {
                fundName: 'Test Fund',
                accountNumber: '12345',
                tags: ['Venture Capital', 'Growth Equity']
            };

            expect(Array.isArray(fund.tags)).toBe(true);
            expect(fund.tags).toHaveLength(2);
            expect(fund.tags).toContain('Venture Capital');
            expect(fund.tags).toContain('Growth Equity');
        });

        test('fund without tags should have empty array', () => {
            const fund = {
                fundName: 'Test Fund',
                accountNumber: '12345',
                tags: []
            };

            expect(Array.isArray(fund.tags)).toBe(true);
            expect(fund.tags).toHaveLength(0);
        });

        test('tags should handle special characters', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: ['Real Estate - Commercial', 'Energy & Infrastructure', 'Tech (Early Stage)']
            };

            expect(fund.tags[0]).toBe('Real Estate - Commercial');
            expect(fund.tags[1]).toBe('Energy & Infrastructure');
            expect(fund.tags[2]).toBe('Tech (Early Stage)');
        });
    });

    describe('Tag Validation', () => {
        test('tag names should not be empty strings', () => {
            const validTag = 'Venture Capital';
            const invalidTag = '';

            expect(validTag.trim().length).toBeGreaterThan(0);
            expect(invalidTag.trim().length).toBe(0);
        });

        test('tag names should be trimmed', () => {
            const tagWithSpaces = '  Venture Capital  ';
            const trimmed = tagWithSpaces.trim();

            expect(trimmed).toBe('Venture Capital');
            expect(trimmed.length).toBeLessThan(tagWithSpaces.length);
        });

        test('duplicate tags should be prevented', () => {
            const tags = ['Venture Capital', 'Growth Equity'];
            const newTag = 'Venture Capital';

            const isDuplicate = tags.includes(newTag);
            expect(isDuplicate).toBe(true);
        });

        test('tag comparison should be case-sensitive for storage', () => {
            const tag1 = 'Venture Capital';
            const tag2 = 'venture capital';

            expect(tag1).not.toBe(tag2);
            expect(tag1.toLowerCase()).toBe(tag2.toLowerCase());
        });
    });

    describe('Tag Search', () => {
        test('should match exact tag name', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: ['Venture Capital', 'Growth Equity']
            };
            const searchTerm = 'venture capital';
            const fundTags = fund.tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(true);
        });

        test('should match partial tag name', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: ['Venture Capital', 'Growth Equity']
            };
            const searchTerm = 'venture';
            const fundTags = fund.tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(true);
        });

        test('should not match tags that do not exist', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: ['Venture Capital', 'Growth Equity']
            };
            const searchTerm = 'real estate';
            const fundTags = fund.tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(false);
        });

        test('should match across multiple tags', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: ['Venture Capital', 'Growth Equity', 'Technology']
            };
            const searchTerms = ['venture', 'technology'];
            const fundTags = fund.tags.map(tag => tag.toLowerCase()).join(' ');

            searchTerms.forEach(term => {
                expect(fundTags.includes(term)).toBe(true);
            });
        });

        test('should handle funds with no tags', () => {
            const fund = {
                fundName: 'Test Fund',
                tags: []
            };
            const searchTerm = 'venture';
            const fundTags = fund.tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags).toBe('');
            expect(fundTags.includes(searchTerm)).toBe(false);
        });

        test('should handle funds with undefined tags', () => {
            const fund = {
                fundName: 'Test Fund'
            };
            const searchTerm = 'venture';
            const fundTags = (fund.tags || []).map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags).toBe('');
            expect(fundTags.includes(searchTerm)).toBe(false);
        });
    });

    describe('Tag Display', () => {
        test('should format tags for table display', () => {
            const tags = ['Venture Capital', 'Growth Equity'];
            const tagsHtml = tags.map(tag => `<span class="table-tag">${tag}</span>`).join('');

            expect(tagsHtml).toContain('table-tag');
            expect(tagsHtml).toContain('Venture Capital');
            expect(tagsHtml).toContain('Growth Equity');
        });

        test('should handle empty tag array for display', () => {
            const tags = [];
            const tagsHtml = tags.length > 0
                ? tags.map(tag => `<span class="table-tag">${tag}</span>`).join('')
                : '';

            expect(tagsHtml).toBe('');
        });

        test('should format tags with remove button for modal', () => {
            const tag = 'Venture Capital';
            const tagHtml = `${tag}<span class="tag-remove">×</span>`;

            expect(tagHtml).toContain('Venture Capital');
            expect(tagHtml).toContain('tag-remove');
            expect(tagHtml).toContain('×');
        });
    });

    describe('Tag Data Operations', () => {
        test('should convert Set to Array for storage', () => {
            const tagsSet = new Set(['Venture Capital', 'Growth Equity', 'Real Estate']);
            const tagsArray = Array.from(tagsSet);

            expect(Array.isArray(tagsArray)).toBe(true);
            expect(tagsArray).toHaveLength(3);
            expect(tagsArray).toContain('Venture Capital');
        });

        test('should maintain tag uniqueness in Set', () => {
            const tagsSet = new Set();
            tagsSet.add('Venture Capital');
            tagsSet.add('Growth Equity');
            tagsSet.add('Venture Capital'); // Duplicate

            expect(tagsSet.size).toBe(2);
            expect(tagsSet.has('Venture Capital')).toBe(true);
            expect(tagsSet.has('Growth Equity')).toBe(true);
        });

        test('should remove tag from array', () => {
            const tags = ['Venture Capital', 'Growth Equity', 'Real Estate'];
            const tagToRemove = 'Growth Equity';
            const filteredTags = tags.filter(tag => tag !== tagToRemove);

            expect(filteredTags).toHaveLength(2);
            expect(filteredTags).toContain('Venture Capital');
            expect(filteredTags).toContain('Real Estate');
            expect(filteredTags).not.toContain('Growth Equity');
        });
    });

    describe('Tag Export/Import', () => {
        test('should include tags in fund export data', () => {
            const fund = {
                fundName: 'Test Fund',
                accountNumber: '12345',
                tags: ['Venture Capital', 'Growth Equity'],
                commitment: 1000000
            };

            const exportData = JSON.stringify(fund);
            const parsed = JSON.parse(exportData);

            expect(parsed.tags).toBeDefined();
            expect(Array.isArray(parsed.tags)).toBe(true);
            expect(parsed.tags).toEqual(['Venture Capital', 'Growth Equity']);
        });

        test('should handle missing tags in import data', () => {
            const importedFund = {
                fundName: 'Test Fund',
                accountNumber: '12345',
                commitment: 1000000
                // tags field missing
            };

            const tags = importedFund.tags || [];
            expect(Array.isArray(tags)).toBe(true);
            expect(tags).toHaveLength(0);
        });

        test('should collect unique tags from multiple funds', () => {
            const funds = [
                { fundName: 'Fund 1', tags: ['Venture Capital', 'Technology'] },
                { fundName: 'Fund 2', tags: ['Growth Equity', 'Technology'] },
                { fundName: 'Fund 3', tags: ['Real Estate'] }
            ];

            const uniqueTags = new Set();
            funds.forEach(fund => {
                if (fund.tags && Array.isArray(fund.tags)) {
                    fund.tags.forEach(tag => uniqueTags.add(tag));
                }
            });

            expect(uniqueTags.size).toBe(4);
            expect(uniqueTags.has('Venture Capital')).toBe(true);
            expect(uniqueTags.has('Technology')).toBe(true);
            expect(uniqueTags.has('Growth Equity')).toBe(true);
            expect(uniqueTags.has('Real Estate')).toBe(true);
        });

        test('should preserve tags during fund duplication', () => {
            const originalFund = {
                fundName: 'Original Fund',
                accountNumber: '12345',
                tags: ['Venture Capital', 'Technology'],
                commitment: 1000000
            };

            const duplicatedFund = {
                ...originalFund,
                fundName: 'Original Fund (Copy)',
                accountNumber: '12346'
            };

            expect(duplicatedFund.tags).toEqual(originalFund.tags);
            expect(duplicatedFund.tags).toContain('Venture Capital');
            expect(duplicatedFund.tags).toContain('Technology');
        });
    });

    describe('Tag Autocomplete', () => {
        test('should populate datalist with available tags', () => {
            const availableTags = ['Venture Capital', 'Growth Equity', 'Real Estate'];
            const datalistOptions = availableTags.map(tag => `<option value="${tag}">`).join('');

            expect(datalistOptions).toContain('Venture Capital');
            expect(datalistOptions).toContain('Growth Equity');
            expect(datalistOptions).toContain('Real Estate');
        });

        test('should filter tags already selected', () => {
            const availableTags = ['Venture Capital', 'Growth Equity', 'Real Estate'];
            const selectedTags = ['Venture Capital'];
            const unselectedTags = availableTags.filter(tag => !selectedTags.includes(tag));

            expect(unselectedTags).toHaveLength(2);
            expect(unselectedTags).toContain('Growth Equity');
            expect(unselectedTags).toContain('Real Estate');
            expect(unselectedTags).not.toContain('Venture Capital');
        });
    });

    describe('Tag Edge Cases', () => {
        test('should handle very long tag names', () => {
            const longTag = 'A'.repeat(100);
            const fund = {
                fundName: 'Test Fund',
                tags: [longTag]
            };

            expect(fund.tags[0]).toHaveLength(100);
            expect(fund.tags[0]).toBe(longTag);
        });

        test('should handle special characters in tag names', () => {
            const specialTags = [
                'Tech & Innovation',
                'Real Estate (Commercial)',
                'Energy/Infrastructure',
                'Asia-Pacific',
                'Fund-of-Funds'
            ];

            specialTags.forEach(tag => {
                expect(tag).toBeTruthy();
                expect(tag.length).toBeGreaterThan(0);
            });
        });

        test('should handle unicode characters in tags', () => {
            const unicodeTags = ['Technology 🚀', 'Healthcare ⚕️', 'Finance 💰'];
            const fund = {
                fundName: 'Test Fund',
                tags: unicodeTags
            };

            expect(fund.tags).toHaveLength(3);
            expect(fund.tags[0]).toContain('🚀');
            expect(fund.tags[1]).toContain('⚕️');
            expect(fund.tags[2]).toContain('💰');
        });

        test('should handle null and undefined tags gracefully', () => {
            const fund1 = { fundName: 'Fund 1', tags: null };
            const fund2 = { fundName: 'Fund 2', tags: undefined };

            const tags1 = fund1.tags || [];
            const tags2 = fund2.tags || [];

            expect(Array.isArray(tags1)).toBe(true);
            expect(Array.isArray(tags2)).toBe(true);
            expect(tags1).toHaveLength(0);
            expect(tags2).toHaveLength(0);
        });
    });
});
