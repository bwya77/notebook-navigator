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
import type { FileData } from '../../src/storage/IndexedDBStorage';
import { recordFileChanges } from '../../src/storage/fileOperations';
import { createTestTFile } from '../utils/createTestTFile';

class FakeDb {
    private readonly files = new Map<string, FileData>();

    setFile(path: string, data: FileData): void {
        this.files.set(path, { ...data });
    }

    getFile(path: string): FileData | null {
        return this.files.get(path) ?? null;
    }

    async upsertFilesWithPatch(updates: { path: string; create: FileData; patch?: Partial<FileData> }[]): Promise<void> {
        for (const update of updates) {
            const existing = this.files.get(update.path);
            if (existing) {
                this.files.set(update.path, { ...existing, ...(update.patch ?? {}) });
                continue;
            }

            this.files.set(update.path, { ...update.create, ...(update.patch ?? {}) });
        }
    }
}

function createFileData(overrides: Partial<FileData>): FileData {
    return {
        mtime: 0,
        markdownPipelineMtime: 0,
        tagsMtime: 0,
        metadataMtime: 0,
        fileThumbnailsMtime: 0,
        tags: null,
        customProperty: null,
        previewStatus: 'unprocessed',
        featureImage: null,
        featureImageStatus: 'unprocessed',
        featureImageKey: null,
        metadata: null,
        ...overrides
    };
}

describe('recordFileChanges rename merge', () => {
    it('applies pending rename snapshot when a destination record already exists', async () => {
        const db = new FakeDb();
        const file = createTestTFile('notes/renamed.md');
        file.stat.mtime = 200;

        const destinationRecord = createFileData({
            mtime: 150,
            markdownPipelineMtime: 150,
            tagsMtime: 150,
            metadataMtime: 150,
            tags: ['destination'],
            customProperty: 'destination',
            previewStatus: 'none',
            featureImageStatus: 'none',
            featureImageKey: '',
            metadata: { icon: 'destination' }
        });

        const pendingRenameSnapshot = createFileData({
            mtime: 150,
            markdownPipelineMtime: 0,
            tagsMtime: 0,
            metadataMtime: 0,
            tags: ['source'],
            customProperty: 'source',
            previewStatus: 'has',
            featureImageStatus: 'has',
            featureImageKey: 'f:images/cover.png@123',
            metadata: { icon: 'source' }
        });

        db.setFile(file.path, destinationRecord);

        const existingData = new Map<string, FileData>([[file.path, destinationRecord]]);
        const renamedData = new Map<string, FileData>([[file.path, pendingRenameSnapshot]]);

        await recordFileChanges([file], existingData, renamedData, db);

        const updated = db.getFile(file.path);
        expect(updated).not.toBeNull();
        if (!updated) {
            throw new Error('Expected file record to exist');
        }

        expect(updated.mtime).toBe(200);
        expect(updated.tags).toEqual(['source']);
        expect(updated.customProperty).toBe('source');
        expect(updated.previewStatus).toBe('has');
        expect(updated.featureImageStatus).toBe('has');
        expect(updated.featureImageKey).toBe('f:images/cover.png@123');
        expect(updated.metadata).toEqual({ icon: 'source' });
        expect(updated.markdownPipelineMtime).toBe(0);
        expect(updated.tagsMtime).toBe(0);
        expect(updated.metadataMtime).toBe(0);
    });
});
