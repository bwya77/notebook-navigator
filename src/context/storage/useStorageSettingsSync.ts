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

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { TFile } from 'obsidian';
import { TIMEOUTS } from '../../types/obsidian-extended';
import type { ContentProviderType, FileContentType } from '../../interfaces/IContentProvider';
import type { ContentProviderRegistry } from '../../services/content/ContentProviderRegistry';
import type { NotebookNavigatorSettings } from '../../settings';
import { calculateFileDiff } from '../../storage/diffCalculator';
import { type FileData as DBFileData } from '../../storage/IndexedDBStorage';
import { getDBInstance, recordFileChanges, removeFilesFromCache } from '../../storage/fileOperations';
import { runAsyncAction } from '../../utils/async';
import {
    getActiveHiddenFileNamePatterns,
    getActiveHiddenFileTags,
    getActiveHiddenFiles,
    getActiveHiddenFolders
} from '../../utils/vaultProfiles';
import { clearCacheRebuildNoticeState, getCacheRebuildNoticeState, setCacheRebuildNoticeState } from './cacheRebuildNoticeStorage';
import { getCacheRebuildProgressTypes, getMetadataDependentTypes, haveStringArraysChanged } from './storageContentTypes';

/**
 * Reacts to settings/profile changes that affect storage and derived content.
 *
 * The settings UI can emit many changes in a short time (toggling switches, editing lists, changing profiles).
 * This hook batches those changes and ensures only one async "settings reaction" runs at a time.
 *
 * It handles two categories of updates:
 * - Content provider settings: forwarded to `ContentProviderRegistry.handleSettingsChange()` and then used to queue
 *   any required regeneration work.
 * - Exclusions (hidden folders/files/patterns): triggers a diff so the database and tag tree reflect the new
 *   visibility rules.
 */
export function useStorageSettingsSync(params: {
    settings: NotebookNavigatorSettings;
    stoppedRef: RefObject<boolean>;
    contentRegistryRef: RefObject<ContentProviderRegistry | null>;
    hiddenFolders: string[];
    hiddenFiles: string[];
    hiddenFileNamePatterns: string[];
    hiddenFileTags: string[];
    scheduleTagTreeRebuild: (options?: { flush?: boolean }) => void;
    getIndexableFiles: () => TFile[];
    pendingRenameDataRef: RefObject<Map<string, DBFileData>>;
    queueMetadataContentWhenReady: (
        files: TFile[],
        includeTypes?: ContentProviderType[],
        settingsOverride?: NotebookNavigatorSettings
    ) => void;
    queueIndexableFilesForContentGeneration: (files: TFile[], settings: NotebookNavigatorSettings) => { markdownFiles: TFile[] };
    queueIndexableFilesNeedingContentGeneration: (filesToCheck: TFile[], allFiles: TFile[], settings: NotebookNavigatorSettings) => void;
    startCacheRebuildNotice: (total: number, enabledTypes: FileContentType[]) => void;
    clearCacheRebuildNotice: () => void;
}): { resetPendingSettingsChanges: () => void } {
    const {
        settings,
        stoppedRef,
        contentRegistryRef,
        hiddenFolders,
        hiddenFiles,
        hiddenFileNamePatterns,
        hiddenFileTags,
        scheduleTagTreeRebuild,
        getIndexableFiles,
        pendingRenameDataRef,
        queueMetadataContentWhenReady,
        queueIndexableFilesForContentGeneration,
        queueIndexableFilesNeedingContentGeneration,
        startCacheRebuildNotice,
        clearCacheRebuildNotice
    } = params;

    const settingsChangeProcessingRef = useRef(false);
    const pendingSettingsChangeRef = useRef<NotebookNavigatorSettings | null>(null);
    const lastHandledSettingsRef = useRef<NotebookNavigatorSettings | null>(null);
    const pendingSettingsChangeTimeoutIdRef = useRef<number | null>(null);
    const prevSettingsRef = useRef<NotebookNavigatorSettings | null>(null);

    const clearPendingSettingsChangeTimer = useCallback(() => {
        if (pendingSettingsChangeTimeoutIdRef.current === null) {
            return;
        }
        if (typeof window !== 'undefined') {
            window.clearTimeout(pendingSettingsChangeTimeoutIdRef.current);
        }
        pendingSettingsChangeTimeoutIdRef.current = null;
    }, []);

    const resetPendingSettingsChanges = useCallback(() => {
        clearPendingSettingsChangeTimer();
        pendingSettingsChangeRef.current = null;
    }, [clearPendingSettingsChangeTimer]);

    const handleSettingsChanges = useCallback(
        async (oldSettings: NotebookNavigatorSettings, newSettings: NotebookNavigatorSettings) => {
            const registry = contentRegistryRef.current;
            if (!registry) {
                return;
            }

            const clearSettingsNotice = (): void => {
                const state = getCacheRebuildNoticeState();
                if (state?.source !== 'settings') {
                    return;
                }
                clearCacheRebuildNotice();
                clearCacheRebuildNoticeState();
            };

            // Provider-level settings may change which files need content and which providers should run.
            const affectedProviders = await registry.handleSettingsChange(oldSettings, newSettings);
            const enabledFeatureImages = oldSettings.showFeatureImage !== newSettings.showFeatureImage && newSettings.showFeatureImage;
            const shouldShowIndexNotice = (affectedProviders.length > 0 || enabledFeatureImages) && !stoppedRef.current;

            if (shouldShowIndexNotice) {
                const enabledTypes = getCacheRebuildProgressTypes(newSettings);
                if (enabledTypes.length > 0) {
                    const state = getCacheRebuildNoticeState();
                    if (state?.source !== 'rebuild') {
                        const db = getDBInstance();
                        const total = db.getFilesNeedingAnyContent(enabledTypes).size;
                        if (total > 0) {
                            setCacheRebuildNoticeState({ total, source: 'settings', types: enabledTypes });
                            startCacheRebuildNotice(total, enabledTypes);
                        } else {
                            clearSettingsNotice();
                        }
                    }
                } else {
                    clearSettingsNotice();
                }
            }

            if (stoppedRef.current || !contentRegistryRef.current) {
                return;
            }

            const allFiles = getIndexableFiles();
            if (stoppedRef.current || !contentRegistryRef.current) {
                return;
            }

            const metadataDependentTypes = getMetadataDependentTypes(newSettings);
            const { markdownFiles } = queueIndexableFilesForContentGeneration(allFiles, newSettings);

            if (metadataDependentTypes.length > 0) {
                queueMetadataContentWhenReady(markdownFiles, metadataDependentTypes, newSettings);
            }
        },
        [
            clearCacheRebuildNotice,
            contentRegistryRef,
            getIndexableFiles,
            queueIndexableFilesForContentGeneration,
            queueMetadataContentWhenReady,
            startCacheRebuildNotice,
            stoppedRef
        ]
    );

    const drainPendingSettingsChanges = useCallback(async () => {
        if (settingsChangeProcessingRef.current) {
            return;
        }

        settingsChangeProcessingRef.current = true;

        try {
            while (!stoppedRef.current) {
                const nextSettings = pendingSettingsChangeRef.current;
                if (!nextSettings) {
                    return;
                }
                pendingSettingsChangeRef.current = null;

                const previousHandled = lastHandledSettingsRef.current;
                if (!previousHandled) {
                    lastHandledSettingsRef.current = nextSettings;
                    continue;
                }

                await handleSettingsChanges(previousHandled, nextSettings);
                lastHandledSettingsRef.current = nextSettings;
            }
        } finally {
            settingsChangeProcessingRef.current = false;
        }
    }, [handleSettingsChanges, stoppedRef]);

    const scheduleSettingsChanges = useCallback(
        (oldSettings: NotebookNavigatorSettings, newSettings: NotebookNavigatorSettings) => {
            if (stoppedRef.current) {
                return;
            }

            if (!lastHandledSettingsRef.current) {
                lastHandledSettingsRef.current = oldSettings;
            }

            pendingSettingsChangeRef.current = newSettings;

            if (settingsChangeProcessingRef.current) {
                return;
            }

            clearPendingSettingsChangeTimer();
            if (typeof window === 'undefined') {
                runAsyncAction(() => drainPendingSettingsChanges());
                return;
            }

            // Debounce to collapse rapid settings toggles into a single regeneration pass.
            pendingSettingsChangeTimeoutIdRef.current = window.setTimeout(() => {
                pendingSettingsChangeTimeoutIdRef.current = null;
                runAsyncAction(() => drainPendingSettingsChanges());
            }, TIMEOUTS.DEBOUNCE_CONTENT);
        },
        [clearPendingSettingsChangeTimer, drainPendingSettingsChanges, stoppedRef]
    );

    useEffect(() => {
        const previousSettings = prevSettingsRef.current;
        if (!previousSettings) {
            prevSettingsRef.current = settings;
            return;
        }

        const registry = contentRegistryRef.current;
        const relevantSettings = registry?.getAllRelevantSettings() ?? [];
        const hasRelevantSettingsChange =
            !registry || relevantSettings.some(settingKey => previousSettings[settingKey] !== settings[settingKey]);

        if (hasRelevantSettingsChange) {
            scheduleSettingsChanges(previousSettings, settings);
        }

        // Exclusion settings influence which files exist in the cache. Folder/file changes require a diff-based
        // resync. File name pattern changes currently affect visibility and tag tree counting, but do not require
        // rewriting file records.
        const previousHiddenFolders = getActiveHiddenFolders(previousSettings);
        const excludedFoldersChanged = haveStringArraysChanged(previousHiddenFolders, hiddenFolders);
        const previousHiddenFiles = getActiveHiddenFiles(previousSettings);
        const excludedFilesChanged = haveStringArraysChanged(previousHiddenFiles, hiddenFiles);
        const previousHiddenFileNamePatterns = getActiveHiddenFileNamePatterns(previousSettings);
        const excludedFileNamePatternsChanged = haveStringArraysChanged(previousHiddenFileNamePatterns, hiddenFileNamePatterns);
        const previousHiddenFileTags = getActiveHiddenFileTags(previousSettings);
        const excludedFileTagsChanged = haveStringArraysChanged(previousHiddenFileTags, hiddenFileTags);

        if (excludedFoldersChanged || excludedFilesChanged) {
            runAsyncAction(async () => {
                try {
                    const allFiles = getIndexableFiles();
                    const { toAdd, toUpdate, toRemove, cachedFiles } = await calculateFileDiff(allFiles);

                    if (toRemove.length > 0) {
                        await removeFilesFromCache(toRemove);
                    }

                    if (toAdd.length > 0 || toUpdate.length > 0) {
                        await recordFileChanges([...toAdd, ...toUpdate], cachedFiles, pendingRenameDataRef.current);
                    }

                    if (settings.showTags) {
                        scheduleTagTreeRebuild();
                    }

                    queueIndexableFilesNeedingContentGeneration([...toAdd, ...toUpdate], allFiles, settings);
                } catch (error: unknown) {
                    console.error('Error resyncing cache after exclusion changes:', error);
                }
            });
        } else if (excludedFileNamePatternsChanged || excludedFileTagsChanged) {
            if (settings.showTags) {
                scheduleTagTreeRebuild();
            }
        }

        prevSettingsRef.current = settings;
    }, [
        contentRegistryRef,
        getIndexableFiles,
        hiddenFileNamePatterns,
        hiddenFileTags,
        hiddenFiles,
        hiddenFolders,
        pendingRenameDataRef,
        queueIndexableFilesNeedingContentGeneration,
        scheduleSettingsChanges,
        scheduleTagTreeRebuild,
        settings
    ]);

    useEffect(() => {
        return () => {
            resetPendingSettingsChanges();
        };
    }, [resetPendingSettingsChanges]);

    return { resetPendingSettingsChanges };
}
