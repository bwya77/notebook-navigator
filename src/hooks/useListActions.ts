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

import { useCallback } from 'react';
import { Menu } from 'obsidian';
import { useSelectionState, useSelectionDispatch } from '../context/SelectionContext';
import { useServices, useFileSystemOps, useMetadataService } from '../context/ServicesContext';
import { useSettingsState, useSettingsUpdate } from '../context/SettingsContext';
import { useUXPreferenceActions, useUXPreferences } from '../context/UXPreferencesContext';
import { strings } from '../i18n';
import type { SortOption } from '../settings';
import { ItemType } from '../types';
import { TIMEOUTS, OBSIDIAN_COMMANDS } from '../types/obsidian-extended';
import { getEffectiveSortOption, getSortIcon as getSortIconName, SORT_OPTIONS } from '../utils/sortUtils';
import { showListPaneAppearanceMenu } from '../components/ListPaneAppearanceMenu';
import { getDefaultListMode } from './useListPaneAppearance';
import type { FolderAppearance } from './useListPaneAppearance';
import { getFilesForFolder } from '../utils/fileFinder';
import { runAsyncAction } from '../utils/async';
import { executeCommand } from '../utils/typeGuards';
import { resolveDisplayTagPath } from '../services/tagOperations/TagOperationUtils';

/**
 * Custom hook that provides shared actions for list pane toolbars.
 * Used by both ListPaneHeader (desktop) and ListToolbar (mobile) to avoid code duplication.
 *
 * @returns Object containing action handlers and computed values for list pane operations
 */
export function useListActions() {
    const { app, tagOperations, tagTreeService, commandQueue } = useServices();
    const settings = useSettingsState();
    const uxPreferences = useUXPreferences();
    const includeDescendantNotes = uxPreferences.includeDescendantNotes;
    const showHiddenItems = uxPreferences.showHiddenItems;
    const { setIncludeDescendantNotes } = useUXPreferenceActions();
    const updateSettings = useSettingsUpdate();
    const selectionState = useSelectionState();
    const selectionDispatch = useSelectionDispatch();
    const fileSystemOps = useFileSystemOps();
    const metadataService = useMetadataService();

    const handleNewFile = useCallback(async () => {
        const { selectedFolder, selectedTag } = selectionState;

        // Early return if neither folder nor tag is selected
        if (!selectedFolder && !selectedTag) return;

        try {
            // Case 1: Folder is selected - create in that folder (existing behavior)
            if (selectedFolder) {
                await fileSystemOps.createNewFile(selectedFolder);
                return;
            }

            // Case 2: Tag is selected - create in vault root and apply tag
            // Wrap in executeCreateNoteFromTag to prevent auto-reveal from switching away from tag view
            if (selectedTag && commandQueue) {
                await commandQueue.executeCreateNoteFromTag(selectedTag, async () => {
                    // Step 1: Create file WITHOUT opening it first
                    const newFile = await fileSystemOps.createNewFileInRoot(false);

                    if (newFile && tagOperations) {
                        // Step 2: Resolve display path to preserve original casing
                        // (e.g., "devops" → "DevOps")
                        const tagWithOriginalCase = resolveDisplayTagPath(selectedTag, tagTreeService);

                        // Step 3: Apply tag with original casing BEFORE opening file
                        // This ensures auto-reveal keeps us in tag view
                        await tagOperations.addTagToFiles(tagWithOriginalCase, [newFile]);

                        // Step 4: Open the file with rename mode
                        const leaf = app.workspace.getLeaf(false);
                        await leaf.openFile(newFile, {
                            state: { mode: 'source' },
                            active: true
                        });

                        // Step 5: Trigger rename mode after a brief delay
                        window.setTimeout(() => {
                            executeCommand(app, OBSIDIAN_COMMANDS.EDIT_FILE_TITLE);
                        }, TIMEOUTS.FILE_OPERATION_DELAY);
                    }
                });
            }
        } catch (error) {
            console.error('[Notebook Navigator] Error creating new file:', error);
        }
    }, [selectionState, fileSystemOps, tagOperations, tagTreeService, app, commandQueue]);

    const getCurrentSortOption = useCallback((): SortOption => {
        return getEffectiveSortOption(settings, selectionState.selectionType, selectionState.selectedFolder, selectionState.selectedTag);
    }, [settings, selectionState.selectionType, selectionState.selectedFolder, selectionState.selectedTag]);

    const getSortIcon = useCallback(() => {
        return getSortIconName(getCurrentSortOption());
    }, [getCurrentSortOption]);

    const handleAppearanceMenu = useCallback(
        (event: React.MouseEvent) => {
            showListPaneAppearanceMenu({
                event: event.nativeEvent,
                settings,
                selectedFolder: selectionState.selectedFolder,
                selectedTag: selectionState.selectedTag,
                selectionType: selectionState.selectionType,
                updateSettings
            });
        },
        [settings, selectionState.selectedFolder, selectionState.selectedTag, selectionState.selectionType, updateSettings]
    );

    const handleSortMenu = useCallback(
        (event: React.MouseEvent) => {
            const menu = new Menu();
            const currentSort = getCurrentSortOption();
            const isCustomSort =
                (selectionState.selectionType === ItemType.FOLDER &&
                    selectionState.selectedFolder &&
                    metadataService.getFolderSortOverride(selectionState.selectedFolder.path)) ||
                (selectionState.selectionType === ItemType.TAG &&
                    selectionState.selectedTag &&
                    metadataService.getTagSortOverride(selectionState.selectedTag));

            menu.addItem(item => {
                item.setTitle(
                    `${strings.paneHeader.defaultSort}: ${strings.settings.items.sortNotesBy.options[settings.defaultFolderSort]}`
                )
                    .setChecked(!isCustomSort)
                    .onClick(() => {
                        // Reset to default sort
                        runAsyncAction(async () => {
                            if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
                                await metadataService.removeFolderSortOverride(selectionState.selectedFolder.path);
                            } else if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
                                await metadataService.removeTagSortOverride(selectionState.selectedTag);
                            }
                            app.workspace.requestSaveLayout();
                        });
                    });
            });

            menu.addSeparator();

            let lastCategory = '';
            SORT_OPTIONS.forEach(option => {
                const category = option.split('-')[0];
                if (lastCategory && lastCategory !== category) {
                    menu.addSeparator();
                }
                lastCategory = category;

                menu.addItem(item => {
                    item.setTitle(strings.settings.items.sortNotesBy.options[option])
                        .setChecked(!!isCustomSort && currentSort === option)
                        .onClick(() => {
                            // Apply sort option
                            runAsyncAction(async () => {
                                if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
                                    await metadataService.setFolderSortOverride(selectionState.selectedFolder.path, option);
                                } else if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
                                    await metadataService.setTagSortOverride(selectionState.selectedTag, option);
                                } else {
                                    await updateSettings(s => {
                                        s.defaultFolderSort = option;
                                    });
                                }
                                app.workspace.requestSaveLayout();
                            });
                        });
                });
            });

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            selectionState.selectionType,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            app,
            getCurrentSortOption,
            updateSettings,
            metadataService,
            settings
        ]
    );

    /**
     * Toggles the display of notes from descendants.
     * When enabling descendants, automatically selects the active file if it's within the current folder/tag hierarchy.
     */
    const handleToggleDescendants = useCallback(() => {
        const wasShowingDescendants = includeDescendantNotes;

        // Toggle descendant notes preference using UX action
        setIncludeDescendantNotes(!wasShowingDescendants);

        // Special case: When enabling descendants, auto-select the active file if it's in the folder
        if (!wasShowingDescendants && selectionState.selectedFolder && !selectionState.selectedFile) {
            const activeFile = app.workspace.getActiveFile();
            if (activeFile) {
                // Check if the active file would be visible with descendants enabled
                const filesInFolder = getFilesForFolder(
                    selectionState.selectedFolder,
                    settings,
                    { includeDescendantNotes: true, showHiddenItems },
                    app
                );

                if (filesInFolder.some(f => f.path === activeFile.path)) {
                    selectionDispatch({ type: 'SET_SELECTED_FILE', file: activeFile });
                }
            }
        }
    }, [
        setIncludeDescendantNotes,
        includeDescendantNotes,
        showHiddenItems,
        selectionState.selectedFolder,
        selectionState.selectedFile,
        app,
        selectionDispatch,
        settings
    ]);

    const isCustomSort =
        (selectionState.selectionType === ItemType.FOLDER &&
            selectionState.selectedFolder &&
            metadataService.getFolderSortOverride(selectionState.selectedFolder.path)) ||
        (selectionState.selectionType === ItemType.TAG &&
            selectionState.selectedTag &&
            metadataService.getTagSortOverride(selectionState.selectedTag));

    const defaultMode = getDefaultListMode(settings);
    const hasMeaningfulOverrides = (appearance: FolderAppearance | undefined) => {
        if (!appearance) {
            return false;
        }

        const hasModeOverride = (appearance.mode === 'compact' || appearance.mode === 'standard') && appearance.mode !== defaultMode;
        const otherOverrides =
            appearance.titleRows !== undefined ||
            appearance.previewRows !== undefined ||
            appearance.customPropertyType !== undefined ||
            appearance.groupBy !== undefined;

        return hasModeOverride || otherOverrides;
    };

    // Check if folder or tag has custom appearance settings
    const hasCustomAppearance =
        (selectionState.selectedFolder && hasMeaningfulOverrides(settings.folderAppearances?.[selectionState.selectedFolder.path])) ||
        (selectionState.selectedTag && hasMeaningfulOverrides(settings.tagAppearances?.[selectionState.selectedTag]));

    return {
        handleNewFile,
        handleAppearanceMenu,
        handleSortMenu,
        handleToggleDescendants,
        getCurrentSortOption,
        getSortIcon,
        isCustomSort,
        hasCustomAppearance
    };
}
