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

import { TFile, getAllTags } from 'obsidian';
import { type ContentProviderType } from '../../interfaces/IContentProvider';
import { NotebookNavigatorSettings } from '../../settings';
import { FileData } from '../../storage/IndexedDBStorage';
import { getDBInstance } from '../../storage/fileOperations';
import { BaseContentProvider, type ContentProviderProcessResult } from './BaseContentProvider';

/**
 * Content provider for extracting tags from files
 */
export class TagContentProvider extends BaseContentProvider {
    // When tags are regenerated due to a metadata-only change, `markFilesForRegeneration()` resets `tagsMtime` to 0.
    // If Obsidian has not populated tags in the metadata cache yet, defer clearing existing tags for a few retries.
    private static readonly EMPTY_TAGS_RETRY_LIMIT = 2;

    // Tracks consecutive empty-tag reads for files with `tagsMtime === 0` and existing non-empty tags.
    // Returning `processed:false` triggers BaseContentProvider retry scheduling.
    private readonly emptyTagRetryCounts = new Map<string, number>();

    getContentType(): ContentProviderType {
        return 'tags';
    }

    getRelevantSettings(): (keyof NotebookNavigatorSettings)[] {
        return ['showTags'];
    }

    shouldRegenerate(oldSettings: NotebookNavigatorSettings, newSettings: NotebookNavigatorSettings): boolean {
        // Clear if tags are disabled
        if (!newSettings.showTags && oldSettings.showTags) {
            return true;
        }

        // Regenerate if tags are enabled and weren't before
        if (newSettings.showTags && !oldSettings.showTags) {
            return true;
        }

        return false;
    }

    async clearContent(_context?: { oldSettings: NotebookNavigatorSettings; newSettings: NotebookNavigatorSettings }): Promise<void> {
        const db = getDBInstance();
        await db.batchClearAllFileContent('tags');
        this.emptyTagRetryCounts.clear();
    }

    protected needsProcessing(fileData: FileData | null, file: TFile, settings: NotebookNavigatorSettings): boolean {
        if (!settings.showTags) {
            return false;
        }

        if (file.extension !== 'md') {
            return false;
        }

        const needsRefresh = fileData !== null && fileData.tagsMtime !== file.stat.mtime;
        return !fileData || fileData.tags === null || needsRefresh;
    }

    protected async processFile(
        job: { file: TFile; path: string[] },
        fileData: FileData | null,
        settings: NotebookNavigatorSettings
    ): Promise<ContentProviderProcessResult> {
        if (!settings.showTags) {
            return { update: null, processed: true };
        }

        if (job.file.extension !== 'md') {
            return { update: null, processed: true };
        }

        try {
            const metadata = this.app.metadataCache.getFileCache(job.file);
            if (!metadata) {
                this.emptyTagRetryCounts.delete(job.file.path);
                return { update: null, processed: false };
            }

            const rawTags = getAllTags(metadata);
            const tags = this.extractTagsFromMetadata(rawTags);

            const shouldDeferClearing =
                fileData !== null && fileData.tagsMtime === 0 && fileData.tags !== null && fileData.tags.length > 0 && tags.length === 0;

            if (!shouldDeferClearing) {
                this.emptyTagRetryCounts.delete(job.file.path);
            }

            if (shouldDeferClearing) {
                const attempts = this.emptyTagRetryCounts.get(job.file.path) ?? 0;
                if (attempts < TagContentProvider.EMPTY_TAGS_RETRY_LIMIT) {
                    this.emptyTagRetryCounts.set(job.file.path, attempts + 1);
                    return { update: null, processed: false };
                }

                this.emptyTagRetryCounts.delete(job.file.path);
            }

            // Only return update if tags changed
            if (fileData && this.tagsEqual(fileData.tags, tags)) {
                return { update: null, processed: true };
            }

            return { update: { path: job.file.path, tags }, processed: true };
        } catch (error) {
            console.error(`Error extracting tags for ${job.file.path}:`, error);
            return { update: null, processed: false };
        }
    }

    /**
     * Extract tags from cached metadata.
     *
     * Tags are returned with their original casing as found in the vault,
     * without the # prefix. For example, "#ToDo" becomes "ToDo".
     *
     * Duplicate tags with different casing are deduplicated - only the first
     * occurrence is kept. For example, if a file has #todo and #TODO, only
     * "todo" (the first one) is returned.
     *
     * The tag tree building process will later normalize these to lowercase
     * for the `path` property while preserving the original casing in `displayPath`.
     *
     * @param rawTags - Raw tag strings returned by Obsidian (with # prefix)
     * @returns Array of unique tag strings without # prefix, in original casing
     */
    private extractTagsFromMetadata(rawTags: string[] | null): string[] {
        if (!rawTags || rawTags.length === 0) return [];

        // Deduplicate tags while preserving the first occurrence's casing
        const seen = new Set<string>();
        const uniqueTags: string[] = [];

        for (const tag of rawTags) {
            // Remove # prefix
            const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
            const lowerTag = cleanTag.toLowerCase();

            // Only add if we haven't seen this tag (case-insensitive)
            if (!seen.has(lowerTag)) {
                seen.add(lowerTag);
                uniqueTags.push(cleanTag);
            }
        }

        return uniqueTags;
    }

    /**
     * Check if two tag arrays are equal.
     * Handles null values properly.
     *
     * @param tags1 - First tag array (can be null)
     * @param tags2 - Second tag array (can be null)
     * @returns True if tags are equal
     */
    private tagsEqual(tags1: string[] | null, tags2: string[] | null): boolean {
        if (tags1 === tags2) return true; // Both null or same reference
        if (tags1 === null || tags2 === null) return false; // One is null
        if (tags1.length !== tags2.length) return false;
        return tags1.every((tag, i) => tag === tags2[i]);
    }
}
