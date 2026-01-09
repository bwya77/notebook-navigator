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

import { STORAGE_KEYS } from '../types';
import { localStorage } from '../utils/localStorage';
import {
    DEFAULT_FEATURE_IMAGE_CACHE_MAX,
    FEATURE_IMAGE_STORE_NAME,
    FeatureImageBlobStore,
    computeFeatureImageMutation
} from './FeatureImageBlobStore';
import { MemoryFileCache } from './MemoryFileCache';
import { isPlainObjectRecordValue } from '../utils/recordUtils';
import { isMarkdownPath } from '../utils/fileTypeUtils';
import type { ContentProviderType } from '../interfaces/IContentProvider';
import { getProviderProcessedMtimeField } from './providerMtime';

const STORE_NAME = 'keyvaluepairs';
const PREVIEW_STORE_NAME = 'filePreviews';
const DB_SCHEMA_VERSION = 3; // IndexedDB structure version
const DB_CONTENT_VERSION = 3; // Data format version

export type FeatureImageStatus = 'unprocessed' | 'none' | 'has';
export type PreviewStatus = 'unprocessed' | 'none' | 'has';

export interface CustomPropertyItem {
    // Rendered pill text (raw frontmatter value or computed value such as word count).
    value: string;
    // Optional color token (tag name or CSS color string).
    color?: string;
}

function isCustomPropertyItem(value: unknown): value is CustomPropertyItem {
    if (!isPlainObjectRecordValue(value)) {
        return false;
    }

    // Persisted data must remain JSON-compatible.
    const rawValue = value['value'];
    if (typeof rawValue !== 'string') {
        return false;
    }

    const rawColor = value['color'];
    if (typeof rawColor !== 'undefined' && typeof rawColor !== 'string') {
        return false;
    }

    return true;
}

function isCustomPropertyData(value: unknown): value is CustomPropertyItem[] {
    if (!Array.isArray(value)) {
        return false;
    }
    return value.every(entry => isCustomPropertyItem(entry));
}

function getDefaultPreviewStatusForPath(path: string): PreviewStatus {
    return isMarkdownPath(path) ? 'unprocessed' : 'none';
}

export function createDefaultFileData(params: { mtime: number; path: string }): FileData {
    const isMarkdown = isMarkdownPath(params.path);
    return {
        mtime: params.mtime,
        markdownPipelineMtime: 0,
        tagsMtime: 0,
        metadataMtime: 0,
        fileThumbnailsMtime: 0,
        tags: isMarkdown ? null : [],
        customProperty: null,
        previewStatus: getDefaultPreviewStatusForPath(params.path),
        featureImage: null,
        featureImageStatus: 'unprocessed',
        featureImageKey: null,
        metadata: isMarkdown ? null : {}
    };
}

/**
 * Sentinel values for metadata date fields
 */
export const METADATA_SENTINEL = {
    /** Indicates that the frontmatter field name is empty/not configured */
    FIELD_NOT_CONFIGURED: 0,
    /** Indicates that parsing the date value failed */
    PARSE_FAILED: -1
} as const;

export interface FileData {
    /**
     * Last observed vault mtime for the file path.
     *
     * Content providers use provider-specific processed mtimes (e.g. `markdownPipelineMtime`)
     * to determine whether their cached output is stale for the current file version.
     */
    mtime: number;
    /**
     * Last file mtime processed by the markdown pipeline provider.
     *
     * Used to detect markdown changes even when existing preview/feature image/custom property values remain visible
     * until regeneration completes.
     */
    markdownPipelineMtime: number;
    /**
     * Last file mtime processed by the tags provider.
     */
    tagsMtime: number;
    /**
     * Last file mtime processed by the metadata provider.
     */
    metadataMtime: number;
    /**
     * Last file mtime processed by the file thumbnails provider (non-markdown thumbnails like PDF covers).
     */
    fileThumbnailsMtime: number;
    tags: string[] | null; // null = not extracted yet (e.g. when tags disabled)
    customProperty: CustomPropertyItem[] | null; // null = not generated yet
    /**
     * Preview text processing state.
     *
     * Semantics:
     * - `unprocessed`: content provider has not run yet for this file
     * - `none`: processed, but no preview text was produced
     * - `has`: processed and a non-empty preview string exists in the preview store
     */
    previewStatus: PreviewStatus;
    /**
     * Feature image placeholder for the main record.
     * Always null in the main store; blobs live in a dedicated blob store.
     * Empty blobs are not persisted; the featureImageKey is the durable marker for "processed but no thumbnail".
     */
    featureImage: Blob | null;
    /**
     * Feature image processing state.
     *
     * Semantics:
     * - `unprocessed`: content provider has not run yet for this file
     * - `none`: processed, but no thumbnail blob is stored (no reference or thumbnail generation failed)
     * - `has`: processed and a thumbnail blob is stored in the blob store
     */
    featureImageStatus: FeatureImageStatus;
    /**
     * Stable key describing the selected feature image source.
     *
     * Semantics:
     * - `null`: not generated yet (pending content generation)
     * - `''`: generated and resolved, but no image reference is selected
     * - `f:<path>@<mtime>`: local vault file reference (image embeds, PDF cover thumbnails)
     * - `e:<url>`: external https URL reference (normalized, without hash)
     * - `y:<videoId>`: YouTube thumbnail reference
     * - `x:<path>@<mtime>`: Excalidraw file preview reference
     */
    featureImageKey: string | null;
    metadata: {
        name?: string;
        created?: number; // Valid timestamp, 0 = field not configured, -1 = parse failed
        modified?: number; // Valid timestamp, 0 = field not configured, -1 = parse failed
        icon?: string;
        color?: string;
        hidden?: boolean; // Whether file matches frontmatter exclusion patterns
    } | null; // null = not generated yet
}

export interface FileContentChange {
    path: string;
    changes: {
        preview?: string | null;
        featureImage?: Blob | null;
        featureImageKey?: string | null;
        featureImageStatus?: FeatureImageStatus;
        metadata?: FileData['metadata'] | null;
        tags?: string[] | null;
        customProperty?: FileData['customProperty'];
    };
    changeType?: 'metadata' | 'content' | 'both';
}

interface IndexedDBStorageOptions {
    featureImageCacheMaxEntries?: number;
    previewTextCacheMaxEntries?: number;
    previewLoadMaxBatch?: number;
}

// Default limits for preview text caching and load batching.
const DEFAULT_PREVIEW_TEXT_CACHE_MAX_ENTRIES = 10000;
const DEFAULT_PREVIEW_LOAD_MAX_BATCH = 50;

/**
 * IndexedDBStorage - Browser's IndexedDB wrapper for persistent file storage
 *
 * What it does:
 * - Stores file metadata and generated content (previews, images, frontmatter) in browser IndexedDB
 * - Provides efficient batch operations for large vaults
 * - Emits real-time change notifications for UI updates
 *
 * Relationships:
 * - Used by: StorageContext, ContentProviders, FileOperations, Statistics
 * - Core persistent storage layer that all other components depend on
 *
 * Key responsibilities:
 * - Manage IndexedDB connection lifecycle
 * - CRUD operations for file records (single and batch)
 * - Stream large datasets without loading into memory
 * - Track and notify about content changes
 * - Provide indexed queries (by tag, by content type)
 */
export class IndexedDBStorage {
    private cache: MemoryFileCache;
    private changeListeners = new Set<(changes: FileContentChange[]) => void>();
    private db: IDBDatabase | null = null;
    private dbName: string;
    // Dedicated feature image blob store with an in-memory LRU.
    private featureImageBlobs: FeatureImageBlobStore;
    // Maximum number of preview text strings held in memory.
    private previewTextCacheMaxEntries: number;
    // Maximum number of preview text paths processed per load flush.
    private previewLoadMaxBatch: number;
    private fileChangeListeners = new Map<string, Set<(changes: FileContentChange['changes']) => void>>();
    private previewLoadPromises = new Map<string, Promise<void>>();
    private previewLoadDeferred = new Map<string, { resolve: () => void }>();
    private previewLoadQueue = new Set<string>();
    private previewLoadFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private isPreviewLoadFlushRunning = false;
    private previewLoadSessionId = 0;
    // Warmup state for background preview text cache population.
    private isPreviewWarmupEnabled = false;
    private isPreviewWarmupComplete = false;
    private isPreviewWarmupRunning = false;
    private previewWarmupCursorKey: string | null = null;
    private previewWarmupTimer: ReturnType<typeof setTimeout> | null = null;
    private isClosing = false;
    private initPromise: Promise<void> | null = null;
    private pendingRebuildNotice = false;

    constructor(appId: string, options?: IndexedDBStorageOptions) {
        this.dbName = `notebooknavigator/cache/${appId}`;
        const previewTextCacheMaxEntries = options?.previewTextCacheMaxEntries ?? DEFAULT_PREVIEW_TEXT_CACHE_MAX_ENTRIES;
        this.cache = new MemoryFileCache({ previewTextCacheMaxEntries });
        this.previewTextCacheMaxEntries = Math.max(0, previewTextCacheMaxEntries);
        this.previewLoadMaxBatch = Math.max(1, options?.previewLoadMaxBatch ?? DEFAULT_PREVIEW_LOAD_MAX_BATCH);
        // Initialize the LRU size from caller options or fallback default.
        const featureImageMaxEntries = options?.featureImageCacheMaxEntries ?? DEFAULT_FEATURE_IMAGE_CACHE_MAX;
        this.featureImageBlobs = new FeatureImageBlobStore(featureImageMaxEntries);
    }

    consumePendingRebuildNotice(): boolean {
        const pending = this.pendingRebuildNotice;
        this.pendingRebuildNotice = false;
        return pending;
    }

    private normalizeFileDataInPlace(data: Partial<FileData> & { preview?: string | null }, pathForDefaults?: string): FileData {
        const featureImageKey = typeof data.featureImageKey === 'string' ? data.featureImageKey : null;
        const rawStatus = data.featureImageStatus;
        const featureImageStatus: FeatureImageStatus =
            rawStatus === 'unprocessed' || rawStatus === 'none' || rawStatus === 'has'
                ? rawStatus
                : featureImageKey === null
                  ? 'unprocessed'
                  : 'none';

        const rawPreviewStatus = data.previewStatus;
        const previewStatus: PreviewStatus =
            rawPreviewStatus === 'unprocessed' || rawPreviewStatus === 'none' || rawPreviewStatus === 'has'
                ? rawPreviewStatus
                : typeof data.preview === 'string'
                  ? data.preview.length > 0
                      ? 'has'
                      : 'none'
                  : typeof pathForDefaults === 'string'
                    ? getDefaultPreviewStatusForPath(pathForDefaults)
                    : 'unprocessed';

        data.mtime = typeof data.mtime === 'number' ? data.mtime : 0;
        // Default provider processed mtimes to the stored mtime for existing databases.
        // New files explicitly initialize these to 0 so providers run at least once.
        data.markdownPipelineMtime = typeof data.markdownPipelineMtime === 'number' ? data.markdownPipelineMtime : data.mtime;
        data.tagsMtime = typeof data.tagsMtime === 'number' ? data.tagsMtime : data.mtime;
        data.metadataMtime = typeof data.metadataMtime === 'number' ? data.metadataMtime : data.mtime;
        data.fileThumbnailsMtime = typeof data.fileThumbnailsMtime === 'number' ? data.fileThumbnailsMtime : data.mtime;
        data.tags = Array.isArray(data.tags) ? data.tags : null;
        data.customProperty = isCustomPropertyData(data.customProperty) ? data.customProperty : null;
        data.previewStatus = previewStatus;
        // Feature image blobs are stored separately from the main record.
        // The MemoryFileCache is used for synchronous rendering and should not hold blob payloads.
        data.featureImage = null;
        data.featureImageStatus = featureImageStatus;
        data.featureImageKey = featureImageKey;
        data.metadata = data.metadata && typeof data.metadata === 'object' ? (data.metadata as FileData['metadata']) : null;

        if ('preview' in data) {
            delete (data as Partial<FileData> & { preview?: string | null }).preview;
        }

        return data as FileData;
    }

    private normalizeFileData(data: Partial<FileData> & { preview?: string | null }): FileData {
        const copy: Partial<FileData> & { preview?: string | null } = { ...data };
        return this.normalizeFileDataInPlace(copy);
    }

    /**
     * Subscribe to content change notifications.
     * Listeners are called whenever file content (preview, image, metadata) is updated.
     *
     * @param listener - Function to call with content changes
     * @returns Unsubscribe function
     */
    onContentChange(listener: (changes: FileContentChange[]) => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    /**
     * Subscribe to content change notifications for a specific file.
     * More efficient than onContentChange as it only receives changes for the specified file.
     *
     * @param path - File path to listen for changes
     * @param listener - Function to call with content changes for this file
     * @returns Unsubscribe function
     */
    onFileContentChange(path: string, listener: (changes: FileContentChange['changes']) => void): () => void {
        let fileListeners = this.fileChangeListeners.get(path);
        if (!fileListeners) {
            fileListeners = new Set();
            this.fileChangeListeners.set(path, fileListeners);
        }
        fileListeners.add(listener);

        return () => {
            const listeners = this.fileChangeListeners.get(path);
            if (listeners) {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    this.fileChangeListeners.delete(path);
                }
            }
        };
    }

    /**
     * Emit content changes to all registered listeners.
     * Catches and logs any errors in listeners to prevent cascading failures.
     *
     * @param changes - Array of content changes to emit
     */
    private emitChanges(changes: FileContentChange[]): void {
        if (changes.length === 0) return;
        // Only log batch operations or errors

        // Emit to global listeners
        this.changeListeners.forEach(listener => {
            try {
                listener(changes);
            } catch (error: unknown) {
                console.error('Error in change listener:', error);
            }
        });

        // Emit to file-specific listeners
        for (const change of changes) {
            const fileListeners = this.fileChangeListeners.get(change.path);
            if (fileListeners) {
                fileListeners.forEach(listener => {
                    try {
                        listener(change.changes);
                    } catch (error: unknown) {
                        console.error('Error in file change listener:', error);
                    }
                });
            }
        }
    }

    /**
     * Check if the database connection is initialized and ready.
     *
     * @returns True if database is connected and ready
     */
    isInitialized(): boolean {
        return this.db !== null;
    }

    /**
     * Initialize the database connection.
     * Creates the database and object stores if they don't exist.
     * Safe to call multiple times - returns existing connection if already initialized.
     */
    async init(): Promise<void> {
        if (this.isClosing) {
            return;
        }
        if (this.db) {
            return;
        }
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.checkSchemaAndInit().catch(error => {
            console.error('Failed to initialize database:', error);
            this.initPromise = null;
            throw error;
        });
        return this.initPromise;
    }

    private parseStoredVersion(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.trunc(value);
        }

        if (typeof value === 'string') {
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }

    private getStoredVersion(key: string): number | null {
        const raw = localStorage.get<unknown>(key);
        return this.parseStoredVersion(raw);
    }

    private isVersionError(error: unknown): boolean {
        return error instanceof DOMException && error.name === 'VersionError';
    }

    private async checkSchemaAndInit(): Promise<void> {
        const storedSchemaVersion = this.getStoredVersion(STORAGE_KEYS.databaseSchemaVersionKey);
        const storedContentVersion = this.getStoredVersion(STORAGE_KEYS.databaseContentVersionKey);
        const currentSchemaVersion = DB_SCHEMA_VERSION;
        const currentContentVersion = DB_CONTENT_VERSION;

        // Check version changes
        const schemaVersionUnknown = storedSchemaVersion === null;
        const contentVersionUnknown = storedContentVersion === null;
        const schemaChanged = storedSchemaVersion !== null && storedSchemaVersion !== currentSchemaVersion;
        const contentChanged = storedContentVersion !== null && storedContentVersion !== currentContentVersion;
        const schemaDowngrade = schemaChanged && storedSchemaVersion !== null && storedSchemaVersion > currentSchemaVersion;

        // Only downgrade schema changes require database recreation; upgrades are handled via onupgradeneeded.
        if (schemaChanged) {
            if (schemaDowngrade) {
                console.log(
                    `Database schema version downgraded from ${storedSchemaVersion} to ${currentSchemaVersion}. Recreating database.`
                );
                await this.deleteDatabase();
            } else {
                console.log(`Database schema version upgraded from ${storedSchemaVersion} to ${currentSchemaVersion}.`);
            }
        } else if (schemaVersionUnknown) {
            console.log(`Database schema version is missing. Rebuilding database.`);
        }

        if (contentChanged) {
            console.log(`Content version changed from ${storedContentVersion} to ${currentContentVersion}. Rebuilding content.`);
        } else if (contentVersionUnknown) {
            console.log('Content version is missing. Rebuilding content.');
        }

        const needsRebuild = schemaDowngrade || contentChanged || schemaVersionUnknown || contentVersionUnknown;
        // Only show the rebuild notice when a version mismatch is detected (not when the keys are missing).
        this.pendingRebuildNotice = schemaDowngrade || contentChanged;

        try {
            await this.openDatabase(needsRebuild);
        } catch (error: unknown) {
            if (this.isVersionError(error)) {
                console.log('Database version mismatch detected. Recreating database.');
            } else {
                console.error('Database open failed. Recreating database.', error);
            }
            this.pendingRebuildNotice = true;
            await this.deleteDatabase();
            await this.openDatabase(true);
        }

        // Clear and rebuild content if either version changed
        if (needsRebuild) {
            // Clear all data to force rebuild
            await this.clear();
        }

        localStorage.set(STORAGE_KEYS.databaseSchemaVersionKey, currentSchemaVersion.toString());
        localStorage.set(STORAGE_KEYS.databaseContentVersionKey, currentContentVersion.toString());
    }

    private async deleteDatabase(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        return new Promise((resolve, reject) => {
            const deleteReq = indexedDB.deleteDatabase(this.dbName);

            deleteReq.onsuccess = () => {
                resolve();
            };

            deleteReq.onerror = () => {
                const deleteError = deleteReq.error;
                console.error('Failed to delete database:', deleteError);
                reject(this.normalizeIdbError(deleteError, 'Failed to delete database'));
            };

            deleteReq.onblocked = () => {
                console.error('Database deletion blocked');
                reject(new Error('Database deletion blocked'));
            };
        });
    }

    /**
     * Converts unknown error types to Error instances for consistent error handling.
     * IndexedDB errors can be DOMExceptions, null, or undefined - this normalizes them.
     */
    private normalizeIdbError(error: unknown, fallbackMessage: string): Error {
        return error instanceof Error ? error : new Error(fallbackMessage);
    }

    /**
     * Rejects a promise with a normalized error from either the transaction or the last request.
     * Prefers the transaction error if available, otherwise uses the last request error.
     */
    private rejectWithTransactionError(
        reject: (reason?: unknown) => void,
        transaction: IDBTransaction,
        lastRequestError: DOMException | Error | null,
        fallbackMessage: string
    ): void {
        const combinedError = transaction.error || lastRequestError;
        reject(this.normalizeIdbError(combinedError, fallbackMessage));
    }

    private async openDatabase(skipCacheLoad: boolean = false): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, DB_SCHEMA_VERSION);

            request.onerror = () => {
                const requestError = request.error;
                console.error('Database open error:', requestError);
                reject(this.normalizeIdbError(requestError, 'Failed to open database'));
            };

            request.onblocked = () => {
                console.error('Database open blocked');
                reject(new Error('Database open blocked'));
            };

            request.onsuccess = async () => {
                this.db = request.result;
                // Reset blob caches whenever a new database connection is opened.
                this.featureImageBlobs.clearMemoryCaches();

                // Close this connection if a version change is requested elsewhere
                if (this.db) {
                    this.db.onversionchange = () => {
                        try {
                            this.db?.close();
                        } catch {
                            // noop
                        }
                        this.db = null;
                    };
                }

                // Initialize the cache with all data from IndexedDB
                if (skipCacheLoad) {
                    this.cache.resetToEmpty();
                } else {
                    try {
                        this.cache.clear();

                        // Wrap an IndexedDB request in a promise so it can be awaited.
                        const requestToPromise = <T>(request: IDBRequest<T>, fallbackMessage: string): Promise<T> =>
                            new Promise((resolveRequest, rejectRequest) => {
                                request.onsuccess = () => resolveRequest(request.result);
                                request.onerror = () => rejectRequest(this.normalizeIdbError(request.error, fallbackMessage));
                            });

                        // Bulk-load the store to avoid per-row cursor callbacks.
                        // Use batching to limit peak memory usage on large vaults.
                        const batchSize = 5000;
                        // Tracks the last key in the previous batch so the next query can resume after it.
                        let lastKey: IDBValidKey | null = null;

                        while (true) {
                            const transaction = this.db.transaction([STORE_NAME], 'readonly');
                            const store = transaction.objectStore(STORE_NAME);
                            // When resuming, start strictly after the last key we processed.
                            const range = lastKey === null ? undefined : IDBKeyRange.lowerBound(lastKey, true);

                            // Fetch keys and values for the same range/count so indexes line up.
                            const keysRequest: IDBRequest<IDBValidKey[]> = store.getAllKeys(range, batchSize);
                            const valuesRequest = store.getAll(range, batchSize) as IDBRequest<Partial<FileData>[]>;
                            const [keys, values] = await Promise.all([
                                requestToPromise(keysRequest, 'getAllKeys failed'),
                                requestToPromise(valuesRequest, 'getAll failed')
                            ]);

                            if (keys.length === 0) {
                                break;
                            }

                            // Apply each row directly into the in-memory cache.
                            // Records are persisted by this class and are expected to already be normalized.
                            // Avoid allocating new objects during hydration by inserting the stored record directly.
                            const rowCount = Math.min(keys.length, values.length);
                            for (let index = 0; index < rowCount; index += 1) {
                                const key = keys[index];
                                if (typeof key !== 'string') {
                                    continue;
                                }
                                this.cache.updateFile(
                                    key,
                                    this.normalizeFileDataInPlace(values[index] as Partial<FileData> & { preview?: string | null }, key)
                                );
                            }

                            // Continue from the last key returned in this batch.
                            lastKey = keys[keys.length - 1];
                            // If IndexedDB returned fewer than the requested count, there are no more rows.
                            if (keys.length < batchSize) {
                                break;
                            }
                        }

                        // All data loaded, mark cache as ready.
                        this.cache.markInitialized();
                    } catch (error: unknown) {
                        console.error('[DB Cache] Failed to initialize cache:', error);
                        console.error(
                            '[DB Cache] IndexedDB cache hydration failed. Run Notebook Navigator: Rebuild cache to reset the database.'
                        );
                        this.cache.resetToEmpty();
                    }
                }

                resolve();
            };

            request.onupgradeneeded = event => {
                const target = event.target;
                if (!(target instanceof IDBOpenDBRequest)) {
                    return;
                }
                const db = target.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    // Use out-of-line keys since we removed path from FileData
                    const store = db.createObjectStore(STORE_NAME);

                    store.createIndex('mtime', 'mtime', { unique: false });
                    store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                }

                if (!db.objectStoreNames.contains(FEATURE_IMAGE_STORE_NAME)) {
                    db.createObjectStore(FEATURE_IMAGE_STORE_NAME);
                }

                if (!db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
                    db.createObjectStore(PREVIEW_STORE_NAME);
                }

                const transaction = target.transaction;
                if (!transaction) {
                    return;
                }

                if (event.oldVersion < 2) {
                    // Schema v2 introduces a dedicated feature image blob store.
                    // Schema v3 introduces a dedicated preview text store.
                    //
                    // v1 cache payloads are not migrated; clear stores so the cache is rebuilt.

                    try {
                        if (transaction.objectStoreNames.contains(STORE_NAME)) {
                            transaction.objectStore(STORE_NAME).clear();
                        }
                    } catch (error: unknown) {
                        console.error('[IndexedDB] clear failed during upgrade', { store: STORE_NAME, error });
                    }

                    try {
                        if (transaction.objectStoreNames.contains(FEATURE_IMAGE_STORE_NAME)) {
                            transaction.objectStore(FEATURE_IMAGE_STORE_NAME).clear();
                        }
                    } catch (error: unknown) {
                        console.error('[IndexedDB] clear failed during upgrade', { store: FEATURE_IMAGE_STORE_NAME, error });
                    }

                    try {
                        if (transaction.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
                            transaction.objectStore(PREVIEW_STORE_NAME).clear();
                        }
                    } catch (error: unknown) {
                        console.error('[IndexedDB] clear failed during upgrade', { store: PREVIEW_STORE_NAME, error });
                    }
                }

                if (event.oldVersion < 3) {
                    const mainStore = transaction.objectStore(STORE_NAME);
                    const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

                    const cursorRequest = mainStore.openCursor();
                    cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;
                        if (!cursor) {
                            return;
                        }

                        const path = cursor.key;
                        if (typeof path !== 'string') {
                            cursor.continue();
                            return;
                        }

                        const recordValue: unknown = cursor.value;
                        if (!isPlainObjectRecordValue(recordValue)) {
                            cursor.continue();
                            return;
                        }

                        const record = recordValue as { preview?: unknown; previewStatus?: unknown; featureImage?: unknown };
                        const legacyPreview = record.preview;
                        const previewText = typeof legacyPreview === 'string' ? legacyPreview : null;

                        const persistAndContinue = (nextPreviewStatus: PreviewStatus) => {
                            delete record.preview;
                            record.previewStatus = nextPreviewStatus;
                            record.featureImage = null;

                            const updateReq = cursor.update(record);
                            updateReq.onsuccess = () => cursor.continue();
                            updateReq.onerror = event2 => {
                                event2.preventDefault();
                                console.error('[IndexedDB] cursor.update failed during preview migration', {
                                    store: STORE_NAME,
                                    path,
                                    name: updateReq.error?.name,
                                    message: updateReq.error?.message
                                });
                                cursor.continue();
                            };
                        };

                        if (previewText === null) {
                            persistAndContinue('unprocessed');
                            return;
                        }

                        if (previewText.length === 0) {
                            persistAndContinue('none');
                            return;
                        }

                        const putReq = previewStore.put(previewText, path);
                        putReq.onsuccess = () => persistAndContinue('has');
                        putReq.onerror = event2 => {
                            event2.preventDefault();
                            console.error('[IndexedDB] put failed during preview migration', {
                                store: PREVIEW_STORE_NAME,
                                path,
                                name: putReq.error?.name,
                                message: putReq.error?.message
                            });
                            // Mark as unprocessed so the preview provider can regenerate content.
                            persistAndContinue('unprocessed');
                        };
                    };
                    cursorRequest.onerror = () => {
                        console.error('[IndexedDB] preview migration cursor failed', {
                            store: STORE_NAME,
                            name: cursorRequest.error?.name,
                            message: cursorRequest.error?.message
                        });
                    };
                }
            };
        });
    }

    /**
     * Clear all data from the database.
     * Removes all file records but preserves the database structure.
     */
    async clear(): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        // Clear stores in one transaction to keep the cache consistent.
        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

        return new Promise((resolve, reject) => {
            const op = 'clear';
            let lastRequestError: DOMException | Error | null = null;
            const request = store.clear();
            request.onerror = () => {
                lastRequestError = request.error || null;
                console.error('[IndexedDB] clear failed', {
                    store: STORE_NAME,
                    name: request.error?.name,
                    message: request.error?.message
                });
            };
            // Clear blob records alongside the main store.
            const blobRequest = blobStore.clear();
            blobRequest.onerror = () => {
                lastRequestError = blobRequest.error || null;
                console.error('[IndexedDB] clear failed', {
                    store: FEATURE_IMAGE_STORE_NAME,
                    name: blobRequest.error?.name,
                    message: blobRequest.error?.message
                });
            };
            const previewRequest = previewStore.clear();
            previewRequest.onerror = () => {
                lastRequestError = previewRequest.error || null;
                console.error('[IndexedDB] clear failed', {
                    store: PREVIEW_STORE_NAME,
                    name: previewRequest.error?.name,
                    message: previewRequest.error?.message
                });
            };
            transaction.oncomplete = () => {
                this.cache.resetToEmpty();
                // Drop any in-memory blobs after clearing the database.
                this.featureImageBlobs.clearMemoryCaches();
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Get a single file synchronously from the cache.
     *
     * @param path - File path to retrieve
     * @returns File data or null if not found
     */
    getFile(path: string): FileData | null {
        if (!this.cache.isReady()) {
            return null;
        }
        return this.cache.getFile(path);
    }

    /**
     * Seed the in-memory cache for a path without writing to IndexedDB.
     * Used to keep UI responsive when files are renamed and we already
     * have complete metadata under the old path.
     */
    seedMemoryFile(path: string, data: FileData): void {
        if (!this.cache.isReady()) {
            return;
        }
        this.cache.setClonedFile(path, data);
    }

    /**
     * Store or update a single file in the database.
     *
     * @param path - File path (key)
     * @param data - File data to store
     */
    async setFile(path: string, data: FileData): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const op = 'put';
            let lastRequestError: DOMException | Error | null = null;
            // Persist the main record without feature image blob data.
            const sanitized = this.normalizeFileData({ ...data, featureImage: null });
            const request = store.put(sanitized, path);
            request.onerror = () => {
                lastRequestError = request.error || null;
                console.error('[IndexedDB] put failed', {
                    store: STORE_NAME,
                    path,
                    name: request.error?.name,
                    message: request.error?.message
                });
            };
            transaction.oncomplete = () => {
                this.cache.updateFile(path, sanitized);
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Delete a single file from the database by path.
     *
     * @param path - File path to delete
     */
    async deleteFile(path: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

        return new Promise((resolve, reject) => {
            const op = 'delete';
            let lastRequestError: DOMException | Error | null = null;
            const request = store.delete(path);
            request.onerror = () => {
                lastRequestError = request.error || null;
                console.error('[IndexedDB] delete failed', {
                    store: STORE_NAME,
                    path,
                    name: request.error?.name,
                    message: request.error?.message
                });
            };
            // Remove any feature image blob for the file path.
            const blobRequest = blobStore.delete(path);
            blobRequest.onerror = () => {
                lastRequestError = blobRequest.error || null;
                console.error('[IndexedDB] delete failed', {
                    store: FEATURE_IMAGE_STORE_NAME,
                    path,
                    name: blobRequest.error?.name,
                    message: blobRequest.error?.message
                });
            };
            const previewRequest = previewStore.delete(path);
            previewRequest.onerror = () => {
                lastRequestError = previewRequest.error || null;
                console.error('[IndexedDB] delete failed', {
                    store: PREVIEW_STORE_NAME,
                    path,
                    name: previewRequest.error?.name,
                    message: previewRequest.error?.message
                });
            };
            transaction.oncomplete = () => {
                this.cache.deleteFile(path);
                this.featureImageBlobs.deleteFromCache(path);
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Get multiple files synchronously from the cache.
     * More efficient than multiple getFile calls.
     *
     * @param paths - Array of file paths to retrieve
     * @returns Map of path to file data (only includes found files)
     */
    getFiles(paths: string[]): Map<string, FileData> {
        if (!this.cache.isReady()) {
            return new Map();
        }
        return this.cache.getFiles(paths);
    }

    /**
     * Store or update multiple files in the database.
     * More efficient than multiple setFile calls.
     *
     * @param files - Array of file data with paths to store
     */
    async setFiles(files: { path: string; data: FileData }[]): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const op = 'put:batch';
            let lastRequestError: DOMException | Error | null = null;
            if (files.length === 0) {
                resolve();
                return;
            }
            // Persist batch records without feature image blob data.
            const sanitizedFiles = files.map(({ path, data }) => ({
                path,
                data: this.normalizeFileData({ ...data, featureImage: null })
            }));

            sanitizedFiles.forEach(({ path, data }) => {
                const request = store.put(data, path);
                request.onerror = () => {
                    lastRequestError = request.error || null;
                    console.error('[IndexedDB] put failed', {
                        store: STORE_NAME,
                        path,
                        name: request.error?.name,
                        message: request.error?.message
                    });
                };
            });

            transaction.oncomplete = () => {
                this.cache.batchUpdate(sanitizedFiles);
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Upsert file records by applying a patch to existing records and inserting defaults for missing ones.
     *
     * This avoids clobbering provider-owned fields when callers only need to update stat-derived fields
     * such as `mtime` or forced-regeneration processed mtimes.
     */
    async upsertFilesWithPatch(updates: { path: string; create: FileData; patch?: Partial<FileData> }[]): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const updatesByPath = new Map<string, (typeof updates)[number]>();
        for (const update of updates) {
            const existing = updatesByPath.get(update.path);
            if (!existing) {
                updatesByPath.set(update.path, update);
                continue;
            }

            const mergedPatch = existing.patch ? { ...existing.patch, ...update.patch } : update.patch;
            updatesByPath.set(update.path, { ...update, patch: mergedPatch });
        }

        const uniqueUpdates = Array.from(updatesByPath.values());
        if (uniqueUpdates.length === 0) {
            return;
        }

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        await new Promise<void>((resolve, reject) => {
            const op = 'upsertFilesWithPatch';
            let lastRequestError: DOMException | Error | null = null;
            const cacheUpdates: { path: string; data: FileData }[] = [];

            uniqueUpdates.forEach(update => {
                const getReq = store.get(update.path);
                getReq.onsuccess = () => {
                    const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                    // Use the stored record as the merge base so stat-only callers cannot overwrite provider-owned fields.
                    const base = existingRaw ? this.normalizeFileData(existingRaw) : this.normalizeFileData(update.create);
                    // Apply the patch on top of the base record (typically mtime + provider processed-mtime resets).
                    const nextData: FileData = update.patch ? { ...base, ...update.patch } : base;

                    // Main store never persists feature image blobs; keep it null.
                    nextData.featureImage = null;
                    const sanitized = this.normalizeFileData(nextData);
                    cacheUpdates.push({ path: update.path, data: sanitized });

                    const putReq = store.put(sanitized, update.path);
                    putReq.onerror = () => {
                        lastRequestError = putReq.error || null;
                        console.error('[IndexedDB] put failed', {
                            store: STORE_NAME,
                            op,
                            path: update.path,
                            name: putReq.error?.name,
                            message: putReq.error?.message
                        });
                    };
                };
                getReq.onerror = () => {
                    lastRequestError = getReq.error || null;
                    console.error('[IndexedDB] get failed', {
                        store: STORE_NAME,
                        op,
                        path: update.path,
                        name: getReq.error?.name,
                        message: getReq.error?.message
                    });
                };
            });

            transaction.oncomplete = () => {
                if (cacheUpdates.length > 0) {
                    this.cache.batchUpdate(cacheUpdates);
                }
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Delete multiple files from the database by paths.
     * More efficient than multiple deleteFile calls.
     *
     * @param paths - Array of file paths to delete
     */
    async deleteFiles(paths: string[]): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

        return new Promise((resolve, reject) => {
            const op = 'delete:batch';
            let lastRequestError: DOMException | Error | null = null;
            if (paths.length === 0) {
                resolve();
                return;
            }

            paths.forEach(path => {
                const request = store.delete(path);
                request.onerror = () => {
                    lastRequestError = request.error || null;
                    console.error('[IndexedDB] delete failed', {
                        store: STORE_NAME,
                        path,
                        name: request.error?.name,
                        message: request.error?.message
                    });
                };
                // Remove any feature image blob for the file path.
                const blobRequest = blobStore.delete(path);
                blobRequest.onerror = () => {
                    lastRequestError = blobRequest.error || null;
                    console.error('[IndexedDB] delete failed', {
                        store: FEATURE_IMAGE_STORE_NAME,
                        path,
                        name: blobRequest.error?.name,
                        message: blobRequest.error?.message
                    });
                };
                const previewRequest = previewStore.delete(path);
                previewRequest.onerror = () => {
                    lastRequestError = previewRequest.error || null;
                    console.error('[IndexedDB] delete failed', {
                        store: PREVIEW_STORE_NAME,
                        path,
                        name: previewRequest.error?.name,
                        message: previewRequest.error?.message
                    });
                };
            });

            transaction.oncomplete = () => {
                this.cache.batchDelete(paths);
                paths.forEach(path => this.featureImageBlobs.deleteFromCache(path));
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Get files with content synchronously.
     * Returns files that have the specified content type generated.
     *
     * @param type - Type of content to check for
     * @returns Array of files with content
     */
    getFilesWithContent(type: 'preview' | 'featureImage' | 'metadata'): FileData[] {
        if (!this.cache.isReady()) {
            return [];
        }
        return this.cache.getAllFiles().filter(file => {
            if (type === 'preview') return file.previewStatus !== 'unprocessed';
            // Feature images are considered present when a stored thumbnail blob exists.
            if (type === 'featureImage') return file.featureImageStatus === 'has';
            if (type === 'metadata') return file.metadata !== null;
            return false;
        });
    }

    /**
     * Count files synchronously.
     * Returns the total number of files in the database.
     *
     * @returns Number of files
     */
    getFileCount(): number {
        if (!this.cache.isReady()) {
            return 0;
        }
        return this.cache.getFileCount();
    }

    /**
     * Get all files with their paths.
     * Returns array of objects containing path and file data.
     *
     * @returns Array of files with paths
     */
    getAllFiles(): { path: string; data: FileData }[] {
        if (!this.cache.isReady()) {
            return [];
        }
        return this.cache.getAllFilesWithPaths();
    }

    /**
     * Stream all files with their paths without allocating an array.
     *
     * @param callback - Function to call for each file
     */
    forEachFile(callback: (path: string, data: FileData) => void): void {
        if (!this.cache.isReady()) {
            return;
        }
        this.cache.forEachFile(callback);
    }

    /**
     * Get files that need content generation.
     * Returns paths of files where the specified content type is null.
     *
     * @param type - Type of content to check for
     * @returns Set of file paths needing content
     */
    getFilesNeedingContent(type: 'tags' | 'preview' | 'featureImage' | 'metadata' | 'customProperty'): Set<string> {
        if (!this.cache.isReady()) {
            return new Set();
        }
        const result = new Set<string>();
        this.cache.forEachFile((path, data) => {
            if (
                (type === 'tags' && isMarkdownPath(path) && data.tags === null) ||
                (type === 'preview' && isMarkdownPath(path) && data.previewStatus === 'unprocessed') ||
                // Feature images need processing when they are unprocessed or missing a key marker.
                (type === 'featureImage' && (data.featureImageKey === null || data.featureImageStatus === 'unprocessed')) ||
                (type === 'metadata' && isMarkdownPath(path) && data.metadata === null) ||
                (type === 'customProperty' && isMarkdownPath(path) && data.customProperty === null)
            ) {
                result.add(path);
            }
        });
        return result;
    }

    getFilesNeedingAnyContent(types: ('tags' | 'preview' | 'featureImage' | 'metadata' | 'customProperty')[]): Set<string> {
        if (!this.cache.isReady() || types.length === 0) {
            return new Set();
        }

        const needsTags = types.includes('tags');
        const needsPreview = types.includes('preview');
        const needsFeatureImage = types.includes('featureImage');
        const needsMetadata = types.includes('metadata');
        const needsCustomProperty = types.includes('customProperty');

        const result = new Set<string>();
        this.cache.forEachFile((path, data) => {
            const isMarkdown = isMarkdownPath(path);
            if (
                (needsTags && isMarkdown && data.tags === null) ||
                (needsPreview && isMarkdown && data.previewStatus === 'unprocessed') ||
                (needsFeatureImage && (data.featureImageKey === null || data.featureImageStatus === 'unprocessed')) ||
                (needsMetadata && isMarkdown && data.metadata === null) ||
                (needsCustomProperty && isMarkdown && data.customProperty === null)
            ) {
                result.add(path);
            }
        });
        return result;
    }

    /**
     * Get current database statistics.
     * Returns the number of items in the main store and an estimated total size in MB.
     *
     * Includes feature image blobs stored in the dedicated blob store.
     *
     * @returns Object with item count and size in MB
     */
    async getDatabaseStats(): Promise<{ itemCount: number; sizeMB: number }> {
        if (!this.cache.isReady()) {
            return { itemCount: 0, sizeMB: 0 };
        }
        let itemCount = 0;
        let totalSize = 0;
        this.cache.forEachFile((path, data) => {
            itemCount++;
            totalSize += path.length + JSON.stringify(data).length;
        });
        await this.forEachPreviewTextRecord((path, previewText) => {
            totalSize += path.length + previewText.length;
        });
        await this.forEachFeatureImageBlobRecord((_path, record) => {
            totalSize += record.blob.size;
        });
        const sizeMB = totalSize / 1024 / 1024;
        return { itemCount, sizeMB };
    }

    /**
     * Update file content (preview, image, and/or metadata) by path.
     * Only updates provided fields, preserves others.
     * Emits change notifications.
     *
     * @param path - File path to update
     * @param preview - New preview text (optional)
     * @param image - New feature image blob (optional)
     * @param metadata - New metadata (optional)
     */
    async updateFileContent(
        path: string,
        preview?: string,
        image?: Blob | null,
        metadata?: FileData['metadata'],
        featureImageKey?: string | null
    ): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);
        const changes: FileContentChange['changes'] = {};
        let updated: FileData | null = null;
        let shouldClearFeatureImageCache = false;
        const opUpdate = 'updateFileContent';
        let lastRequestErrorUpdate: DOMException | Error | null = null;

        await new Promise<void>((resolve, reject) => {
            const getReq = store.get(path);
            getReq.onsuccess = () => {
                const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                if (!existingRaw) {
                    resolve();
                    return;
                }
                const existing = this.normalizeFileData(existingRaw);
                const next: FileData = { ...existing };

                const featureImageMutation = computeFeatureImageMutation({
                    existingKey: existing.featureImageKey,
                    existingStatus: existing.featureImageStatus,
                    featureImageKey,
                    featureImage: image
                });
                if (featureImageMutation.changes.featureImageKey !== undefined) {
                    changes.featureImageKey = featureImageMutation.changes.featureImageKey;
                }
                if (featureImageMutation.changes.featureImageStatus !== undefined) {
                    changes.featureImageStatus = featureImageMutation.changes.featureImageStatus;
                }
                if (featureImageMutation.shouldClearCache) {
                    shouldClearFeatureImageCache = true;
                }

                if (preview !== undefined) {
                    const previewStatus: PreviewStatus = preview.length > 0 ? 'has' : 'none';
                    next.previewStatus = previewStatus;
                    changes.preview = preview;
                    if (previewStatus === 'has') {
                        const previewReq = previewStore.put(preview, path);
                        previewReq.onerror = () => {
                            lastRequestErrorUpdate = previewReq.error || null;
                            console.error('[IndexedDB] put failed', {
                                store: PREVIEW_STORE_NAME,
                                op: opUpdate,
                                path,
                                name: previewReq.error?.name,
                                message: previewReq.error?.message
                            });
                        };
                    } else {
                        const deleteReq = previewStore.delete(path);
                        deleteReq.onerror = () => {
                            lastRequestErrorUpdate = deleteReq.error || null;
                            console.error('[IndexedDB] delete failed', {
                                store: PREVIEW_STORE_NAME,
                                op: opUpdate,
                                path,
                                name: deleteReq.error?.name,
                                message: deleteReq.error?.message
                            });
                        };
                    }
                }
                if (metadata !== undefined) {
                    next.metadata = metadata;
                    changes.metadata = metadata;
                }

                // Main store records never hold blob data.
                next.featureImageKey = featureImageMutation.nextKey;
                next.featureImage = null;
                next.featureImageStatus = featureImageMutation.nextStatus;
                updated = next;
                if (featureImageMutation.blobUpdate) {
                    // Write the blob record with the current key.
                    const imageReq = blobStore.put(featureImageMutation.blobUpdate, path);
                    imageReq.onerror = () => {
                        lastRequestErrorUpdate = imageReq.error || null;
                        console.error('[IndexedDB] put failed', {
                            store: FEATURE_IMAGE_STORE_NAME,
                            op: opUpdate,
                            path,
                            name: imageReq.error?.name,
                            message: imageReq.error?.message
                        });
                    };
                } else if (featureImageMutation.shouldDeleteBlob) {
                    const deleteReq = blobStore.delete(path);
                    deleteReq.onerror = () => {
                        lastRequestErrorUpdate = deleteReq.error || null;
                        console.error('[IndexedDB] delete failed', {
                            store: FEATURE_IMAGE_STORE_NAME,
                            op: opUpdate,
                            path,
                            name: deleteReq.error?.name,
                            message: deleteReq.error?.message
                        });
                    };
                }
                const putReq = store.put(next, path);
                putReq.onerror = () => {
                    lastRequestErrorUpdate = putReq.error || null;
                    console.error('[IndexedDB] put failed', {
                        store: STORE_NAME,
                        op: opUpdate,
                        path,
                        name: putReq.error?.name,
                        message: putReq.error?.message
                    });
                };
            };
            getReq.onerror = () => {
                lastRequestErrorUpdate = getReq.error || null;
                console.error('[IndexedDB] get failed', {
                    store: STORE_NAME,
                    op: opUpdate,
                    path,
                    name: getReq.error?.name,
                    message: getReq.error?.message
                });
                try {
                    transaction.abort();
                } catch (e) {
                    void e;
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op: opUpdate,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestErrorUpdate?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestErrorUpdate, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op: opUpdate,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestErrorUpdate?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestErrorUpdate, 'Transaction error');
            };
        });

        if (updated) {
            const updatedRecord: FileData = updated;
            this.cache.updateFile(path, updatedRecord);
            if (preview !== undefined) {
                this.cache.updateFileContent(path, { previewText: preview, previewStatus: updatedRecord.previewStatus });
            }
            if (shouldClearFeatureImageCache) {
                // Remove any cached blob for the updated path.
                this.featureImageBlobs.deleteFromCache(path);
            }
            if (Object.keys(changes).length > 0) {
                const hasContentChanges =
                    changes.preview !== undefined || changes.featureImageKey !== undefined || changes.featureImageStatus !== undefined;
                const hasMetadataChanges = changes.metadata !== undefined;
                const changeType = hasContentChanges && hasMetadataChanges ? 'both' : hasContentChanges ? 'content' : 'metadata';
                this.emitChanges([{ path, changes, changeType }]);
            }
        }
    }

    /**
     * Update file metadata by path.
     * Merges with existing metadata rather than replacing.
     * Emits change notifications.
     *
     * @param path - File path to update
     * @param metadata - Metadata fields to update
     */
    async updateFileMetadata(
        path: string,
        metadata: {
            name?: string;
            created?: number;
            modified?: number;
            icon?: string;
            color?: string;
        }
    ): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        let updated: FileData | null = null;
        const opMeta = 'updateFileMetadata';
        let lastRequestErrorMeta: DOMException | Error | null = null;

        await new Promise<void>((resolve, reject) => {
            const getReq = store.get(path);
            getReq.onsuccess = () => {
                const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                if (!existingRaw) {
                    resolve();
                    return;
                }
                const existing = this.normalizeFileData(existingRaw);
                const newMeta = { ...(existing.metadata || {}), ...metadata };
                updated = { ...existing, metadata: newMeta };
                const putReq = store.put(updated, path);
                putReq.onerror = () => {
                    lastRequestErrorMeta = putReq.error || null;
                    console.error('[IndexedDB] put failed', {
                        store: STORE_NAME,
                        op: opMeta,
                        path,
                        name: putReq.error?.name,
                        message: putReq.error?.message
                    });
                };
            };
            getReq.onerror = () => {
                lastRequestErrorMeta = getReq.error || null;
                console.error('[IndexedDB] get failed', {
                    store: STORE_NAME,
                    op: opMeta,
                    path,
                    name: getReq.error?.name,
                    message: getReq.error?.message
                });
                try {
                    transaction.abort();
                } catch (e) {
                    void e;
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op: opMeta,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestErrorMeta?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestErrorMeta, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op: opMeta,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestErrorMeta?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestErrorMeta, 'Transaction error');
            };
        });

        if (updated) {
            const updatedRecord: FileData = updated;
            this.cache.updateFile(path, updatedRecord);
            this.emitChanges([{ path, changes: { metadata: updatedRecord.metadata }, changeType: 'metadata' }]);
        }
    }

    /**
     * Update processed mtimes for a specific content provider.
     *
     * Providers track their own processed mtimes so that:
     * - file modifications do not depend on a shared `mtime` flag across providers, and
     * - providers can record "processed" even when no content fields changed.
     *
     * Does NOT emit change notifications as this is internal bookkeeping.
     */
    async updateProviderProcessedMtimes(
        provider: ContentProviderType,
        updates: { path: string; mtime: number; expectedPreviousMtime: number }[]
    ): Promise<void> {
        await this.batchUpdateFileContentAndProviderProcessedMtimes({
            provider,
            contentUpdates: [],
            processedMtimeUpdates: updates
        });
    }

    /**
     * Clear content for a file by path (set to null).
     * Used when content needs to be regenerated.
     * Emits change notifications.
     *
     * @param path - File path to clear content for
     * @param type - Type of content to clear or 'all'
     */
    async clearFileContent(path: string, type: 'preview' | 'featureImage' | 'metadata' | 'all'): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);
        const changes: FileContentChange['changes'] = {};
        let updated: FileData | null = null;
        let shouldClearFeatureImageCache = false;
        const op = 'clearFileContent';
        let lastRequestError: DOMException | Error | null = null;

        await new Promise<void>((resolve, reject) => {
            const getReq = store.get(path);
            getReq.onsuccess = () => {
                const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                if (!existingRaw) {
                    resolve();
                    return;
                }
                const file = { ...this.normalizeFileData(existingRaw) };
                if (type === 'preview' || type === 'all') {
                    const nextPreviewStatus = getDefaultPreviewStatusForPath(path);
                    if (file.previewStatus !== nextPreviewStatus) {
                        file.previewStatus = nextPreviewStatus;
                        changes.preview = null;
                    }
                    const deleteReq = previewStore.delete(path);
                    deleteReq.onerror = () => {
                        lastRequestError = deleteReq.error || null;
                        console.error('[IndexedDB] delete failed', {
                            store: PREVIEW_STORE_NAME,
                            op,
                            path,
                            name: deleteReq.error?.name,
                            message: deleteReq.error?.message
                        });
                    };
                }
                if (type === 'featureImage' || type === 'all') {
                    // Clear feature image key in the main store and delete blob records.
                    if (file.featureImageKey !== null) {
                        file.featureImageKey = null;
                        changes.featureImageKey = null;
                    }
                    if (file.featureImageStatus !== 'unprocessed') {
                        file.featureImageStatus = 'unprocessed';
                        changes.featureImageStatus = 'unprocessed';
                    }
                    file.featureImage = null;
                    shouldClearFeatureImageCache = true;
                    const deleteReq = blobStore.delete(path);
                    deleteReq.onerror = () => {
                        lastRequestError = deleteReq.error || null;
                        console.error('[IndexedDB] delete failed', {
                            store: FEATURE_IMAGE_STORE_NAME,
                            op,
                            path,
                            name: deleteReq.error?.name,
                            message: deleteReq.error?.message
                        });
                    };
                }
                if (type === 'metadata' || type === 'all') {
                    if (file.metadata !== null) {
                        file.metadata = null;
                        changes.metadata = null;
                    }
                }
                updated = file;
                const putReq = store.put(file, path);
                putReq.onerror = () => {
                    lastRequestError = putReq.error || null;
                    console.error('[IndexedDB] put failed', {
                        store: STORE_NAME,
                        op,
                        path,
                        name: putReq.error?.name,
                        message: putReq.error?.message
                    });
                };
            };
            getReq.onerror = () => {
                lastRequestError = getReq.error || null;
                console.error('[IndexedDB] get failed', {
                    store: STORE_NAME,
                    op,
                    path,
                    name: getReq.error?.name,
                    message: getReq.error?.message
                });
                try {
                    transaction.abort();
                } catch (e) {
                    void e;
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    path,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });

        if (updated) {
            this.cache.updateFile(path, updated);
            if (shouldClearFeatureImageCache) {
                this.featureImageBlobs.deleteFromCache(path);
            }
            if (Object.keys(changes).length > 0) {
                const hasContentCleared =
                    changes.preview === null || changes.featureImageKey === null || changes.featureImageStatus !== undefined;
                const hasMetadataCleared = changes.metadata === null;
                const changeType = hasContentCleared && hasMetadataCleared ? 'both' : hasContentCleared ? 'content' : 'metadata';
                this.emitChanges([{ path, changes, changeType }]);
            }
        }
    }

    /**
     * Clear content for ALL files in batch using cursor.
     * Very efficient for clearing content when settings change.
     * Only clears content that is not already null.
     * Emits change notifications for all affected files.
     *
     * @param type - Type of content to clear or 'all'
     */
    async batchClearAllFileContent(type: 'preview' | 'featureImage' | 'metadata' | 'tags' | 'customProperty' | 'all'): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);
        const changeNotifications: FileContentChange[] = [];
        const cacheUpdates: { path: string; data: FileData }[] = [];
        const op = 'batchClearAllFileContent';
        let lastRequestError: DOMException | Error | null = null;

        return new Promise((resolve, reject) => {
            if (type === 'preview' || type === 'all') {
                const clearReq = previewStore.clear();
                clearReq.onerror = () => {
                    lastRequestError = clearReq.error || null;
                    console.error('[IndexedDB] clear failed', {
                        store: PREVIEW_STORE_NAME,
                        op,
                        name: clearReq.error?.name,
                        message: clearReq.error?.message
                    });
                };
            }
            if (type === 'featureImage' || type === 'all') {
                // Clear all feature image blobs in one operation.
                const clearReq = blobStore.clear();
                clearReq.onerror = () => {
                    lastRequestError = clearReq.error || null;
                    console.error('[IndexedDB] clear failed', {
                        store: FEATURE_IMAGE_STORE_NAME,
                        op,
                        name: clearReq.error?.name,
                        message: clearReq.error?.message
                    });
                };
            }
            const request = store.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const current = this.normalizeFileData(cursor.value as Partial<FileData>);
                    const updated: FileData = { ...current };
                    const changes: FileContentChange['changes'] = {};
                    let hasChanges = false;

                    const path = cursor.key;
                    if (typeof path !== 'string') {
                        cursor.continue();
                        return;
                    }
                    const isMarkdown = isMarkdownPath(path);

                    if (type === 'preview' || type === 'all') {
                        const nextPreviewStatus = isMarkdown ? 'unprocessed' : 'none';
                        if (updated.previewStatus !== nextPreviewStatus) {
                            updated.previewStatus = nextPreviewStatus;
                            changes.preview = null;
                            hasChanges = true;
                        }
                    }
                    if ((type === 'featureImage' || type === 'all') && updated.featureImageKey !== null) {
                        updated.featureImageKey = null;
                        changes.featureImageKey = null;
                        hasChanges = true;
                    }
                    if (type === 'featureImage' || type === 'all') {
                        updated.featureImage = null;
                        if (updated.featureImageStatus !== 'unprocessed') {
                            updated.featureImageStatus = 'unprocessed';
                            changes.featureImageStatus = 'unprocessed';
                            hasChanges = true;
                        }
                    }
                    if (type === 'metadata' || type === 'all') {
                        if (isMarkdown) {
                            if (updated.metadata !== null) {
                                updated.metadata = null;
                                changes.metadata = null;
                                hasChanges = true;
                            }
                        } else if (updated.metadata === null) {
                            updated.metadata = {};
                            changes.metadata = {};
                            hasChanges = true;
                        }
                    }
                    if (type === 'tags' || type === 'all') {
                        if (isMarkdown) {
                            if (updated.tags !== null) {
                                updated.tags = null;
                                changes.tags = null;
                                hasChanges = true;
                            }
                        } else if (updated.tags === null) {
                            updated.tags = [];
                            changes.tags = [];
                            hasChanges = true;
                        }
                    }
                    if ((type === 'customProperty' || type === 'all') && updated.customProperty !== null) {
                        updated.customProperty = null;
                        changes.customProperty = null;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        const updateReq = cursor.update(updated);
                        updateReq.onerror = () => {
                            lastRequestError = updateReq.error || null;
                            console.error('[IndexedDB] cursor.update failed', {
                                store: STORE_NAME,
                                op,
                                path,
                                name: updateReq.error?.name,
                                message: updateReq.error?.message
                            });
                            try {
                                transaction.abort();
                            } catch (e) {
                                void e;
                            }
                        };
                        cacheUpdates.push({ path, data: updated });
                        const hasContentCleared =
                            changes.preview === null ||
                            changes.featureImageKey === null ||
                            changes.featureImageStatus !== undefined ||
                            changes.customProperty === null;
                        const hasMetadataCleared = changes.metadata === null || changes.tags !== undefined;
                        const clearType = hasContentCleared && hasMetadataCleared ? 'both' : hasContentCleared ? 'content' : 'metadata';
                        changeNotifications.push({ path, changes, changeType: clearType });
                    }

                    cursor.continue();
                }
            };

            request.onerror = () => {
                const requestError = request.error;
                lastRequestError = requestError || null;
                console.error('[IndexedDB] openCursor failed', {
                    store: STORE_NAME,
                    op,
                    name: requestError?.name,
                    message: requestError?.message
                });
                reject(this.normalizeIdbError(requestError, 'Cursor request failed'));
            };

            transaction.oncomplete = () => {
                if (cacheUpdates.length > 0) {
                    this.cache.batchUpdate(cacheUpdates);
                    this.emitChanges(changeNotifications);
                }
                if (type === 'featureImage' || type === 'all') {
                    // Reset the in-memory blob cache when all blobs are cleared.
                    this.featureImageBlobs.clearMemoryCaches();
                }
                resolve();
            };
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Clear feature image content for either markdown or non-markdown files.
     *
     * Used when providers split feature image generation by domain:
     * - markdownPipeline clears markdown feature images
     * - fileThumbnails clears non-markdown feature images (PDF covers, etc)
     *
     * Emits change notifications for affected files.
     */
    async batchClearFeatureImageContent(scope: 'markdown' | 'nonMarkdown'): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const changeNotifications: FileContentChange[] = [];
        const cacheUpdates: { path: string; data: FileData }[] = [];
        const blobCacheUpdates: string[] = [];
        const op = 'batchClearFeatureImageContent';
        let lastRequestError: DOMException | Error | null = null;

        await new Promise<void>((resolve, reject) => {
            const request = store.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    return;
                }

                const path = cursor.key;
                if (typeof path !== 'string') {
                    cursor.continue();
                    return;
                }

                const isMarkdown = isMarkdownPath(path);
                const shouldClear = scope === 'markdown' ? isMarkdown : !isMarkdown;
                if (!shouldClear) {
                    cursor.continue();
                    return;
                }

                const current = this.normalizeFileData(cursor.value as Partial<FileData>);
                const updated: FileData = { ...current };
                const changes: FileContentChange['changes'] = {};
                let hasChanges = false;

                if (updated.featureImageKey !== null) {
                    updated.featureImageKey = null;
                    changes.featureImageKey = null;
                    hasChanges = true;
                }

                updated.featureImage = null;
                if (updated.featureImageStatus !== 'unprocessed') {
                    updated.featureImageStatus = 'unprocessed';
                    changes.featureImageStatus = 'unprocessed';
                    hasChanges = true;
                }

                if (hasChanges) {
                    const updateReq = cursor.update(updated);
                    updateReq.onerror = () => {
                        lastRequestError = updateReq.error || null;
                        console.error('[IndexedDB] cursor.update failed', {
                            store: STORE_NAME,
                            op,
                            path,
                            name: updateReq.error?.name,
                            message: updateReq.error?.message
                        });
                        try {
                            transaction.abort();
                        } catch (e) {
                            void e;
                        }
                    };
                    cacheUpdates.push({ path, data: updated });
                    changeNotifications.push({ path, changes, changeType: 'content' });
                }

                const shouldDeleteBlob = current.featureImageKey !== null || current.featureImageStatus === 'has';
                if (shouldDeleteBlob) {
                    const deleteReq = blobStore.delete(path);
                    deleteReq.onerror = () => {
                        lastRequestError = deleteReq.error || null;
                        console.error('[IndexedDB] delete failed', {
                            store: FEATURE_IMAGE_STORE_NAME,
                            op,
                            path,
                            name: deleteReq.error?.name,
                            message: deleteReq.error?.message
                        });
                    };
                    blobCacheUpdates.push(path);
                }

                cursor.continue();
            };

            request.onerror = () => {
                const requestError = request.error;
                lastRequestError = requestError || null;
                console.error('[IndexedDB] openCursor failed', {
                    store: STORE_NAME,
                    op,
                    name: requestError?.name,
                    message: requestError?.message
                });
                reject(this.normalizeIdbError(requestError, 'Cursor request failed'));
            };

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });

        if (cacheUpdates.length > 0) {
            this.cache.batchUpdate(cacheUpdates);
            this.emitChanges(changeNotifications);
        }
        if (blobCacheUpdates.length > 0) {
            for (const path of blobCacheUpdates) {
                this.featureImageBlobs.deleteFromCache(path);
            }
        }
    }

    /**
     * Clear content for specific files in batch.
     * More efficient than multiple clearFileContent calls.
     * Only clears content that is not already null.
     * Emits change notifications for all affected files.
     *
     * @param paths - Array of file paths to clear content for
     * @param type - Type of content to clear or 'all'
     */
    async batchClearFileContent(
        paths: string[],
        type: 'preview' | 'featureImage' | 'metadata' | 'tags' | 'customProperty' | 'all'
    ): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([STORE_NAME, FEATURE_IMAGE_STORE_NAME, PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = transaction.objectStore(FEATURE_IMAGE_STORE_NAME);
        const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);
        const updates: { path: string; data: FileData }[] = [];
        const changeNotifications: FileContentChange[] = [];
        const op = 'batchClearFileContent';
        let lastRequestError: DOMException | Error | null = null;

        await new Promise<void>((resolve, reject) => {
            if (paths.length === 0) {
                resolve();
                return;
            }

            paths.forEach(path => {
                const getReq = store.get(path);
                getReq.onsuccess = () => {
                    const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                    if (!existingRaw) {
                        return;
                    }
                    const file = { ...this.normalizeFileData(existingRaw) };
                    const changes: FileContentChange['changes'] = {};
                    let hasChanges = false;
                    if (type === 'preview' || type === 'all') {
                        const nextPreviewStatus = getDefaultPreviewStatusForPath(path);
                        if (file.previewStatus !== nextPreviewStatus) {
                            file.previewStatus = nextPreviewStatus;
                            changes.preview = null;
                            hasChanges = true;
                        }
                        const deleteReq = previewStore.delete(path);
                        deleteReq.onerror = () => {
                            lastRequestError = deleteReq.error || null;
                            console.error('[IndexedDB] delete failed', {
                                store: PREVIEW_STORE_NAME,
                                op,
                                path,
                                name: deleteReq.error?.name,
                                message: deleteReq.error?.message
                            });
                        };
                    }
                    if ((type === 'featureImage' || type === 'all') && file.featureImageKey !== null) {
                        file.featureImageKey = null;
                        changes.featureImageKey = null;
                        hasChanges = true;
                    }
                    if (type === 'featureImage' || type === 'all') {
                        file.featureImage = null;
                        if (file.featureImageStatus !== 'unprocessed') {
                            file.featureImageStatus = 'unprocessed';
                            changes.featureImageStatus = 'unprocessed';
                            hasChanges = true;
                        }
                    }
                    if ((type === 'metadata' || type === 'all') && file.metadata !== null) {
                        file.metadata = null;
                        changes.metadata = null;
                        hasChanges = true;
                    }
                    if ((type === 'tags' || type === 'all') && file.tags !== null) {
                        file.tags = null;
                        changes.tags = null;
                        hasChanges = true;
                    }
                    if ((type === 'customProperty' || type === 'all') && file.customProperty !== null) {
                        file.customProperty = null;
                        changes.customProperty = null;
                        hasChanges = true;
                    }
                    if (hasChanges) {
                        const putReq = store.put(file, path);
                        putReq.onerror = () => {
                            lastRequestError = putReq.error || null;
                            console.error('[IndexedDB] put failed', {
                                store: STORE_NAME,
                                op,
                                path,
                                name: putReq.error?.name,
                                message: putReq.error?.message
                            });
                        };
                        if (type === 'featureImage' || type === 'all') {
                            // Remove feature image blobs for the cleared paths.
                            const deleteReq = blobStore.delete(path);
                            deleteReq.onerror = () => {
                                lastRequestError = deleteReq.error || null;
                                console.error('[IndexedDB] delete failed', {
                                    store: FEATURE_IMAGE_STORE_NAME,
                                    op,
                                    path,
                                    name: deleteReq.error?.name,
                                    message: deleteReq.error?.message
                                });
                            };
                        }
                        updates.push({ path, data: file });
                        const hasContentCleared =
                            changes.preview === null ||
                            changes.featureImageKey === null ||
                            changes.featureImageStatus !== undefined ||
                            changes.customProperty === null;
                        const hasMetadataCleared = changes.metadata === null || changes.tags !== undefined;
                        const clearType = hasContentCleared && hasMetadataCleared ? 'both' : hasContentCleared ? 'content' : 'metadata';
                        changeNotifications.push({ path, changes, changeType: clearType });
                    }
                    // noop
                };
                getReq.onerror = () => {
                    lastRequestError = getReq.error || null;
                    console.error('[IndexedDB] get failed', {
                        store: STORE_NAME,
                        op,
                        path,
                        name: getReq.error?.name,
                        message: getReq.error?.message
                    });
                    try {
                        transaction.abort();
                    } catch (e) {
                        void e;
                    }
                };
            });

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });

        if (updates.length > 0) {
            this.cache.batchUpdate(updates);
            this.emitChanges(changeNotifications);
        }
        if (type === 'featureImage' || type === 'all') {
            // Drop any cached blobs for the cleared paths.
            for (const path of paths) {
                this.featureImageBlobs.deleteFromCache(path);
            }
        }
    }

    /**
     * Update content for multiple files in batch.
     * More efficient than multiple updateFileContent calls.
     * Emits change notifications for all updates so UI components can react.
     * This is the primary method for notifying the UI about content changes.
     *
     * @param updates - Array of content updates to apply
     */
    async batchUpdateFileContent(
        updates: {
            path: string;
            tags?: string[] | null;
            preview?: string;
            featureImage?: Blob | null;
            featureImageKey?: string | null;
            metadata?: FileData['metadata'];
            customProperty?: FileData['customProperty'];
        }[]
    ): Promise<void> {
        await this.batchUpdateFileContentAndProviderProcessedMtimes({ contentUpdates: updates });
    }

    /**
     * Update file content fields and provider processed mtimes in a single transaction.
     *
     * This is used by content providers so that:
     * - content updates are applied atomically alongside their processed mtime bookkeeping, and
     * - providers can still record "processed" even when no content fields changed.
     *
     * Provider processed mtimes are updated with a CAS guard (`expectedPreviousMtime`) to avoid
     * overwriting forced regeneration resets that occurred mid-flight.
     */
    async batchUpdateFileContentAndProviderProcessedMtimes(params: {
        contentUpdates: {
            path: string;
            tags?: string[] | null;
            preview?: string;
            featureImage?: Blob | null;
            featureImageKey?: string | null;
            metadata?: FileData['metadata'];
            customProperty?: FileData['customProperty'];
        }[];
        provider?: ContentProviderType;
        processedMtimeUpdates?: { path: string; mtime: number; expectedPreviousMtime: number }[];
    }): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const contentUpdates = params.contentUpdates;
        const processedMtimeUpdates = params.processedMtimeUpdates ?? [];
        const provider = params.provider;

        if (processedMtimeUpdates.length > 0 && !provider) {
            throw new Error('Provider type required when updating processed mtimes');
        }

        if (contentUpdates.length === 0 && processedMtimeUpdates.length === 0) {
            return;
        }

        const contentUpdatesByPath = new Map<string, (typeof contentUpdates)[number]>();
        for (const update of contentUpdates) {
            contentUpdatesByPath.set(update.path, update);
        }

        const processedMtimeUpdatesByPath = new Map<string, (typeof processedMtimeUpdates)[number]>();
        for (const update of processedMtimeUpdates) {
            processedMtimeUpdatesByPath.set(update.path, update);
        }

        const pathsToUpdate = new Set<string>();
        contentUpdatesByPath.forEach((_value, path) => pathsToUpdate.add(path));
        processedMtimeUpdatesByPath.forEach((_value, path) => pathsToUpdate.add(path));

        if (pathsToUpdate.size === 0) {
            return;
        }

        const needsPreviewStore = contentUpdates.some(update => update.preview !== undefined);
        const needsFeatureImageStore = contentUpdates.some(
            update => update.featureImageKey !== undefined || update.featureImage !== undefined
        );
        const storeNames: string[] = [STORE_NAME];
        if (needsFeatureImageStore) {
            storeNames.push(FEATURE_IMAGE_STORE_NAME);
        }
        if (needsPreviewStore) {
            storeNames.push(PREVIEW_STORE_NAME);
        }

        const transaction = this.db.transaction(storeNames, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const blobStore = needsFeatureImageStore ? transaction.objectStore(FEATURE_IMAGE_STORE_NAME) : null;
        const previewStore = needsPreviewStore ? transaction.objectStore(PREVIEW_STORE_NAME) : null;
        const filesToUpdate: { path: string; data: FileData }[] = [];
        const changeNotifications: FileContentChange[] = [];
        const featureImageCacheUpdates = new Set<string>();
        const previewTextUpdates: { path: string; previewText: string; previewStatus: PreviewStatus }[] = [];
        let createdRecordWithoutKnownMtime = 0;
        const createdRecordWithoutKnownMtimeExamples: string[] = [];
        let skippedProviderContentUpdates = 0;
        const skippedProviderContentUpdateExamples: { path: string; expectedPreviousMtime: number; actualPreviousMtime: number }[] = [];

        await new Promise<void>((resolve, reject) => {
            const op = 'batchUpdateFileContentAndProviderProcessedMtimes';
            let lastRequestError: DOMException | Error | null = null;
            pathsToUpdate.forEach(path => {
                const update = contentUpdatesByPath.get(path);
                const processedMtimeUpdate = processedMtimeUpdatesByPath.get(path);

                const getReq = store.get(path);
                getReq.onsuccess = () => {
                    const existingRaw = (getReq.result as Partial<FileData> | undefined) || null;
                    const fallbackMtime = processedMtimeUpdate?.mtime ?? 0;
                    const existing = existingRaw
                        ? this.normalizeFileData(existingRaw)
                        : this.normalizeFileData(createDefaultFileData({ mtime: fallbackMtime, path }));
                    if (!existingRaw && fallbackMtime === 0 && update) {
                        createdRecordWithoutKnownMtime += 1;
                        if (createdRecordWithoutKnownMtimeExamples.length < 5) {
                            createdRecordWithoutKnownMtimeExamples.push(path);
                        }
                    }
                    const newData: FileData = { ...existing };
                    const changes: FileContentChange['changes'] = {};
                    let hasContentChanges = false;
                    const providerField = provider ? getProviderProcessedMtimeField(provider) : null;
                    const expectedPreviousMtime = processedMtimeUpdate?.expectedPreviousMtime ?? null;
                    const shouldApplyProviderContent =
                        !provider ||
                        !processedMtimeUpdate ||
                        !providerField ||
                        newData[providerField] === processedMtimeUpdate.expectedPreviousMtime;
                    const guardedUpdate = shouldApplyProviderContent ? update : null;
                    if (provider && providerField && update && expectedPreviousMtime !== null && !shouldApplyProviderContent) {
                        skippedProviderContentUpdates += 1;
                        if (skippedProviderContentUpdateExamples.length < 5) {
                            skippedProviderContentUpdateExamples.push({
                                path,
                                expectedPreviousMtime,
                                actualPreviousMtime: newData[providerField]
                            });
                        }
                    }
                    const hasFeatureImageUpdate = guardedUpdate?.featureImageKey !== undefined || guardedUpdate?.featureImage !== undefined;
                    const featureImageMutation =
                        guardedUpdate && hasFeatureImageUpdate
                            ? computeFeatureImageMutation({
                                  existingKey: existing.featureImageKey,
                                  existingStatus: existing.featureImageStatus,
                                  featureImageKey: guardedUpdate.featureImageKey,
                                  featureImage: guardedUpdate.featureImage
                              })
                            : null;

                    if (guardedUpdate) {
                        if (guardedUpdate.tags !== undefined) {
                            newData.tags = guardedUpdate.tags;
                            changes.tags = guardedUpdate.tags;
                            hasContentChanges = true;
                        }
                        if (guardedUpdate.customProperty !== undefined) {
                            newData.customProperty = guardedUpdate.customProperty;
                            changes.customProperty = guardedUpdate.customProperty;
                            hasContentChanges = true;
                        }
                        if (guardedUpdate.preview !== undefined) {
                            const previewStatus: PreviewStatus = guardedUpdate.preview.length > 0 ? 'has' : 'none';
                            newData.previewStatus = previewStatus;
                            changes.preview = guardedUpdate.preview;
                            hasContentChanges = true;
                            if (previewStore && previewStatus === 'has') {
                                const previewReq = previewStore.put(guardedUpdate.preview, path);
                                previewReq.onerror = () => {
                                    lastRequestError = previewReq.error || null;
                                    console.error('[IndexedDB] put failed', {
                                        store: PREVIEW_STORE_NAME,
                                        op,
                                        path,
                                        name: previewReq.error?.name,
                                        message: previewReq.error?.message
                                    });
                                };
                                previewTextUpdates.push({ path, previewText: guardedUpdate.preview, previewStatus });
                            } else if (previewStore) {
                                const deleteReq = previewStore.delete(path);
                                deleteReq.onerror = () => {
                                    lastRequestError = deleteReq.error || null;
                                    console.error('[IndexedDB] delete failed', {
                                        store: PREVIEW_STORE_NAME,
                                        op,
                                        path,
                                        name: deleteReq.error?.name,
                                        message: deleteReq.error?.message
                                    });
                                };
                            }
                        }

                        if (featureImageMutation) {
                            if (featureImageMutation.changes.featureImageKey !== undefined) {
                                changes.featureImageKey = featureImageMutation.changes.featureImageKey;
                                hasContentChanges = true;
                            }
                            if (featureImageMutation.changes.featureImageStatus !== undefined) {
                                changes.featureImageStatus = featureImageMutation.changes.featureImageStatus;
                                hasContentChanges = true;
                            }
                            // Main store records never hold blob data.
                            newData.featureImageKey = featureImageMutation.nextKey;
                            newData.featureImage = null;
                            newData.featureImageStatus = featureImageMutation.nextStatus;

                            if (featureImageMutation.shouldClearCache) {
                                featureImageCacheUpdates.add(path);
                            }
                        }

                        if (guardedUpdate.metadata !== undefined) {
                            newData.metadata = guardedUpdate.metadata;
                            changes.metadata = guardedUpdate.metadata;
                            hasContentChanges = true;
                        }
                    }

                    let hasProviderMtimeChanges = false;
                    if (processedMtimeUpdate && provider) {
                        const { mtime, expectedPreviousMtime } = processedMtimeUpdate;
                        const field = getProviderProcessedMtimeField(provider);
                        if (newData[field] === expectedPreviousMtime && newData[field] !== mtime) {
                            newData[field] = mtime;
                            hasProviderMtimeChanges = true;
                        }
                    }

                    const hasAnyChanges = hasContentChanges || hasProviderMtimeChanges;
                    if (hasAnyChanges) {
                        const putReq = store.put(newData, path);
                        putReq.onerror = () => {
                            lastRequestError = putReq.error || null;
                            console.error('[IndexedDB] put failed', {
                                store: STORE_NAME,
                                op,
                                path,
                                name: putReq.error?.name,
                                message: putReq.error?.message
                            });
                        };

                        if (blobStore && featureImageMutation) {
                            if (featureImageMutation.blobUpdate) {
                                // Write the blob record with the current key.
                                const imageReq = blobStore.put(featureImageMutation.blobUpdate, path);
                                imageReq.onerror = () => {
                                    lastRequestError = imageReq.error || null;
                                    console.error('[IndexedDB] put failed', {
                                        store: FEATURE_IMAGE_STORE_NAME,
                                        op,
                                        path,
                                        name: imageReq.error?.name,
                                        message: imageReq.error?.message
                                    });
                                };
                            } else if (featureImageMutation.shouldDeleteBlob) {
                                // Remove any stored blob when the key changes or blob is empty.
                                const deleteReq = blobStore.delete(path);
                                deleteReq.onerror = () => {
                                    lastRequestError = deleteReq.error || null;
                                    console.error('[IndexedDB] delete failed', {
                                        store: FEATURE_IMAGE_STORE_NAME,
                                        op,
                                        path,
                                        name: deleteReq.error?.name,
                                        message: deleteReq.error?.message
                                    });
                                };
                            }
                        }

                        filesToUpdate.push({ path, data: newData });

                        if (hasContentChanges) {
                            const hasContentUpdates =
                                changes.preview !== undefined ||
                                changes.featureImageKey !== undefined ||
                                changes.featureImageStatus !== undefined ||
                                changes.customProperty !== undefined;
                            const hasMetadataUpdates = changes.metadata !== undefined || changes.tags !== undefined;
                            const updateType =
                                hasContentUpdates && hasMetadataUpdates ? 'both' : hasContentUpdates ? 'content' : 'metadata';
                            changeNotifications.push({ path, changes, changeType: updateType });
                        }
                    }
                    // noop
                };
                getReq.onerror = () => {
                    lastRequestError = getReq.error || null;
                    console.error('[IndexedDB] get failed', {
                        store: STORE_NAME,
                        op,
                        path,
                        name: getReq.error?.name,
                        message: getReq.error?.message
                    });
                    try {
                        transaction.abort();
                    } catch (e) {
                        void e;
                    }
                };
            });
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });

        if (filesToUpdate.length > 0) {
            this.cache.batchUpdate(filesToUpdate);
            if (previewTextUpdates.length > 0) {
                previewTextUpdates.forEach(update => {
                    this.cache.updateFileContent(update.path, { previewText: update.previewText, previewStatus: update.previewStatus });
                });
            }
            if (changeNotifications.length > 0) {
                this.emitChanges(changeNotifications);
            }
        }
        if (featureImageCacheUpdates.size > 0) {
            // Drop any cached blobs for updated paths.
            featureImageCacheUpdates.forEach(path => this.featureImageBlobs.deleteFromCache(path));
        }
        if (createdRecordWithoutKnownMtime > 0) {
            console.error('[IndexedDB] Created file record without known mtime during content update', {
                count: createdRecordWithoutKnownMtime,
                examples: createdRecordWithoutKnownMtimeExamples
            });
        }
        if (provider && skippedProviderContentUpdates > 0) {
            console.log('[IndexedDB] Skipped stale provider content updates', {
                provider,
                count: skippedProviderContentUpdates,
                examples: skippedProviderContentUpdateExamples
            });
        }
    }

    /**
     * Batch update or add multiple files in the database.
     * More efficient than multiple setFile calls.
     * Updates cache after successful database writes.
     *
     * @param files - Array of file data with paths to store
     */
    async batchUpdate(files: { path: string; data: FileData }[]): Promise<void> {
        await this.setFiles(files);
    }

    /**
     * Clear database and reinitialize.
     * Used when vault structure changes significantly.
     */
    async clearDatabase(): Promise<void> {
        await this.clear();
    }

    /**
     * Check if a file has preview text synchronously.
     *
     * @param path - File path to check
     * @returns True if the file has preview text
     */
    hasPreview(path: string): boolean {
        if (!this.cache.isReady()) {
            return false;
        }
        return this.cache.hasPreview(path);
    }

    /**
     * Check if a file exists in the database.
     *
     * @param path - File path to check
     * @returns True if the file exists
     */
    hasFile(path: string): boolean {
        if (!this.cache.isReady()) {
            return false;
        }
        return this.cache.hasFile(path);
    }

    /**
     * Get preview text from memory cache, returning empty string if null.
     * Helper method for UI components that need non-null strings.
     *
     * @param path - File path to get preview for
     * @returns Preview text or empty string
     */
    getCachedPreviewText(path: string): string {
        if (!this.cache.isReady()) {
            return '';
        }
        return this.cache.getPreviewText(path);
    }

    /**
     * Loads preview text for a single file path into the in-memory cache.
     * Used by UI components that need preview text without hydrating the full preview store on startup.
     */
    async ensurePreviewTextLoaded(path: string): Promise<void> {
        if (this.isClosing) {
            return;
        }
        if (!this.cache.isReady()) {
            return;
        }

        const file = this.cache.getFile(path);
        if (!file || file.previewStatus !== 'has') {
            return;
        }

        if (this.cache.getPreviewText(path).length > 0) {
            return;
        }

        const existingPromise = this.previewLoadPromises.get(path);
        if (existingPromise) {
            return existingPromise;
        }

        const deferred: { resolve: () => void } = {
            resolve: () => void 0
        };

        const loadPromise = new Promise<void>(resolve => {
            deferred.resolve = resolve;
        }).finally(() => {
            this.previewLoadPromises.delete(path);
            this.previewLoadDeferred.delete(path);
        });

        this.previewLoadDeferred.set(path, deferred);
        this.previewLoadPromises.set(path, loadPromise);
        this.previewLoadQueue.add(path);
        this.schedulePreviewTextLoadFlush();
        this.enablePreviewTextWarmup();
        return loadPromise;
    }

    /**
     * Starts warming the preview text LRU cache in the background.
     * Safe to call multiple times; warmup only runs once per session.
     */
    startPreviewTextWarmup(): void {
        this.enablePreviewTextWarmup();
    }

    private schedulePreviewTextLoadFlush(): void {
        if (this.isClosing) {
            return;
        }
        if (this.previewLoadFlushTimer !== null) {
            return;
        }

        this.previewLoadFlushTimer = globalThis.setTimeout(() => {
            this.previewLoadFlushTimer = null;
            void this.flushPreviewTextLoadQueue();
        }, 0);
    }

    /**
     * Enables preview text warmup and schedules the first warmup flush.
     */
    private enablePreviewTextWarmup(): void {
        if (this.isClosing) {
            return;
        }
        if (this.isPreviewWarmupComplete) {
            return;
        }
        if (this.isPreviewWarmupEnabled) {
            return;
        }
        if (this.previewTextCacheMaxEntries === 0) {
            this.isPreviewWarmupComplete = true;
            return;
        }

        this.isPreviewWarmupEnabled = true;
        this.schedulePreviewTextWarmupFlush();
    }

    /**
     * Schedules a warmup flush with an optional delay.
     */
    private schedulePreviewTextWarmupFlush(delayMs = 0): void {
        if (this.isClosing) {
            return;
        }
        if (!this.isPreviewWarmupEnabled || this.isPreviewWarmupComplete) {
            return;
        }
        if (this.previewWarmupTimer !== null) {
            return;
        }

        this.previewWarmupTimer = globalThis.setTimeout(() => {
            this.previewWarmupTimer = null;
            void this.flushPreviewTextWarmup();
        }, delayMs);
    }

    /**
     * Loads preview text strings from IndexedDB into the in-memory LRU.
     */
    private async flushPreviewTextWarmup(): Promise<void> {
        if (this.isClosing) {
            return;
        }
        if (!this.isPreviewWarmupEnabled || this.isPreviewWarmupComplete) {
            return;
        }
        if (this.isPreviewWarmupRunning) {
            return;
        }
        if (!this.cache.isReady()) {
            return;
        }

        if (this.previewTextCacheMaxEntries === 0 || this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries) {
            this.isPreviewWarmupEnabled = false;
            this.isPreviewWarmupComplete = true;
            return;
        }

        // Warm up after the initial preview requests have loaded.
        if (this.isPreviewLoadFlushRunning || this.previewLoadFlushTimer !== null || this.previewLoadQueue.size > 0) {
            this.schedulePreviewTextWarmupFlush(25);
            return;
        }

        const sessionId = this.previewLoadSessionId;
        this.isPreviewWarmupRunning = true;
        try {
            await this.init();
            if (!this.db) {
                this.isPreviewWarmupEnabled = false;
                this.isPreviewWarmupComplete = true;
                return;
            }
            if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                return;
            }

            const cursorStepLimit = this.previewLoadMaxBatch * 10;
            const hasMore = await this.warmPreviewTextCacheBatch(cursorStepLimit, sessionId);
            if (!hasMore) {
                this.isPreviewWarmupEnabled = false;
                this.isPreviewWarmupComplete = true;
                return;
            }
        } catch (error: unknown) {
            if (!this.isClosing && sessionId === this.previewLoadSessionId) {
                console.error('[PreviewText] Warmup failed', error);
            }
            this.isPreviewWarmupEnabled = false;
            this.isPreviewWarmupComplete = true;
            return;
        } finally {
            this.isPreviewWarmupRunning = false;
        }

        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
            return;
        }
        if (this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries) {
            this.isPreviewWarmupEnabled = false;
            this.isPreviewWarmupComplete = true;
            return;
        }

        this.schedulePreviewTextWarmupFlush();
    }

    /**
     * Reads a cursor batch from the preview store and updates the preview text LRU.
     */
    private async warmPreviewTextCacheBatch(cursorStepLimit: number, sessionId: number): Promise<boolean> {
        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
            return false;
        }
        if (!this.db) {
            return false;
        }
        if (!this.cache.isReady()) {
            return false;
        }
        if (this.previewTextCacheMaxEntries === 0) {
            return false;
        }

        if (this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries) {
            return false;
        }

        const db = this.db;
        const transaction = db.transaction([PREVIEW_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PREVIEW_STORE_NAME);

        let reachedEnd = false;

        await new Promise<void>((resolve, reject) => {
            const op = 'warmPreviewTextCache';
            let lastRequestError: DOMException | Error | null = null;

            const range = this.previewWarmupCursorKey ? IDBKeyRange.lowerBound(this.previewWarmupCursorKey, true) : undefined;
            const request = store.openCursor(range);

            let steps = 0;
            request.onsuccess = () => {
                if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                    return;
                }

                const cursor = request.result;
                if (!cursor) {
                    reachedEnd = true;
                    return;
                }

                // Pause warmup when explicit preview-load requests are pending.
                // The preview-load flush path emits change events used by UI components (e.g. FileItem state).
                if (this.isPreviewLoadFlushRunning || this.previewLoadFlushTimer !== null || this.previewLoadQueue.size > 0) {
                    return;
                }

                if (this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries) {
                    return;
                }

                steps += 1;

                const path = cursor.key;
                const previewText: unknown = cursor.value;

                if (typeof path === 'string') {
                    this.previewWarmupCursorKey = path;
                    if (typeof previewText === 'string' && previewText.length > 0) {
                        const file = this.cache.getFile(path);
                        if (file && file.previewStatus === 'has' && !this.cache.isPreviewTextLoaded(path)) {
                            this.cache.updateFileContent(path, { previewText });
                        }
                    }
                }

                if (this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries || steps >= cursorStepLimit) {
                    return;
                }

                cursor.continue();
            };
            request.onerror = () => {
                lastRequestError = request.error || null;
                console.error('[IndexedDB] openCursor failed', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    name: request.error?.name,
                    message: request.error?.message
                });
                reject(this.normalizeIdbError(request.error, 'Cursor request failed'));
            };

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                    resolve();
                    return;
                }
                console.error('[IndexedDB] transaction aborted', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                    resolve();
                    return;
                }
                console.error('[IndexedDB] transaction error', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });

        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
            return false;
        }
        if (this.cache.getPreviewTextEntryCount() >= this.previewTextCacheMaxEntries) {
            return false;
        }
        return !reachedEnd;
    }

    private async repairPreviewStatusRecords(updates: { path: string; previewStatus: PreviewStatus }[]): Promise<void> {
        if (this.isClosing) {
            return;
        }
        if (updates.length === 0) {
            return;
        }
        await this.init();
        if (!this.db) {
            return;
        }

        const sessionId = this.previewLoadSessionId;
        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
            return;
        }

        const db = this.db;
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        await new Promise<void>((resolve, reject) => {
            const op = 'repairPreviewStatusRecords';
            let lastRequestError: DOMException | Error | null = null;

            updates.forEach(update => {
                const getReq = store.get(update.path);
                getReq.onsuccess = () => {
                    const recordValue: unknown = getReq.result;
                    if (!isPlainObjectRecordValue(recordValue)) {
                        return;
                    }

                    const record = recordValue;
                    if (record.previewStatus === update.previewStatus) {
                        return;
                    }

                    record.previewStatus = update.previewStatus;
                    const putReq = store.put(record, update.path);
                    putReq.onerror = () => {
                        lastRequestError = putReq.error || null;
                        console.error('[IndexedDB] put failed', {
                            store: STORE_NAME,
                            op,
                            path: update.path,
                            name: putReq.error?.name,
                            message: putReq.error?.message
                        });
                    };
                };
                getReq.onerror = () => {
                    lastRequestError = getReq.error || null;
                    console.error('[IndexedDB] get failed', {
                        store: STORE_NAME,
                        op,
                        path: update.path,
                        name: getReq.error?.name,
                        message: getReq.error?.message
                    });
                    try {
                        transaction.abort();
                    } catch (e) {
                        void e;
                    }
                };
            });

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                if (this.isClosing) {
                    resolve();
                    return;
                }
                console.error('[IndexedDB] transaction aborted', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                if (this.isClosing) {
                    resolve();
                    return;
                }
                console.error('[IndexedDB] transaction error', {
                    store: STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    private async flushPreviewTextLoadQueue(): Promise<void> {
        if (this.isPreviewLoadFlushRunning) {
            return;
        }

        this.isPreviewLoadFlushRunning = true;
        const sessionId = this.previewLoadSessionId;
        try {
            const queuedPaths = Array.from(this.previewLoadQueue);
            this.previewLoadQueue.clear();
            if (queuedPaths.length === 0) {
                return;
            }

            const pathsToProcess = queuedPaths.slice(0, this.previewLoadMaxBatch);
            if (queuedPaths.length > this.previewLoadMaxBatch) {
                for (const path of queuedPaths.slice(this.previewLoadMaxBatch)) {
                    this.previewLoadQueue.add(path);
                }
            }

            if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                for (const path of pathsToProcess) {
                    this.previewLoadDeferred.get(path)?.resolve();
                }
                return;
            }

            try {
                await this.init();
            } catch (error: unknown) {
                if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                    for (const path of queuedPaths) {
                        this.previewLoadDeferred.get(path)?.resolve();
                    }
                    return;
                }
                const initError = error instanceof Error ? error : new Error('Failed to initialize database');
                console.error('[PreviewText] Failed to initialize database for preview load', initError);
                for (const path of queuedPaths) {
                    this.previewLoadDeferred.get(path)?.resolve();
                }
                return;
            }

            if (!this.db) {
                if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                    for (const path of pathsToProcess) {
                        this.previewLoadDeferred.get(path)?.resolve();
                    }
                    return;
                }
                console.error('[PreviewText] Database not initialized for preview load');
                for (const path of pathsToProcess) {
                    this.previewLoadDeferred.get(path)?.resolve();
                }
                return;
            }

            const pathsToLoad: string[] = [];
            for (const path of pathsToProcess) {
                const deferred = this.previewLoadDeferred.get(path);
                if (!deferred) {
                    continue;
                }

                const file = this.cache.getFile(path);
                if (!file || file.previewStatus !== 'has') {
                    deferred.resolve();
                    continue;
                }

                if (this.cache.getPreviewText(path).length > 0) {
                    deferred.resolve();
                    continue;
                }

                pathsToLoad.push(path);
            }

            if (pathsToLoad.length === 0) {
                return;
            }

            const previewTexts = new Map<string, string | null>();
            const changes: FileContentChange[] = [];
            const previewStatusRepairs: { path: string; previewStatus: PreviewStatus }[] = [];

            const db = this.db;
            if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                for (const path of pathsToLoad) {
                    this.previewLoadDeferred.get(path)?.resolve();
                }
                return;
            }

            const transaction = db.transaction([PREVIEW_STORE_NAME], 'readonly');
            const store = transaction.objectStore(PREVIEW_STORE_NAME);

            try {
                await new Promise<void>((resolve, reject) => {
                    const op = 'loadPreviewText:batch';
                    let lastRequestError: DOMException | Error | null = null;

                    for (const path of pathsToLoad) {
                        const getReq = store.get(path);
                        getReq.onsuccess = () => {
                            const previewText: unknown = getReq.result;
                            if (typeof previewText === 'string' && previewText.length > 0) {
                                previewTexts.set(path, previewText);
                            } else {
                                previewTexts.set(path, null);
                            }
                        };
                        getReq.onerror = () => {
                            lastRequestError = getReq.error || null;
                            if (!this.isClosing && sessionId === this.previewLoadSessionId) {
                                console.error('[IndexedDB] get failed', {
                                    store: PREVIEW_STORE_NAME,
                                    op,
                                    path,
                                    name: getReq.error?.name,
                                    message: getReq.error?.message
                                });
                            }
                            try {
                                transaction.abort();
                            } catch (e) {
                                void e;
                            }
                        };
                    }

                    transaction.oncomplete = () => resolve();
                    transaction.onabort = () => {
                        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                            resolve();
                            return;
                        }
                        console.error('[IndexedDB] transaction aborted', {
                            store: PREVIEW_STORE_NAME,
                            op,
                            txError: transaction.error?.message,
                            reqError: lastRequestError?.message
                        });
                        this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
                    };
                    transaction.onerror = () => {
                        if (this.isClosing || sessionId !== this.previewLoadSessionId) {
                            resolve();
                            return;
                        }
                        console.error('[IndexedDB] transaction error', {
                            store: PREVIEW_STORE_NAME,
                            op,
                            txError: transaction.error?.message,
                            reqError: lastRequestError?.message
                        });
                        this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
                    };
                });
            } catch (error: unknown) {
                const loadError = error instanceof Error ? error : new Error('Preview load failed');
                if (!this.isClosing && sessionId === this.previewLoadSessionId) {
                    console.error('[PreviewText] Failed to load previews', loadError);
                }
                for (const path of pathsToLoad) {
                    this.previewLoadDeferred.get(path)?.resolve();
                }
                return;
            }

            for (const path of pathsToLoad) {
                const previewText = previewTexts.get(path);
                if (typeof previewText === 'string' && previewText.length > 0) {
                    this.cache.updateFileContent(path, { previewText, previewStatus: 'has' });
                    changes.push({ path, changes: { preview: previewText }, changeType: 'content' });
                } else {
                    const file = this.cache.getFile(path);
                    if (file && file.previewStatus === 'has') {
                        const nextPreviewStatus = getDefaultPreviewStatusForPath(path);
                        this.cache.updateFileContent(path, { previewText: '', previewStatus: nextPreviewStatus });
                        previewStatusRepairs.push({ path, previewStatus: nextPreviewStatus });
                        changes.push({ path, changes: { preview: null }, changeType: 'content' });
                    }
                }
                this.previewLoadDeferred.get(path)?.resolve();
            }

            if (previewStatusRepairs.length > 0 && !this.isClosing && sessionId === this.previewLoadSessionId) {
                try {
                    await this.repairPreviewStatusRecords(previewStatusRepairs);
                } catch (error: unknown) {
                    if (!this.isClosing && sessionId === this.previewLoadSessionId) {
                        console.error('[PreviewText] Failed to persist preview status repairs', error);
                    }
                }
            }

            if (changes.length > 0) {
                this.emitChanges(changes);
            }
        } finally {
            this.isPreviewLoadFlushRunning = false;
            if (sessionId === this.previewLoadSessionId && !this.isClosing && this.previewLoadQueue.size > 0) {
                this.schedulePreviewTextLoadFlush();
            }
        }
    }

    async deletePreviewText(path: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        if (this.cache.isReady()) {
            this.cache.updateFileContent(path, { previewText: '' });
        }

        const transaction = this.db.transaction([PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PREVIEW_STORE_NAME);

        await new Promise<void>((resolve, reject) => {
            const op = 'deletePreviewText';
            let lastRequestError: DOMException | Error | null = null;

            const deleteReq = store.delete(path);
            deleteReq.onerror = () => {
                lastRequestError = deleteReq.error || null;
                console.error('[IndexedDB] delete failed', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    path,
                    name: deleteReq.error?.name,
                    message: deleteReq.error?.message
                });
            };

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Get tags from memory cache, returning empty array if none.
     * Helper method for UI components that need tag data.
     *
     * @param path - File path to get tags for
     * @returns Array of tag strings
     */
    getCachedTags(path: string): string[] {
        const file = this.getFile(path);
        // Return empty array if file doesn't exist or tags are null/not extracted yet
        if (!file || file.tags === null) return [];
        return file.tags;
    }

    /**
     * Fetch a feature image blob by path and expected key.
     * Reads from the in-memory LRU first, then IndexedDB.
     */
    async getFeatureImageBlob(path: string, expectedKey: string): Promise<Blob | null> {
        if (!expectedKey) {
            return null;
        }
        await this.init();
        if (!this.db) {
            return null;
        }
        return this.featureImageBlobs.getBlob(this.db, path, expectedKey);
    }

    /**
     * Stream all feature image blob records without allocating an array.
     * Only yields non-empty blobs with a string key.
     */
    async forEachFeatureImageBlobRecord(callback: (path: string, record: { featureImageKey: string; blob: Blob }) => void): Promise<void> {
        await this.init();
        if (!this.db) {
            return;
        }
        await this.featureImageBlobs.forEachBlobRecord(this.db, callback);
    }

    /**
     * Stream all preview text records without hydrating them into the main in-memory cache.
     * Only yields non-empty strings with a string key.
     */
    async forEachPreviewTextRecord(callback: (path: string, previewText: string) => void): Promise<void> {
        await this.init();
        if (!this.db) {
            return;
        }

        const transaction = this.db.transaction([PREVIEW_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PREVIEW_STORE_NAME);

        await new Promise<void>((resolve, reject) => {
            const op = 'forEachPreviewTextRecord';
            let lastRequestError: DOMException | Error | null = null;

            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    return;
                }

                const path = cursor.key;
                const value: unknown = cursor.value;
                if (typeof path === 'string' && typeof value === 'string' && value.length > 0) {
                    callback(path, value);
                }

                cursor.continue();
            };
            request.onerror = () => {
                const requestError = request.error;
                lastRequestError = requestError || null;
                console.error('[IndexedDB] openCursor failed', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    name: requestError?.name,
                    message: requestError?.message
                });
                reject(this.normalizeIdbError(requestError, 'Cursor request failed'));
            };

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Move a feature image blob between paths.
     */
    async moveFeatureImageBlob(oldPath: string, newPath: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');
        await this.featureImageBlobs.moveBlob(this.db, oldPath, newPath);
    }

    /**
     * Move preview text between paths.
     */
    async movePreviewText(oldPath: string, newPath: string): Promise<void> {
        if (oldPath === newPath) {
            return;
        }
        await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const cachedPreviewText = this.cache.isReady() ? this.cache.getPreviewText(oldPath) : '';
        if (this.cache.isReady()) {
            this.cache.updateFileContent(oldPath, { previewText: '' });
            if (cachedPreviewText.length > 0) {
                this.cache.updateFileContent(newPath, { previewText: cachedPreviewText, previewStatus: 'has' });
            }
        }

        const transaction = this.db.transaction([PREVIEW_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PREVIEW_STORE_NAME);

        await new Promise<void>((resolve, reject) => {
            const op = 'movePreviewText';
            let lastRequestError: DOMException | Error | null = null;

            const getReq = store.get(oldPath);
            getReq.onsuccess = () => {
                const previewText: unknown = getReq.result;
                if (typeof previewText === 'string' && previewText.length > 0) {
                    const putReq = store.put(previewText, newPath);
                    putReq.onerror = () => {
                        lastRequestError = putReq.error || null;
                        console.error('[IndexedDB] put failed', {
                            store: PREVIEW_STORE_NAME,
                            op,
                            path: newPath,
                            name: putReq.error?.name,
                            message: putReq.error?.message
                        });
                    };
                }

                const deleteReq = store.delete(oldPath);
                deleteReq.onerror = () => {
                    lastRequestError = deleteReq.error || null;
                    console.error('[IndexedDB] delete failed', {
                        store: PREVIEW_STORE_NAME,
                        op,
                        path: oldPath,
                        name: deleteReq.error?.name,
                        message: deleteReq.error?.message
                    });
                };
            };
            getReq.onerror = () => {
                lastRequestError = getReq.error || null;
                console.error('[IndexedDB] get failed', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    path: oldPath,
                    name: getReq.error?.name,
                    message: getReq.error?.message
                });
                try {
                    transaction.abort();
                } catch (e) {
                    void e;
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onabort = () => {
                console.error('[IndexedDB] transaction aborted', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction aborted');
            };
            transaction.onerror = () => {
                console.error('[IndexedDB] transaction error', {
                    store: PREVIEW_STORE_NAME,
                    op,
                    txError: transaction.error?.message,
                    reqError: lastRequestError?.message
                });
                this.rejectWithTransactionError(reject, transaction, lastRequestError, 'Transaction error');
            };
        });
    }

    /**
     * Delete a feature image blob by path.
     */
    async deleteFeatureImageBlob(path: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('Database not initialized');
        await this.featureImageBlobs.deleteBlob(this.db, path);
    }

    /**
     * Close the database connection.
     * Should be called when the plugin is unloaded.
     */
    close(): void {
        this.isClosing = true;
        this.previewLoadSessionId += 1;
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.initPromise = null;
        this.cache.clear();
        if (this.previewLoadFlushTimer !== null) {
            globalThis.clearTimeout(this.previewLoadFlushTimer);
            this.previewLoadFlushTimer = null;
        }
        if (this.previewWarmupTimer !== null) {
            globalThis.clearTimeout(this.previewWarmupTimer);
            this.previewWarmupTimer = null;
        }
        this.isPreviewWarmupEnabled = false;
        this.isPreviewWarmupComplete = true;
        this.isPreviewWarmupRunning = false;
        this.previewWarmupCursorKey = null;
        this.previewLoadQueue.clear();
        this.previewLoadDeferred.forEach(deferred => deferred.resolve());
        this.previewLoadDeferred.clear();
        this.previewLoadPromises.clear();
        this.featureImageBlobs.clearMemoryCaches();
    }
}
