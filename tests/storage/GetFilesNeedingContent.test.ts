/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from 'vitest';
import { MemoryFileCache } from '../../src/storage/MemoryFileCache';
import { IndexedDBStorage, type FileData } from '../../src/storage/IndexedDBStorage';

function createFileData(overrides: Partial<FileData>): FileData {
    return {
        mtime: 0,
        markdownPipelineMtime: 0,
        tagsMtime: 0,
        metadataMtime: 0,
        fileThumbnailsMtime: 0,
        tags: [],
        customProperty: null,
        previewStatus: 'none',
        featureImage: null,
        featureImageStatus: 'none',
        featureImageKey: '',
        metadata: {},
        ...overrides
    };
}

describe('IndexedDBStorage.getFilesNeedingContent', () => {
    it('ignores non-markdown files for tags and metadata', () => {
        const cache = new MemoryFileCache();
        cache.markInitialized();

        cache.updateFile(
            'docs/file.pdf',
            createFileData({
                tags: null,
                metadata: null,
                previewStatus: 'none'
            })
        );
        cache.updateFile(
            'notes/note.md',
            createFileData({
                tags: null,
                metadata: null,
                previewStatus: 'unprocessed'
            })
        );

        const tagsNeeding = IndexedDBStorage.prototype.getFilesNeedingContent.call({ cache }, 'tags');
        expect(tagsNeeding.has('notes/note.md')).toBe(true);
        expect(tagsNeeding.has('docs/file.pdf')).toBe(false);

        const metadataNeeding = IndexedDBStorage.prototype.getFilesNeedingContent.call({ cache }, 'metadata');
        expect(metadataNeeding.has('notes/note.md')).toBe(true);
        expect(metadataNeeding.has('docs/file.pdf')).toBe(false);
    });
});
