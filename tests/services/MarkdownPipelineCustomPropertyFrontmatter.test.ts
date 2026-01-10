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
import { App, TFile, type CachedMetadata, type FrontMatterCache } from 'obsidian';
import { MarkdownPipelineContentProvider } from '../../src/services/content/MarkdownPipelineContentProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { FileData } from '../../src/storage/IndexedDBStorage';
import { deriveFileMetadata } from '../utils/pathMetadata';

class TestMarkdownPipelineContentProvider extends MarkdownPipelineContentProvider {
    async runCustomProperty(file: TFile, settings: NotebookNavigatorSettings): Promise<FileData['customProperty'] | null> {
        const result = await this.processFile({ file, path: file.path }, null, settings);
        return result.update?.customProperty ?? null;
    }
}

function createSettings(overrides: Partial<NotebookNavigatorSettings>): NotebookNavigatorSettings {
    return {
        ...DEFAULT_SETTINGS,
        showFilePreview: false,
        showFeatureImage: false,
        customPropertyType: 'frontmatter',
        ...overrides
    };
}

function createApp() {
    const app = new App();
    const cachedMetadataByPath = new Map<string, CachedMetadata>();

    app.metadataCache.getFileCache = (file: TFile) => cachedMetadataByPath.get(file.path) ?? null;
    app.vault.cachedRead = async (_file: TFile) => '';

    return { app, cachedMetadataByPath };
}

function createFile(path: string): TFile {
    const file = new TFile();
    const metadata = deriveFileMetadata(path);
    file.path = path;
    file.name = metadata.name;
    file.basename = metadata.basename;
    file.extension = metadata.extension;
    return file;
}

function setFrontmatter(context: ReturnType<typeof createApp>, file: TFile, frontmatter: FrontMatterCache): void {
    const metadata: CachedMetadata = { frontmatter };
    context.cachedMetadataByPath.set(file.path, metadata);
}

describe('MarkdownPipelineContentProvider frontmatter custom properties', () => {
    it('returns multiple properties as pills', async () => {
        const context = createApp();
        const settings = createSettings({ customPropertyFields: 'status, type' });
        const provider = new TestMarkdownPipelineContentProvider(context.app);
        const file = createFile('notes/note.md');

        setFrontmatter(context, file, { status: 'Active', type: 'Project' });
        const result = await provider.runCustomProperty(file, settings);

        expect(result).toEqual([{ value: 'Active' }, { value: 'Project' }]);
    });

    it('flattens list values into multiple pills', async () => {
        const context = createApp();
        const settings = createSettings({ customPropertyFields: 'status, type' });
        const provider = new TestMarkdownPipelineContentProvider(context.app);
        const file = createFile('notes/note.md');

        setFrontmatter(context, file, { status: ['A', 'B'], type: 'Project' });
        const result = await provider.runCustomProperty(file, settings);

        expect(result).toEqual([{ value: 'A' }, { value: 'B' }, { value: 'Project' }]);
    });

    it('pairs color values by property order', async () => {
        const context = createApp();
        const settings = createSettings({
            customPropertyFields: 'status, type',
            customPropertyColorFields: 'statusColor, typeColor'
        });
        const provider = new TestMarkdownPipelineContentProvider(context.app);
        const file = createFile('notes/note.md');

        setFrontmatter(context, file, { status: 'Active', type: 'Project', statusColor: '#ff0000', typeColor: 'todo' });
        const result = await provider.runCustomProperty(file, settings);

        expect(result).toEqual([
            { value: 'Active', color: '#ff0000' },
            { value: 'Project', color: 'todo' }
        ]);
    });

    it('pairs list color values by index', async () => {
        const context = createApp();
        const settings = createSettings({
            customPropertyFields: 'status',
            customPropertyColorFields: 'statusColor'
        });
        const provider = new TestMarkdownPipelineContentProvider(context.app);
        const file = createFile('notes/note.md');

        setFrontmatter(context, file, { status: ['A', 'B'], statusColor: ['red', 'blue'] });
        const result = await provider.runCustomProperty(file, settings);

        expect(result).toEqual([
            { value: 'A', color: 'red' },
            { value: 'B', color: 'blue' }
        ]);
    });
});
