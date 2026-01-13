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

import type { NotebookNavigatorSettings } from '../settings';
import type { App, TFile } from 'obsidian';
import { isFolderInExcludedFolder, shouldExcludeFile, shouldExcludeFileName } from './fileFilters';
import {
    getActiveHiddenFileNamePatterns,
    getActiveHiddenFileTags,
    getActiveHiddenFiles,
    getActiveHiddenFolders,
    getActiveHiddenTags
} from './vaultProfiles';
import { createHiddenTagVisibility } from './tagPrefixMatcher';
import { getCachedFileTags } from './tagUtils';

// Shared empty array used when hidden items are shown to signal no exclusions should apply
const NO_EXCLUSIONS: string[] = [];
Object.freeze(NO_EXCLUSIONS);

/**
 * Returns the effective list of frontmatter exclusion properties based on the current
 * hidden-item visibility settings. When hidden items are shown, frontmatter-based
 * exclusions should be ignored, so we return a shared empty array to signal no exclusions.
 */
export function getEffectiveFrontmatterExclusions(settings: NotebookNavigatorSettings, showHiddenItems: boolean): string[] {
    if (showHiddenItems) {
        return NO_EXCLUSIONS;
    }
    return getActiveHiddenFiles(settings);
}

/**
 * Detects whether any hidden-item configuration exists so UI surfaces can decide
 * if the toggle button should be shown.
 */
export function hasHiddenItemSources(settings: NotebookNavigatorSettings): boolean {
    const hiddenFolders = getActiveHiddenFolders(settings);
    const hiddenFiles = getActiveHiddenFiles(settings);
    const hiddenFileNamePatterns = getActiveHiddenFileNamePatterns(settings);
    const hiddenFileTags = getActiveHiddenFileTags(settings);
    const hiddenTags = getActiveHiddenTags(settings);
    return (
        hiddenFolders.length > 0 ||
        hiddenTags.length > 0 ||
        hiddenFileTags.length > 0 ||
        hiddenFiles.length > 0 ||
        hiddenFileNamePatterns.length > 0
    );
}

/**
 * Disables the showHiddenItems toggle when no hidden sources remain.
 */
export function resetHiddenToggleIfNoSources(options: {
    settings: NotebookNavigatorSettings;
    showHiddenItems: boolean;
    setShowHiddenItems: (value: boolean) => void;
}): void {
    const { settings, showHiddenItems, setShowHiddenItems } = options;
    if (showHiddenItems && !hasHiddenItemSources(settings)) {
        setShowHiddenItems(false);
    }
}

/**
 * Detects whether a file is hidden by current exclusion settings when hidden items are off.
 */
export function isFileHiddenBySettings(file: TFile, settings: NotebookNavigatorSettings, app: App, showHiddenItems: boolean): boolean {
    if (!file || showHiddenItems) {
        return false;
    }
    const hiddenFiles = getActiveHiddenFiles(settings);
    const hiddenFolders = getActiveHiddenFolders(settings);
    const hiddenFileNamePatterns = getActiveHiddenFileNamePatterns(settings);
    const hiddenFileTags = getActiveHiddenFileTags(settings);
    const hasHiddenFrontmatter = file.extension === 'md' && hiddenFiles.length > 0 && shouldExcludeFile(file, hiddenFiles, app);
    if (hasHiddenFrontmatter) {
        return true;
    }

    if (hiddenFileTags.length > 0 && file.extension === 'md') {
        const visibility = createHiddenTagVisibility(hiddenFileTags, false);
        if (visibility.hasHiddenRules) {
            const tags = getCachedFileTags({ app, file });
            if (tags.some(tag => !visibility.isTagVisible(tag))) {
                return true;
            }
        }
    }

    if (hiddenFileNamePatterns.length > 0 && shouldExcludeFileName(file, hiddenFileNamePatterns)) {
        return true;
    }

    if (hiddenFolders.length === 0 || !file.parent) {
        return false;
    }

    return isFolderInExcludedFolder(file.parent, hiddenFolders);
}
