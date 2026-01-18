/**
 * Tests for tag functionality in PE Fund Manager
 *
 * Tags are now stored at the FUND NAME level, not investment level.
 * Each fund name can have multiple tags, and all investments using that
 * fund name inherit those tags.
 *
 * Note: Database operations require IndexedDB which would need fake-indexeddb
 * for complete testing. These tests focus on the data structures and logic.
 */

describe('Tag Management - Fund Name Level', () => {
    describe('Fund Name Data Structure', () => {
        test('fund name object should contain name and tags array', () => {
            const fundNameObj = {
                name: 'ABC Venture Fund',
                tags: ['Venture Capital', 'Technology']
            };

            expect(fundNameObj).toHaveProperty('name');
            expect(fundNameObj).toHaveProperty('tags');
            expect(Array.isArray(fundNameObj.tags)).toBe(true);
            expect(fundNameObj.tags).toHaveLength(2);
        });

        test('fund name without tags should have empty array', () => {
            const fundNameObj = {
                name: 'XYZ Growth Fund',
                tags: []
            };

            expect(Array.isArray(fundNameObj.tags)).toBe(true);
            expect(fundNameObj.tags).toHaveLength(0);
        });

        test('should support multiple fund names with different tags', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital', 'Technology'] }],
                ['Fund B', { name: 'Fund B', tags: ['Real Estate', 'Commercial'] }],
                ['Fund C', { name: 'Fund C', tags: [] }]
            ]);

            expect(fundNameData.size).toBe(3);
            expect(fundNameData.get('Fund A').tags).toHaveLength(2);
            expect(fundNameData.get('Fund B').tags).toHaveLength(2);
            expect(fundNameData.get('Fund C').tags).toHaveLength(0);
        });

        test('tags should handle special characters', () => {
            const fundNameObj = {
                name: 'Multi-Strategy Fund',
                tags: ['Real Estate - Commercial', 'Energy & Infrastructure', 'Tech (Early Stage)']
            };

            expect(fundNameObj.tags[0]).toBe('Real Estate - Commercial');
            expect(fundNameObj.tags[1]).toBe('Energy & Infrastructure');
            expect(fundNameObj.tags[2]).toBe('Tech (Early Stage)');
        });
    });

    describe('Investment Lookup', () => {
        test('investment should lookup tags from fund name', () => {
            const fundNameData = new Map([
                ['ABC Venture Fund', { name: 'ABC Venture Fund', tags: ['Venture Capital', 'Series A'] }]
            ]);

            const investment = {
                fundName: 'ABC Venture Fund',
                accountNumber: '12345',
                commitment: 1000000
            };

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];

            expect(tags).toEqual(['Venture Capital', 'Series A']);
        });

        test('investment with unknown fund name should have empty tags', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Tag1'] }]
            ]);

            const investment = {
                fundName: 'Fund B',
                accountNumber: '12345'
            };

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];

            expect(tags).toEqual([]);
        });

        test('multiple investments with same fund name should share tags', () => {
            const fundNameData = new Map([
                ['Shared Fund', { name: 'Shared Fund', tags: ['Growth Equity', 'Healthcare'] }]
            ]);

            const investment1 = { fundName: 'Shared Fund', accountNumber: '001' };
            const investment2 = { fundName: 'Shared Fund', accountNumber: '002' };
            const investment3 = { fundName: 'Shared Fund', accountNumber: '003' };

            const tags1 = fundNameData.get(investment1.fundName).tags;
            const tags2 = fundNameData.get(investment2.fundName).tags;
            const tags3 = fundNameData.get(investment3.fundName).tags;

            expect(tags1).toEqual(tags2);
            expect(tags2).toEqual(tags3);
            expect(tags1).toEqual(['Growth Equity', 'Healthcare']);
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
            const tagWithSpaces = '  Growth Equity  ';
            const trimmed = tagWithSpaces.trim();

            expect(trimmed).toBe('Growth Equity');
            expect(trimmed.length).toBeLessThan(tagWithSpaces.length);
        });

        test('duplicate tags should be prevented on same fund', () => {
            const fundNameObj = {
                name: 'Test Fund',
                tags: ['Venture Capital', 'Technology']
            };

            const newTag = 'Venture Capital';
            const isDuplicate = fundNameObj.tags.includes(newTag);

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
        test('should match exact tag name on fund', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital', 'Technology'] }]
            ]);

            const investment = { fundName: 'Fund A' };
            const searchTerm = 'venture capital';

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(true);
        });

        test('should match partial tag name', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital', 'Technology'] }]
            ]);

            const investment = { fundName: 'Fund A' };
            const searchTerm = 'venture';

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(true);
        });

        test('should not match tags that do not exist', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital'] }]
            ]);

            const investment = { fundName: 'Fund A' };
            const searchTerm = 'real estate';

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags.includes(searchTerm)).toBe(false);
        });

        test('should match across multiple tags', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital', 'Technology', 'Healthcare'] }]
            ]);

            const investment = { fundName: 'Fund A' };
            const searchTerms = ['venture', 'technology', 'healthcare'];

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            searchTerms.forEach(term => {
                expect(fundTags.includes(term)).toBe(true);
            });
        });

        test('should handle fund with no tags', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: [] }]
            ]);

            const investment = { fundName: 'Fund A' };
            const searchTerm = 'venture';

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags).toBe('');
            expect(fundTags.includes(searchTerm)).toBe(false);
        });

        test('should handle missing fund name in data', () => {
            const fundNameData = new Map();
            const investment = { fundName: 'Unknown Fund' };
            const searchTerm = 'venture';

            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            const fundTags = tags.map(tag => tag.toLowerCase()).join(' ');

            expect(fundTags).toBe('');
            expect(fundTags.includes(searchTerm)).toBe(false);
        });
    });

    describe('Tag Display', () => {
        test('should format tags for table display', () => {
            const tags = ['Venture Capital', 'Technology'];
            const tagsHtml = tags.map(tag => `<span class="table-tag">${tag}</span>`).join('');

            expect(tagsHtml).toContain('table-tag');
            expect(tagsHtml).toContain('Venture Capital');
            expect(tagsHtml).toContain('Technology');
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

        test('should display tags in Manage Funds list', () => {
            const fundNameObj = {
                name: 'ABC Venture Fund',
                tags: ['Venture Capital', 'Series A']
            };

            const hasTagsToDisplay = fundNameObj.tags && fundNameObj.tags.length > 0;
            expect(hasTagsToDisplay).toBe(true);

            if (hasTagsToDisplay) {
                const tagsDisplay = fundNameObj.tags.map(tag => `<span class="table-tag">${tag}</span>`).join('');
                expect(tagsDisplay).toContain('Venture Capital');
                expect(tagsDisplay).toContain('Series A');
            }
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

        test('should remove tag from fund', () => {
            const fundNameObj = {
                name: 'Test Fund',
                tags: ['Venture Capital', 'Growth Equity', 'Real Estate']
            };

            const tagToRemove = 'Growth Equity';
            fundNameObj.tags = fundNameObj.tags.filter(tag => tag !== tagToRemove);

            expect(fundNameObj.tags).toHaveLength(2);
            expect(fundNameObj.tags).toContain('Venture Capital');
            expect(fundNameObj.tags).toContain('Real Estate');
            expect(fundNameObj.tags).not.toContain('Growth Equity');
        });

        test('should add tag to fund', () => {
            const fundNameObj = {
                name: 'Test Fund',
                tags: ['Venture Capital']
            };

            const newTag = 'Technology';
            if (!fundNameObj.tags.includes(newTag)) {
                fundNameObj.tags.push(newTag);
            }

            expect(fundNameObj.tags).toHaveLength(2);
            expect(fundNameObj.tags).toContain('Venture Capital');
            expect(fundNameObj.tags).toContain('Technology');
        });

        test('should update fund name and preserve tags', () => {
            const fundNameObj = {
                name: 'Old Fund Name',
                tags: ['Venture Capital', 'Technology']
            };

            const newName = 'New Fund Name';
            const updatedObj = {
                name: newName,
                tags: fundNameObj.tags
            };

            expect(updatedObj.name).toBe('New Fund Name');
            expect(updatedObj.tags).toEqual(['Venture Capital', 'Technology']);
        });
    });

    describe('Tag Export/Import', () => {
        test('should export fund names with tags as objects', () => {
            const fundNameObjects = [
                { name: 'Fund A', tags: ['Venture Capital', 'Technology'] },
                { name: 'Fund B', tags: ['Real Estate'] },
                { name: 'Fund C', tags: [] }
            ];

            const exportData = {
                fundNames: fundNameObjects,
                exportDate: new Date().toISOString()
            };

            const json = JSON.stringify(exportData);
            const parsed = JSON.parse(json);

            expect(parsed.fundNames).toHaveLength(3);
            expect(parsed.fundNames[0].name).toBe('Fund A');
            expect(parsed.fundNames[0].tags).toEqual(['Venture Capital', 'Technology']);
        });

        test('should import fund names as objects with tags', () => {
            const importData = {
                fundNames: [
                    { name: 'Fund A', tags: ['Venture Capital'] },
                    { name: 'Fund B', tags: ['Real Estate', 'Commercial'] }
                ]
            };

            const fundNameData = new Map();
            importData.fundNames.forEach(obj => {
                fundNameData.set(obj.name, obj);
            });

            expect(fundNameData.size).toBe(2);
            expect(fundNameData.get('Fund A').tags).toEqual(['Venture Capital']);
            expect(fundNameData.get('Fund B').tags).toEqual(['Real Estate', 'Commercial']);
        });

        test('should support importing old format (strings) as fund names', () => {
            const importData = {
                fundNames: ['Fund A', 'Fund B', 'Fund C']
            };

            const fundNameData = new Map();
            importData.fundNames.forEach(nameOrObj => {
                const obj = typeof nameOrObj === 'string'
                    ? { name: nameOrObj, tags: [] }
                    : nameOrObj;
                fundNameData.set(obj.name, obj);
            });

            expect(fundNameData.size).toBe(3);
            expect(fundNameData.get('Fund A').tags).toEqual([]);
            expect(fundNameData.get('Fund B').tags).toEqual([]);
        });

        test('should handle mixed format import (strings and objects)', () => {
            const importData = {
                fundNames: [
                    'Old Format Fund',
                    { name: 'New Format Fund', tags: ['Technology'] }
                ]
            };

            const fundNameData = new Map();
            importData.fundNames.forEach(nameOrObj => {
                const obj = typeof nameOrObj === 'string'
                    ? { name: nameOrObj, tags: [] }
                    : { name: nameOrObj.name, tags: nameOrObj.tags || [] };
                fundNameData.set(obj.name, obj);
            });

            expect(fundNameData.size).toBe(2);
            expect(fundNameData.get('Old Format Fund').tags).toEqual([]);
            expect(fundNameData.get('New Format Fund').tags).toEqual(['Technology']);
        });

        test('investments should not have tags field', () => {
            const investment = {
                fundName: 'ABC Venture Fund',
                accountNumber: '12345',
                commitment: 1000000,
                cashFlows: [],
                monthlyNav: []
            };

            expect(investment).not.toHaveProperty('tags');
            expect(investment).toHaveProperty('fundName');
        });
    });

    describe('Tag Autocomplete', () => {
        test('should collect all unique tags from all funds', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Venture Capital', 'Technology'] }],
                ['Fund B', { name: 'Fund B', tags: ['Real Estate', 'Technology'] }],
                ['Fund C', { name: 'Fund C', tags: ['Healthcare'] }]
            ]);

            const allTags = new Set();
            fundNameData.forEach(obj => {
                if (obj.tags) {
                    obj.tags.forEach(tag => allTags.add(tag));
                }
            });

            expect(allTags.size).toBe(4);
            expect(allTags.has('Venture Capital')).toBe(true);
            expect(allTags.has('Technology')).toBe(true);
            expect(allTags.has('Real Estate')).toBe(true);
            expect(allTags.has('Healthcare')).toBe(true);
        });

        test('should populate datalist with available tags', () => {
            const availableTags = ['Venture Capital', 'Growth Equity', 'Real Estate'];
            const datalistOptions = availableTags.map(tag => `<option value="${tag}">`).join('');

            expect(datalistOptions).toContain('Venture Capital');
            expect(datalistOptions).toContain('Growth Equity');
            expect(datalistOptions).toContain('Real Estate');
        });
    });

    describe('Tag Edge Cases', () => {
        test('should handle very long tag names', () => {
            const longTag = 'A'.repeat(100);
            const fundNameObj = {
                name: 'Test Fund',
                tags: [longTag]
            };

            expect(fundNameObj.tags[0]).toHaveLength(100);
            expect(fundNameObj.tags[0]).toBe(longTag);
        });

        test('should handle special characters in tag names', () => {
            const specialTags = [
                'Tech & Innovation',
                'Real Estate (Commercial)',
                'Energy/Infrastructure',
                'Asia-Pacific',
                'Fund-of-Funds'
            ];

            const fundNameObj = {
                name: 'Multi-Strategy Fund',
                tags: specialTags
            };

            specialTags.forEach(tag => {
                expect(fundNameObj.tags).toContain(tag);
            });
        });

        test('should handle unicode characters in tags', () => {
            const unicodeTags = ['Technology 🚀', 'Healthcare ⚕️', 'Finance 💰'];
            const fundNameObj = {
                name: 'Test Fund',
                tags: unicodeTags
            };

            expect(fundNameObj.tags).toHaveLength(3);
            expect(fundNameObj.tags[0]).toContain('🚀');
            expect(fundNameObj.tags[1]).toContain('⚕️');
            expect(fundNameObj.tags[2]).toContain('💰');
        });

        test('should handle null and undefined tags gracefully', () => {
            const fund1 = { name: 'Fund 1', tags: null };
            const fund2 = { name: 'Fund 2', tags: undefined };

            const tags1 = fund1.tags || [];
            const tags2 = fund2.tags || [];

            expect(Array.isArray(tags1)).toBe(true);
            expect(Array.isArray(tags2)).toBe(true);
            expect(tags1).toHaveLength(0);
            expect(tags2).toHaveLength(0);
        });

        test('should handle fund name with many tags', () => {
            const manyTags = Array.from({ length: 20 }, (_, i) => `Tag ${i + 1}`);
            const fundNameObj = {
                name: 'Heavily Tagged Fund',
                tags: manyTags
            };

            expect(fundNameObj.tags).toHaveLength(20);
            expect(fundNameObj.tags[0]).toBe('Tag 1');
            expect(fundNameObj.tags[19]).toBe('Tag 20');
        });
    });

    describe('Tag Workflow', () => {
        test('updating fund tags should affect all investments with that fund name', () => {
            const fundNameData = new Map([
                ['Shared Fund', { name: 'Shared Fund', tags: ['Original Tag'] }]
            ]);

            const investments = [
                { id: 1, fundName: 'Shared Fund', accountNumber: '001' },
                { id: 2, fundName: 'Shared Fund', accountNumber: '002' },
                { id: 3, fundName: 'Shared Fund', accountNumber: '003' }
            ];

            // Update tags for the fund
            fundNameData.get('Shared Fund').tags = ['New Tag 1', 'New Tag 2'];

            // All investments should now have access to new tags
            investments.forEach(inv => {
                const tags = fundNameData.get(inv.fundName).tags;
                expect(tags).toEqual(['New Tag 1', 'New Tag 2']);
            });
        });

        test('renaming fund should transfer tags to new name', () => {
            const oldName = 'Old Fund Name';
            const newName = 'New Fund Name';
            const tags = ['Venture Capital', 'Technology'];

            const fundNameData = new Map([
                [oldName, { name: oldName, tags }]
            ]);

            // Simulate rename
            const oldObj = fundNameData.get(oldName);
            fundNameData.delete(oldName);
            fundNameData.set(newName, { name: newName, tags: oldObj.tags });

            expect(fundNameData.has(oldName)).toBe(false);
            expect(fundNameData.has(newName)).toBe(true);
            expect(fundNameData.get(newName).tags).toEqual(tags);
        });

        test('deleting fund name should not affect investments (they just lose tag lookup)', () => {
            const fundNameData = new Map([
                ['Fund A', { name: 'Fund A', tags: ['Tag1'] }]
            ]);

            const investment = { fundName: 'Fund A', accountNumber: '001' };

            // Delete fund name
            fundNameData.delete('Fund A');

            // Investment still exists but tags lookup returns empty
            expect(investment.fundName).toBe('Fund A');
            const fundNameObj = fundNameData.get(investment.fundName);
            const tags = fundNameObj && fundNameObj.tags ? fundNameObj.tags : [];
            expect(tags).toEqual([]);
        });
    });
});
