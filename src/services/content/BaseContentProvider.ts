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

import { App, TFile } from 'obsidian';
import { IContentProvider, type ContentProviderType } from '../../interfaces/IContentProvider';
import { NotebookNavigatorSettings } from '../../settings';
import { FileData } from '../../storage/IndexedDBStorage';
import { getDBInstance, isShutdownInProgress } from '../../storage/fileOperations';
import { getProviderProcessedMtimeField } from '../../storage/providerMtime';
import { TIMEOUTS } from '../../types/obsidian-extended';
import { runAsyncAction } from '../../utils/async';
import { ContentReadCache } from './ContentReadCache';

interface ContentJob {
    file: TFile;
    path: string[];
}

export type ContentProviderUpdate = {
    path: string;
    tags?: string[] | null;
    preview?: string;
    featureImage?: Blob | null;
    featureImageKey?: string | null;
    metadata?: FileData['metadata'];
    customProperty?: FileData['customProperty'];
};

export type ContentProviderProcessResult = {
    update: ContentProviderUpdate | null;
    processed: boolean;
};

/**
 * Base class for content providers
 * Provides common functionality for queue management and batch processing
 */
export abstract class BaseContentProvider implements IContentProvider {
    protected readonly QUEUE_BATCH_SIZE: number = 100;
    protected readonly PARALLEL_LIMIT: number = 10;

    private static readonly RETRY_UNSCHEDULED_AT = Number.MAX_SAFE_INTEGER;
    private static readonly RETRY_INITIAL_DELAY_MS = 1000;
    private static readonly RETRY_MAX_DELAY_MS = 30000;
    private static readonly RETRY_MAX_ATTEMPTS = 5;

    protected queue: ContentJob[] = [];
    protected isProcessing = false;
    protected abortController: AbortController | null = null;
    protected queueDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    protected currentBatchSettings: NotebookNavigatorSettings | null = null;
    // Track files currently being processed to prevent duplicate processing
    // when multiple events fire for the same file in quick succession
    protected processingFiles: Set<string> = new Set();
    // Track files already queued to avoid unbounded duplicate enqueues
    protected queuedFiles: Set<string> = new Set();
    // Tracks files that were queued while already processing, to re-enqueue after the current batch finishes.
    protected dirtyFilesDuringProcessing: Map<string, TFile> = new Map();

    // Track provider stop state to prevent any post-stop scheduling or enqueues
    protected stopped = false;

    // Monotonic session counter used to prevent stale batches from writing or mutating provider state after stop/start.
    private processingSession = 0;
    private activeBatchPromise: Promise<void> | null = null;

    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryState = new Map<string, { attempts: number; nextRetryAt: number }>();

    constructor(
        protected app: App,
        protected readCache: ContentReadCache | null = null
    ) {}

    /**
     * Yields to the event loop to prevent blocking the main thread during batch processing.
     * Uses requestAnimationFrame when available, falls back to setTimeout.
     */
    protected async yieldToEventLoop(): Promise<void> {
        const raf = globalThis.requestAnimationFrame;
        if (typeof raf === 'function') {
            await new Promise<void>(resolve => raf(() => resolve()));
            return;
        }

        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
    }

    protected readFileContent(file: TFile): Promise<string> {
        if (this.readCache) {
            return this.readCache.readFile(file);
        }
        return this.app.vault.cachedRead(file);
    }

    private runProcessNextBatch(): void {
        runAsyncAction(() => {
            const promise = this.processNextBatch();
            this.activeBatchPromise = promise;
            return promise.finally(() => {
                if (this.activeBatchPromise === promise) {
                    this.activeBatchPromise = null;
                }
            });
        });
    }

    private clearRetryTimer(): void {
        if (this.retryTimer !== null) {
            globalThis.clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private clearRetryState(): void {
        this.clearRetryTimer();
        this.retryState.clear();
    }

    private clearRetryForPath(path: string): void {
        if (!this.retryState.delete(path)) {
            return;
        }
        this.scheduleRetryTimer(this.processingSession);
    }

    private scheduleRetry(file: TFile, session: number): void {
        if (this.stopped || this.processingSession !== session) {
            return;
        }

        const existing = this.retryState.get(file.path);
        const attempts = existing ? existing.attempts + 1 : 1;
        if (attempts > BaseContentProvider.RETRY_MAX_ATTEMPTS) {
            if (existing) {
                console.error('Content provider dropped file after retry exhaustion', {
                    provider: this.getContentType(),
                    path: file.path,
                    attempts
                });
                this.retryState.delete(file.path);
                this.scheduleRetryTimer(session);
            }
            return;
        }

        const delay = Math.min(BaseContentProvider.RETRY_INITIAL_DELAY_MS * 2 ** (attempts - 1), BaseContentProvider.RETRY_MAX_DELAY_MS);

        this.retryState.set(file.path, { attempts, nextRetryAt: Date.now() + delay });
        this.scheduleRetryTimer(session);
    }

    private scheduleRetryTimer(session: number): void {
        if (this.stopped || this.processingSession !== session || this.retryState.size === 0) {
            this.clearRetryTimer();
            return;
        }

        let nextRetryAt = BaseContentProvider.RETRY_UNSCHEDULED_AT;
        for (const state of this.retryState.values()) {
            if (state.nextRetryAt < nextRetryAt) {
                nextRetryAt = state.nextRetryAt;
            }
        }

        if (nextRetryAt === BaseContentProvider.RETRY_UNSCHEDULED_AT) {
            this.clearRetryTimer();
            return;
        }

        this.clearRetryTimer();
        const delay = Math.max(0, nextRetryAt - Date.now());
        this.retryTimer = globalThis.setTimeout(() => {
            this.retryTimer = null;
            this.flushRetries(session);
        }, delay);
    }

    private flushRetries(session: number): void {
        if (this.stopped || this.processingSession !== session || this.retryState.size === 0) {
            this.clearRetryState();
            return;
        }

        const now = Date.now();
        const filesToRetry: TFile[] = [];

        for (const [path, state] of this.retryState) {
            if (state.nextRetryAt > now) {
                continue;
            }

            const abstract = this.app.vault.getAbstractFileByPath(path);
            if (abstract instanceof TFile) {
                filesToRetry.push(abstract);
                this.retryState.set(path, { ...state, nextRetryAt: BaseContentProvider.RETRY_UNSCHEDULED_AT });
            } else {
                this.retryState.delete(path);
            }
        }

        if (filesToRetry.length > 0) {
            this.queueFiles(filesToRetry);
        }

        this.scheduleRetryTimer(session);
    }

    abstract getContentType(): ContentProviderType;
    abstract getRelevantSettings(): (keyof NotebookNavigatorSettings)[];
    abstract shouldRegenerate(oldSettings: NotebookNavigatorSettings, newSettings: NotebookNavigatorSettings): boolean;
    abstract clearContent(context?: { oldSettings: NotebookNavigatorSettings; newSettings: NotebookNavigatorSettings }): Promise<void>;

    /**
     * Process a single file to generate content
     * @param job - The job to process
     * @param fileData - Existing file data from database
     * @param settings - Current settings
     * @returns Updated file data or null if no update needed
     */
    protected abstract processFile(
        job: ContentJob,
        fileData: FileData | null,
        settings: NotebookNavigatorSettings
    ): Promise<ContentProviderProcessResult>;

    /**
     * Checks if a file needs processing
     * @param fileData - Existing file data
     * @param file - The file to check
     * @param settings - Current settings
     * @returns True if the file needs processing
     */
    protected abstract needsProcessing(fileData: FileData | null, file: TFile, settings: NotebookNavigatorSettings): boolean;

    queueFiles(files: TFile[]): void {
        if (this.stopped) return;
        // Filter out files that are currently being processed or already queued
        const newJobs: ContentJob[] = [];
        for (const file of files) {
            const p = file.path;
            if (this.processingFiles.has(p)) {
                this.dirtyFilesDuringProcessing.set(p, file);
                continue;
            }
            if (this.queuedFiles.has(p)) continue;
            newJobs.push({ file, path: p.split('/') });
            this.queuedFiles.add(p);
        }

        if (newJobs.length > 0) {
            this.queue.push(...newJobs);
            if (!this.isProcessing && this.queueDebounceTimer === null && this.currentBatchSettings) {
                // Schedule processing when work is queued while the provider is idle.
                // `ContentProviderRegistry` calls `startProcessing()` explicitly, but direct callers might not.
                this.startProcessing(this.currentBatchSettings);
            }
        }
    }

    startProcessing(settings: NotebookNavigatorSettings): void {
        // Allow restarting after a stop
        this.stopped = false;
        this.currentBatchSettings = settings;

        if (this.queueDebounceTimer !== null) {
            globalThis.clearTimeout(this.queueDebounceTimer);
            this.queueDebounceTimer = null;
        }

        this.queueDebounceTimer = globalThis.setTimeout(() => {
            this.queueDebounceTimer = null;
            if (!this.stopped && !this.isProcessing && this.queue.length > 0) {
                // Run batch processing asynchronously without blocking
                this.runProcessNextBatch();
            }
        }, TIMEOUTS.DEBOUNCE_CONTENT);
    }

    onSettingsChanged(settings: NotebookNavigatorSettings): void {
        this.currentBatchSettings = settings;
    }

    async waitForIdle(): Promise<void> {
        while (this.activeBatchPromise) {
            const promise = this.activeBatchPromise;
            try {
                await promise;
            } catch {
                // Errors are already logged by runAsyncAction().
            }
            if (this.activeBatchPromise === promise) {
                break;
            }
        }
    }

    protected async processNextBatch(): Promise<void> {
        if (this.stopped || this.isProcessing || this.queue.length === 0 || !this.currentBatchSettings) {
            return;
        }

        this.isProcessing = true;
        const session = this.processingSession;
        this.abortController = new AbortController();
        const abortSignal = this.abortController.signal;
        const settings = this.currentBatchSettings;

        // Declare activeJobs outside try block so it's accessible in finally
        let activeJobs: { job: ContentJob; fileData: FileData | null; needsProcessing: boolean; expectedProviderMtime: number }[] = [];

        try {
            const db = getDBInstance();
            const batch = this.queue.splice(0, this.QUEUE_BATCH_SIZE);
            // Remove from queued set now that they're moving to evaluation/processing
            batch.forEach(job => this.queuedFiles.delete(job.file.path));

            // Filter jobs based on current settings and database state
            // Uses synchronous database access for immediate results
            const jobsWithData = batch.map(job => {
                const fileData = db.getFile(job.file.path);
                const needsProcessing = this.needsProcessing(fileData, job.file, settings);
                const type = this.getContentType();
                const expectedProviderMtime = fileData ? fileData[getProviderProcessedMtimeField(type)] : 0;
                return { job, fileData, needsProcessing, expectedProviderMtime };
            });

            activeJobs = jobsWithData.filter(item => item.needsProcessing);

            if (activeJobs.length === 0) {
                return;
            }

            // Mark files as being processed
            activeJobs.forEach(({ job }) => {
                this.processingFiles.add(job.file.path);
            });

            // Process files in parallel batches
            const updates: {
                path: string;
                tags?: string[] | null;
                preview?: string;
                featureImage?: Blob | null;
                featureImageKey?: string | null;
                metadata?: FileData['metadata'];
                customProperty?: FileData['customProperty'];
            }[] = [];
            const processedMtimeUpdates: { path: string; mtime: number; expectedPreviousMtime: number }[] = [];

            for (let i = 0; i < activeJobs.length; i += this.PARALLEL_LIMIT) {
                if (this.stopped || abortSignal.aborted || this.processingSession !== session) break;

                const parallelBatch = activeJobs.slice(i, i + this.PARALLEL_LIMIT);
                const results = await Promise.all(
                    parallelBatch.map(async ({ job, fileData, expectedProviderMtime }) => {
                        try {
                            const fileMtimeAtStart = job.file.stat.mtime;
                            const result = await this.processFile(job, fileData, settings);
                            return { job, result, fileMtimeAtStart, expectedProviderMtime };
                        } catch (error) {
                            console.error(`Error processing ${job.file.path}:`, error);
                            return {
                                job,
                                result: { update: null, processed: false },
                                fileMtimeAtStart: job.file.stat.mtime,
                                expectedProviderMtime
                            };
                        }
                    })
                );

                results.forEach(({ job, result, fileMtimeAtStart, expectedProviderMtime }) => {
                    if (this.processingSession === session && !this.stopped && !abortSignal.aborted) {
                        if (!result.processed) {
                            this.scheduleRetry(job.file, session);
                        } else {
                            this.clearRetryForPath(job.file.path);
                        }
                    }

                    if (result.processed) {
                        processedMtimeUpdates.push({
                            path: job.file.path,
                            mtime: fileMtimeAtStart,
                            expectedPreviousMtime: expectedProviderMtime
                        });
                    }

                    if (result.update) {
                        updates.push(result.update);
                    }
                });

                // Yield to event loop between parallel batches to keep UI responsive
                await this.yieldToEventLoop();
            }

            // Batch update database
            if (
                !(this.stopped || abortSignal.aborted || this.processingSession !== session) &&
                (updates.length > 0 || processedMtimeUpdates.length > 0)
            ) {
                // During plugin shutdown, skip writes to avoid benign transaction errors
                if (!isShutdownInProgress()) {
                    await db.batchUpdateFileContentAndProviderProcessedMtimes({
                        provider: this.getContentType(),
                        contentUpdates: updates,
                        processedMtimeUpdates
                    });
                }
            }
        } catch (error: unknown) {
            // Check if error is an abort operation (user-initiated cancellation)
            const isAbortError = error instanceof DOMException && error.name === 'AbortError';
            if (!isAbortError) {
                console.error('Error processing batch:', error);
            }
        } finally {
            const isActiveSession = this.processingSession === session && !this.stopped && !abortSignal.aborted;

            if (this.processingSession === session) {
                // Remove processed files from tracking set
                activeJobs.forEach(({ job }) => {
                    this.processingFiles.delete(job.file.path);
                });
            }

            if (isActiveSession) {
                const dirtyFiles = Array.from(this.dirtyFilesDuringProcessing.values());
                this.dirtyFilesDuringProcessing.clear();
                if (dirtyFiles.length > 0) {
                    this.queueFiles(dirtyFiles);
                }
            } else if (this.processingSession === session) {
                this.dirtyFilesDuringProcessing.clear();
            }

            this.isProcessing = false;

            if (this.queue.length > 0 && isActiveSession) {
                // Process next batch.
                // Defers execution to next animation frame when available.
                const raf = globalThis.requestAnimationFrame;
                if (typeof raf === 'function') {
                    raf(() => {
                        this.runProcessNextBatch();
                    });
                } else {
                    globalThis.setTimeout(() => {
                        this.runProcessNextBatch();
                    }, 0);
                }
            }
        }
    }

    stopProcessing(): void {
        this.processingSession += 1;
        // Mark stopped first so any in-flight logic can observe it
        this.stopped = true;

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        if (this.queueDebounceTimer !== null) {
            globalThis.clearTimeout(this.queueDebounceTimer);
            this.queueDebounceTimer = null;
        }

        this.clearRetryState();
        this.isProcessing = false;
        this.queue = [];
        this.processingFiles.clear();
        this.queuedFiles.clear();
        this.dirtyFilesDuringProcessing.clear();
    }
}
