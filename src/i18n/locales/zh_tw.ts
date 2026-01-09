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

/**
 * Traditional Chinese (zh-TW) language strings for Notebook Navigator
 * Organized by feature/component for easy maintenance
 */
export const STRINGS_ZH_TW = {
    // Common UI elements
    common: {
        cancel: '取消',
        delete: '刪除',
        clear: '清除',
        remove: '移除',
        submit: '提交',
        noSelection: '未選擇',
        untagged: '無標籤',
        featureImageAlt: '特色圖片',
        unknownError: '未知錯誤',
        updateBannerTitle: 'Notebook Navigator 有可用更新',
        updateBannerInstruction: '在設定 -> 社群外掛中更新',
        updateIndicatorLabel: '有新版本可用'
    },

    // List pane
    listPane: {
        emptyStateNoSelection: '選擇資料夾或標籤以檢視筆記',
        emptyStateNoNotes: '無筆記',
        pinnedSection: '已釘選',
        notesSection: '筆記',
        filesSection: '檔案',
        hiddenItemAriaLabel: '{name} (已隱藏)'
    },

    // Tag list
    tagList: {
        untaggedLabel: '無標籤',
        tags: '標籤'
    },

    navigationPane: {
        shortcutsHeader: '捷徑',
        recentNotesHeader: '最近筆記',
        recentFilesHeader: '最近檔案',
        reorderRootFoldersTitle: '重新排列導覽',
        reorderRootFoldersHint: '使用方向鍵或拖曳來重新排列',
        vaultRootLabel: '保險庫',
        resetRootToAlpha: '重設為字母順序',
        resetRootToFrequency: '重設為頻率排序',
        pinShortcuts: '釘選捷徑',
        pinShortcutsAndRecentNotes: '釘選捷徑和最近筆記',
        pinShortcutsAndRecentFiles: '釘選捷徑和最近檔案',
        unpinShortcuts: '取消釘選捷徑',
        unpinShortcutsAndRecentNotes: '取消釘選捷徑和最近筆記',
        unpinShortcutsAndRecentFiles: '取消釘選捷徑和最近檔案',
        profileMenuAria: '變更保險庫設定檔'
    },

    shortcuts: {
        folderExists: '資料夾已在捷徑中',
        noteExists: '筆記已在捷徑中',
        tagExists: '標籤已在捷徑中',
        searchExists: '搜尋捷徑已存在',
        emptySearchQuery: '儲存前請輸入搜尋查詢',
        emptySearchName: '儲存搜尋前請輸入名稱',
        add: '新增至捷徑',
        addNotesCount: '新增 {count} 個筆記至捷徑',
        addFilesCount: '新增 {count} 個檔案至捷徑',
        rename: '重新命名捷徑',
        remove: '從捷徑移除',
        removeAll: '移除所有捷徑',
        removeAllConfirm: '移除所有捷徑？',
        folderNotesPinned: '已釘選 {count} 個資料夾筆記'
    },

    // Pane header
    paneHeader: {
        collapseAllFolders: '摺疊項目',
        expandAllFolders: '展開所有項目',
        newFolder: '新建資料夾',
        newNote: '新筆記',
        mobileBackToNavigation: '返回導覽',
        changeSortOrder: '變更排序方式',
        defaultSort: '預設',
        showFolders: '顯示導覽',
        reorderRootFolders: '重新排列導覽',
        finishRootFolderReorder: '完成重新排列',
        toggleDescendantNotes: '顯示子資料夾/後代的筆記',
        showExcludedItems: '顯示隱藏的資料夾、標籤和筆記',
        hideExcludedItems: '隱藏隱藏的資料夾、標籤和筆記',
        showDualPane: '顯示雙窗格',
        showSinglePane: '顯示單窗格',
        changeAppearance: '變更外觀',
        search: '搜尋'
    },
    // Search input
    searchInput: {
        placeholder: '搜尋...',
        placeholderOmnisearch: 'Omnisearch...',
        clearSearch: '清除搜尋',
        saveSearchShortcut: '將搜尋儲存至捷徑',
        removeSearchShortcut: '從捷徑移除搜尋',
        shortcutModalTitle: '儲存搜尋捷徑',
        shortcutNamePlaceholder: '輸入捷徑名稱'
    },

    // Context menus
    contextMenu: {
        file: {
            openInNewTab: '在新分頁中開啟',
            openToRight: '在右側開啟',
            openInNewWindow: '在新視窗中開啟',
            openMultipleInNewTabs: '在新分頁中開啟 {count} 個筆記',
            openMultipleToRight: '在右側開啟 {count} 個筆記',
            openMultipleInNewWindows: '在新視窗中開啟 {count} 個筆記',
            pinNote: '釘選筆記',
            unpinNote: '取消釘選筆記',
            pinMultipleNotes: '釘選 {count} 個筆記',
            unpinMultipleNotes: '取消釘選 {count} 個筆記',
            duplicateNote: '複製筆記',
            duplicateMultipleNotes: '複製 {count} 個筆記',
            openVersionHistory: '開啟版本歷史',
            revealInFolder: '在資料夾中定位',
            revealInFinder: '在 Finder 中顯示',
            showInExplorer: '在檔案總管中顯示',
            copyDeepLink: '複製 Obsidian URL',
            copyPath: '複製檔案系統路徑',
            copyRelativePath: '複製保險庫路徑',
            renameNote: '重新命名筆記',
            deleteNote: '刪除筆記',
            deleteMultipleNotes: '刪除 {count} 個筆記',
            moveNoteToFolder: '移動筆記至...',
            moveFileToFolder: '移動檔案至...',
            moveMultipleNotesToFolder: '將 {count} 個筆記移動至...',
            moveMultipleFilesToFolder: '將 {count} 個檔案移動至...',
            addTag: '新增標籤',
            removeTag: '移除標籤',
            removeAllTags: '移除所有標籤',
            changeIcon: '變更圖示',
            changeColor: '變更顏色',
            // File-specific context menu items (non-markdown files)
            openMultipleFilesInNewTabs: '在新分頁中開啟 {count} 個檔案',
            openMultipleFilesToRight: '在右側開啟 {count} 個檔案',
            openMultipleFilesInNewWindows: '在新視窗中開啟 {count} 個檔案',
            pinFile: '釘選檔案',
            unpinFile: '取消釘選檔案',
            pinMultipleFiles: '釘選 {count} 個檔案',
            unpinMultipleFiles: '取消釘選 {count} 個檔案',
            duplicateFile: '複製檔案',
            duplicateMultipleFiles: '複製 {count} 個檔案',
            renameFile: '重新命名檔案',
            deleteFile: '刪除檔案',
            deleteMultipleFiles: '刪除 {count} 個檔案'
        },
        folder: {
            newNote: '新筆記',
            newNoteFromTemplate: '從範本新建筆記',
            newFolder: '新建資料夾',
            newCanvas: '新建畫布',
            newBase: '新建資料庫',
            newDrawing: '新建繪圖',
            newExcalidrawDrawing: '新建 Excalidraw 繪圖',
            newTldrawDrawing: '新建 Tldraw 繪圖',
            duplicateFolder: '複製資料夾',
            searchInFolder: '在資料夾中搜尋',
            copyPath: '複製檔案系統路徑',
            copyRelativePath: '複製保險庫路徑',
            createFolderNote: '建立資料夾筆記',
            detachFolderNote: '解除資料夾筆記',
            deleteFolderNote: '刪除資料夾筆記',
            changeIcon: '變更圖示',
            changeColor: '變更顏色',
            changeBackground: '變更背景',
            excludeFolder: '隱藏資料夾',
            unhideFolder: '顯示資料夾',
            moveFolder: '移動資料夾至...',
            renameFolder: '重新命名資料夾',
            deleteFolder: '刪除資料夾'
        },
        tag: {
            changeIcon: '變更圖示',
            changeColor: '變更顏色',
            changeBackground: '變更背景',
            showTag: '顯示標籤',
            hideTag: '隱藏標籤'
        },
        navigation: {
            addSeparator: '新增分隔線',
            removeSeparator: '移除分隔線'
        },
        style: {
            title: '樣式',
            copy: '複製樣式',
            paste: '貼上樣式',
            removeIcon: '移除圖示',
            removeColor: '移除顏色',
            removeBackground: '移除背景',
            clear: '清除樣式'
        }
    },

    // Folder appearance menu
    folderAppearance: {
        standardPreset: '標準',
        compactPreset: '精簡',
        defaultSuffix: '(預設)',
        titleRows: '標題行數',
        previewRows: '預覽行數',
        groupBy: '分組依據',
        defaultTitleOption: (rows: number) => `預設標題行數 (${rows})`,
        defaultPreviewOption: (rows: number) => `預設預覽行數 (${rows})`,
        defaultGroupOption: (groupLabel: string) => `預設分組 (${groupLabel})`,
        titleRowOption: (rows: number) => `標題${rows}行`,
        previewRowOption: (rows: number) => `預覽${rows}行`
    },

    // Modal dialogs
    modals: {
        iconPicker: {
            searchPlaceholder: '搜尋圖示...',
            recentlyUsedHeader: '最近使用',
            emptyStateSearch: '開始輸入以搜尋圖示',
            emptyStateNoResults: '未找到圖示',
            showingResultsInfo: '顯示 {count} 個結果中的 50 個。輸入更多內容以縮小範圍。',
            emojiInstructions: '輸入或貼上任何表情符號作為圖示使用',
            removeIcon: '移除圖示',
            allTabLabel: '全部'
        },
        fileIconRuleEditor: {
            addRuleAria: '新增規則'
        },
        interfaceIcons: {
            title: '介面圖示',
            fileItemsSection: '檔案項目',
            items: {
                'nav-shortcuts': '捷徑',
                'nav-recent-files': '最近檔案',
                'nav-expand-all': '全部展開',
                'nav-collapse-all': '全部摺疊',
                'nav-tree-expand': '樹狀箭頭: 展開',
                'nav-tree-collapse': '樹狀箭頭: 摺疊',
                'nav-hidden-items': '隱藏項目',
                'nav-root-reorder': '重新排列根資料夾',
                'nav-new-folder': '新建資料夾',
                'nav-show-single-pane': '顯示單窗格',
                'nav-show-dual-pane': '顯示雙窗格',
                'nav-profile-chevron': '設定檔選單箭頭',
                'list-search': '搜尋',
                'list-descendants': '子資料夾中的筆記',
                'list-sort-ascending': '排序: 升序',
                'list-sort-descending': '排序: 降序',
                'list-appearance': '變更外觀',
                'list-new-note': '新建筆記',
                'nav-folder-open': '資料夾開啟',
                'nav-folder-closed': '資料夾關閉',
                'nav-folder-note': '資料夾筆記',
                'nav-tag': '標籤',
                'list-pinned': '釘選項目',
                'file-word-count': '字數統計',
                'file-custom-property': '自訂屬性'
            }
        },
        colorPicker: {
            currentColor: '目前',
            newColor: '新顏色',
            paletteDefault: '預設',
            paletteCustom: '自訂',
            copyColors: '複製顏色',
            colorsCopied: '顏色已複製到剪貼簿',
            copyClipboardError: '無法寫入剪貼簿',
            pasteColors: '貼上顏色',
            pasteClipboardError: '無法讀取剪貼簿',
            pasteInvalidFormat: '需要十六進位顏色值',
            colorsPasted: '顏色貼上成功',
            resetUserColors: '清除自訂顏色',
            clearCustomColorsConfirm: '刪除所有自訂顏色？',
            userColorSlot: '顏色 {slot}',
            recentColors: '最近使用的顏色',
            clearRecentColors: '清除最近使用的顏色',
            removeRecentColor: '移除顏色',
            removeColor: '移除顏色',
            apply: '套用',
            hexLabel: 'HEX',
            rgbLabel: 'RGBA'
        },
        selectVaultProfile: {
            title: '選擇保險庫設定檔',
            currentBadge: '使用中',
            emptyState: '沒有可用的保險庫設定檔。'
        },
        tagOperation: {
            renameTitle: '重新命名標籤 {tag}',
            deleteTitle: '刪除標籤 {tag}',
            newTagPrompt: '新標籤名稱',
            newTagPlaceholder: '輸入新標籤名稱',
            renameWarning: '重新命名標籤 {oldTag} 將修改 {count} 個{files}。',
            deleteWarning: '刪除標籤 {tag} 將修改 {count} 個{files}。',
            modificationWarning: '這將更新檔案修改日期。',
            affectedFiles: '受影響的檔案：',
            andMore: '以及 {count} 個更多...',
            confirmRename: '重新命名標籤',
            renameUnchanged: '{tag} 未變更',
            renameNoChanges: '{oldTag} → {newTag} ({countLabel})',
            invalidTagName: '請輸入有效的標籤名稱。',
            descendantRenameError: '無法將標籤移動到自身或其子標籤中。',
            confirmDelete: '刪除標籤',
            file: '個檔案',
            files: '個檔案'
        },
        fileSystem: {
            newFolderTitle: '新建資料夾',
            renameFolderTitle: '重新命名資料夾',
            renameFileTitle: '重新命名檔案',
            deleteFolderTitle: "刪除 '{name}'？",
            deleteFileTitle: "刪除 '{name}'？",
            folderNamePrompt: '輸入資料夾名稱：',
            hideInOtherVaultProfiles: '在其他保險庫設定檔中隱藏',
            renamePrompt: '輸入新名稱：',
            renameVaultTitle: '變更保險庫顯示名稱',
            renameVaultPrompt: '輸入自訂顯示名稱（留空使用預設值）：',
            deleteFolderConfirm: '您確定要刪除此資料夾及其所有內容嗎？',
            deleteFileConfirm: '您確定要刪除此檔案嗎？',
            removeAllTagsTitle: '移除所有標籤',
            removeAllTagsFromNote: '您確定要從這個筆記中移除所有標籤嗎？',
            removeAllTagsFromNotes: '您確定要從 {count} 個筆記中移除所有標籤嗎？'
        },
        folderNoteType: {
            title: '選擇資料夾筆記類型',
            folderLabel: '資料夾：{name}'
        },
        folderSuggest: {
            placeholder: (name: string) => `將 ${name} 移動至資料夾...`,
            multipleFilesLabel: (count: number) => `${count} 個檔案`,
            navigatePlaceholder: '導覽至資料夾...',
            instructions: {
                navigate: '導覽',
                move: '移動',
                select: '選擇',
                dismiss: '取消'
            }
        },
        homepage: {
            placeholder: '搜尋檔案...',
            instructions: {
                navigate: '導覽',
                select: '設為首頁',
                dismiss: '取消'
            }
        },
        navigationBanner: {
            placeholder: '搜尋圖片...',
            instructions: {
                navigate: '導覽',
                select: '設為橫幅',
                dismiss: '取消'
            }
        },
        tagSuggest: {
            navigatePlaceholder: '導覽至標籤...',
            addPlaceholder: '搜尋要新增的標籤...',
            removePlaceholder: '選擇要移除的標籤...',
            createNewTag: '建立新標籤: #{tag}',
            instructions: {
                navigate: '導覽',
                select: '選擇',
                dismiss: '取消',
                add: '新增標籤',
                remove: '移除標籤'
            }
        },
        welcome: {
            title: '歡迎使用 {pluginName}',
            introText: '您好！在開始之前，強烈建議您觀看下方影片的前五分鐘，以了解面板和「顯示子資料夾中的筆記」開關是如何運作的。',
            continueText: '如果您還有五分鐘時間，請繼續觀看影片以了解精簡顯示模式以及如何正確設定捷徑和重要的快速鍵。',
            thanksText: '非常感謝您的下載，祝您使用愉快！',
            videoAlt: '安裝與精通 Notebook Navigator',
            openVideoButton: '播放影片',
            closeButton: '稍後觀看'
        }
    },

    // File system operations
    fileSystem: {
        errors: {
            createFolder: '建立資料夾失敗：{error}',
            createFile: '建立檔案失敗：{error}',
            renameFolder: '重新命名資料夾失敗：{error}',
            renameFolderNoteConflict: '無法重新命名：「{name}」已在此資料夾中存在',
            renameFile: '重新命名檔案失敗：{error}',
            deleteFolder: '刪除資料夾失敗：{error}',
            deleteFile: '刪除檔案失敗：{error}',
            duplicateNote: '複製筆記失敗：{error}',
            duplicateFolder: '複製資料夾失敗：{error}',
            openVersionHistory: '開啟版本歷史失敗：{error}',
            versionHistoryNotFound: '未找到版本歷史命令。請確保已啟用 Obsidian 同步。',
            revealInExplorer: '在系統檔案總管中定位檔案失敗：{error}',
            folderNoteAlreadyExists: '資料夾筆記已存在',
            folderAlreadyExists: '資料夾「{name}」已存在',
            folderNotesDisabled: '請在設定中啟用資料夾筆記以轉換檔案',
            folderNoteAlreadyLinked: '此檔案已作為資料夾筆記',
            folderNoteNotFound: '所選資料夾中沒有資料夾筆記',
            folderNoteUnsupportedExtension: '不支援的檔案副檔名：{extension}',
            folderNoteMoveFailed: '轉換過程中移動檔案失敗：{error}',
            folderNoteRenameConflict: '資料夾中已存在名為「{name}」的檔案',
            folderNoteConversionFailed: '轉換為資料夾筆記失敗',
            folderNoteConversionFailedWithReason: '轉換為資料夾筆記失敗：{error}',
            folderNoteOpenFailed: '檔案已轉換但開啟資料夾筆記失敗：{error}',
            failedToDeleteFile: '刪除 {name} 失敗: {error}',
            failedToDeleteMultipleFiles: '刪除 {count} 個檔案失敗',
            versionHistoryNotAvailable: '版本歷史服務不可用',
            drawingAlreadyExists: '同名繪圖已存在',
            failedToCreateDrawing: '建立繪圖失敗',
            noFolderSelected: 'Notebook Navigator 中未選擇資料夾',
            noFileSelected: '未選擇檔案'
        },
        warnings: {
            linkBreakingNameCharacters: '該名稱包含會破壞 Obsidian 連結的字元：#, |, ^, %%, [[, ]].',
            forbiddenNameCharactersAllPlatforms: '名稱不能以 . 開頭，也不能包含 : 或 /。',
            forbiddenNameCharactersWindows: 'Windows 保留字元不允許使用：<, >, ", \\, |, ?, *。'
        },
        notices: {
            hideFolder: '已隱藏資料夾：{name}',
            showFolder: '已顯示資料夾：{name}'
        },
        notifications: {
            deletedMultipleFiles: '已刪除 {count} 個檔案',
            movedMultipleFiles: '已將 {count} 個檔案移動至 {folder}',
            folderNoteConversionSuccess: '已在「{name}」中將檔案轉換為資料夾筆記',
            folderMoved: '已移動資料夾「{name}」',
            deepLinkCopied: 'Obsidian URL 已複製到剪貼簿',
            pathCopied: '路徑已複製到剪貼簿',
            relativePathCopied: '相對路徑已複製到剪貼簿',
            tagAddedToNote: '已將標籤新增到 1 個筆記',
            tagAddedToNotes: '已將標籤新增到 {count} 個筆記',
            tagRemovedFromNote: '已從 1 個筆記中移除標籤',
            tagRemovedFromNotes: '已從 {count} 個筆記中移除標籤',
            tagsClearedFromNote: '已從 1 個筆記中清除所有標籤',
            tagsClearedFromNotes: '已從 {count} 個筆記中清除所有標籤',
            noTagsToRemove: '沒有可移除的標籤',
            noFilesSelected: '未選擇檔案',
            tagOperationsNotAvailable: '標籤操作不可用',
            tagsRequireMarkdown: '標籤僅支援 Markdown 筆記',
            iconPackDownloaded: '{provider} 已下載',
            iconPackUpdated: '{provider} 已更新 ({version})',
            iconPackRemoved: '{provider} 已移除',
            iconPackLoadFailed: '{provider} 載入失敗',
            hiddenFileReveal: '檔案已隱藏。啟用「顯示隱藏項目」以顯示它'
        },
        confirmations: {
            deleteMultipleFiles: '確定要刪除 {count} 個檔案嗎？',
            deleteConfirmation: '此操作無法復原。'
        },
        defaultNames: {
            untitled: '未命名'
        }
    },

    // Drag and drop operations
    dragDrop: {
        errors: {
            cannotMoveIntoSelf: '無法將資料夾移動到自身或其子資料夾中。',
            itemAlreadyExists: '此位置已存在名為「{name}」的項目。',
            failedToMove: '移動失敗：{error}',
            failedToAddTag: '新增標籤「{tag}」失敗',
            failedToClearTags: '清除標籤失敗',
            failedToMoveFolder: '移動資料夾「{name}」失敗',
            failedToImportFiles: '匯入失敗：{names}'
        },
        notifications: {
            filesAlreadyExist: '{count} 個檔案在目標位置已存在',
            filesAlreadyHaveTag: '{count} 個檔案已經有此標籤或更具體的標籤',
            noTagsToClear: '沒有要清除的標籤',
            fileImported: '已匯入 1 個檔案',
            filesImported: '已匯入 {count} 個檔案'
        }
    },

    // Date grouping
    dateGroups: {
        today: '今天',
        yesterday: '昨天',
        previous7Days: '過去 7 天',
        previous30Days: '過去 30 天'
    },

    // Plugin commands
    commands: {
        open: '開啟',
        openHomepage: '開啟首頁',
        revealFile: '定位檔案',
        search: '搜尋',
        toggleDualPane: '切換雙窗格布局',
        selectVaultProfile: '變更保險庫設定檔',
        selectVaultProfile1: '切換到保險庫設定檔 1',
        selectVaultProfile2: '切換到保險庫設定檔 2',
        selectVaultProfile3: '切換到保險庫設定檔 3',
        deleteFile: '刪除檔案',
        createNewNote: '建立新筆記',
        createNewNoteFromTemplate: '從範本新建筆記',
        moveFiles: '移動檔案',
        selectNextFile: '選擇下一個檔案',
        selectPreviousFile: '選擇上一個檔案',
        convertToFolderNote: '轉換為資料夾筆記',
        setAsFolderNote: '設為資料夾筆記',
        detachFolderNote: '解除資料夾筆記',
        pinAllFolderNotes: '釘選所有資料夾筆記',
        navigateToFolder: '導覽至資料夾',
        navigateToTag: '導覽至標籤',
        addShortcut: '新增至捷徑',
        openShortcut: '開啟捷徑 {number}',
        toggleDescendants: '切換後代',
        toggleHidden: '切換隱藏的資料夾、標籤和筆記',
        toggleTagSort: '切換標籤排序',
        collapseExpand: '摺疊/展開所有項目',
        addTag: '為選定檔案新增標籤',
        removeTag: '從選定檔案移除標籤',
        removeAllTags: '從選定檔案移除所有標籤',
        rebuildCache: '重建快取'
    },

    // Plugin UI
    plugin: {
        viewName: '筆記本導覽器',
        ribbonTooltip: '筆記本導覽器',
        revealInNavigator: '在筆記本導覽器中定位'
    },

    // Tooltips
    tooltips: {
        lastModifiedAt: '最後修改於',
        createdAt: '建立於',
        file: '個檔案',
        files: '個檔案',
        folder: '個資料夾',
        folders: '個資料夾'
    },

    // Settings
    settings: {
        metadataReport: {
            exportSuccess: '失敗的中繼資料報告已匯出至：{filename}',
            exportFailed: '匯出中繼資料報告失敗'
        },
        sections: {
            general: '一般',
            notes: '筆記',
            navigationPane: '導覽窗格',
            icons: '圖示包',
            tags: '標籤',
            folders: '資料夾',
            foldersAndTags: '資料夾與標籤',
            search: '搜尋',
            searchAndHotkeys: '搜尋與快速鍵',
            listPane: '列表窗格',
            hotkeys: '快速鍵',
            advanced: '進階'
        },
        groups: {
            general: {
                filtering: '篩選',
                behavior: '行為',
                view: '外觀',
                icons: '圖示',
                desktopAppearance: '桌面外觀',
                formatting: '格式'
            },
            navigation: {
                appearance: '外觀',
                shortcutsAndRecent: '捷徑和最近項目'
            },
            list: {
                display: '外觀',
                pinnedNotes: '釘選筆記'
            },
            notes: {
                frontmatter: '前置中繼資料',
                icon: '圖示',
                title: '標題',
                previewText: '預覽文字',
                featureImage: '特色圖片',
                tags: '標籤',
                customProperty: '自訂屬性',
                date: '日期',
                parentFolder: '父資料夾'
            }
        },
        items: {
            searchProvider: {
                name: '搜尋提供器',
                desc: '在快速檔名搜尋或使用 Omnisearch 外掛的全文搜尋之間選擇。（不同步）',
                options: {
                    internal: '篩選搜尋',
                    omnisearch: 'Omnisearch（全文）'
                },
                info: {
                    filterSearch: {
                        title: '篩選搜尋（預設）：',
                        description:
                            '按名稱和標籤篩選目前資料夾和子資料夾中的檔案。篩選模式：混合文字和標籤匹配所有條件（例如「專案 #工作」）。標籤模式：僅使用標籤搜尋支援 AND/OR 運算子（例如「#工作 AND #緊急」、「#專案 OR #個人」）。Cmd/Ctrl+點按標籤以 AND 方式新增，Cmd/Ctrl+Shift+點按以 OR 方式新增。支援使用 ! 前綴進行排除（例如 !草稿，!#已歸檔）以及使用 !# 尋找無標籤筆記。'
                    },
                    omnisearch: {
                        title: 'Omnisearch：',
                        description:
                            '全文搜尋，搜尋整個保險庫，然後篩選結果以僅顯示來自目前資料夾、子資料夾或選定標籤的檔案。需要安裝 Omnisearch 外掛 - 如果不可用，搜尋將自動回退到篩選搜尋。',
                        warningNotInstalled: '未安裝 Omnisearch 外掛。使用篩選搜尋。',
                        limitations: {
                            title: '已知限制：',
                            performance: '效能：可能較慢，特別是在大型保險庫中搜尋少於 3 個字元時',
                            pathBug: '路徑錯誤：無法在包含非 ASCII 字元的路徑中搜尋，且不能正確搜尋子路徑，影響搜尋結果中顯示的檔案',
                            limitedResults:
                                '結果有限：由於 Omnisearch 搜尋整個保險庫並在篩選前傳回有限數量的結果，如果保險庫其他地方存在太多匹配項，目前資料夾中的相關檔案可能不會出現',
                            previewText:
                                '預覽文字：筆記預覽被 Omnisearch 結果摘錄取代，如果搜尋匹配醒目顯示出現在檔案的其他位置，可能不會顯示實際的醒目顯示'
                        }
                    }
                }
            },
            listPaneTitle: {
                name: '列表窗格標題（僅限桌面版）',
                desc: '選擇列表窗格標題的顯示位置。',
                options: {
                    header: '顯示在標題列',
                    list: '顯示在列表窗格',
                    hidden: '不顯示'
                }
            },
            sortNotesBy: {
                name: '筆記排序方式',
                desc: '選擇筆記列表中的筆記排序方式。',
                options: {
                    'modified-desc': '編輯日期（最新在頂部）',
                    'modified-asc': '編輯日期（最舊在頂部）',
                    'created-desc': '建立日期（最新在頂部）',
                    'created-asc': '建立日期（最舊在頂部）',
                    'title-asc': '標題（升序）',
                    'title-desc': '標題（降序）'
                }
            },
            revealFileOnListChanges: {
                name: '列表變更時捲動到選定檔案',
                desc: '在釘選筆記、顯示後代筆記、變更資料夾外觀或執行檔案操作時捲動到選定的檔案。'
            },
            includeDescendantNotes: {
                name: '顯示子資料夾/後代的筆記（不同步）',
                desc: '在檢視資料夾或標籤時包含巢狀子資料夾和標籤後代中的筆記。'
            },
            limitPinnedToCurrentFolder: {
                name: '將釘選筆記限制在其資料夾',
                desc: '釘選筆記僅在檢視其釘選的資料夾或標籤時顯示。'
            },
            separateNoteCounts: {
                name: '分別顯示目前和後代計數',
                desc: '在資料夾和標籤中以「目前 ▾ 後代」格式顯示筆記計數。'
            },
            groupNotes: {
                name: '分組筆記',
                desc: '在按日期或資料夾分組的筆記之間顯示標題。啟用資料夾分組時，標籤檢視使用日期分組。',
                options: {
                    none: '不分組',
                    date: '按日期分組',
                    folder: '按資料夾分組'
                }
            },
            showPinnedGroupHeader: {
                name: '顯示釘選群組標題',
                desc: '在釘選筆記上方顯示分組標題。'
            },
            showPinnedIcon: {
                name: '顯示釘選圖示',
                desc: '在釘選區段標題旁顯示圖示。'
            },
            defaultListMode: {
                name: '預設列表模式',
                desc: '選擇預設列表布局。標準顯示標題、日期、描述和預覽文字。精簡只顯示標題。外觀可按資料夾覆寫。',
                options: {
                    standard: '標準',
                    compact: '精簡'
                }
            },
            showFileIcons: {
                name: '顯示檔案圖示',
                desc: '顯示檔案圖示並保留左對齊間距。停用後將移除圖示和縮排。優先順序：自訂 > 檔名 > 檔案類型 > 預設。'
            },
            showFilenameMatchIcons: {
                name: '按檔名設定圖示',
                desc: '根據檔名中的文字指派圖示。'
            },
            fileNameIconMap: {
                name: '檔名圖示對應',
                desc: '包含指定文字的檔案將取得指定圖示。每行一個對應：文字=圖示',
                placeholder: '# 文字=圖示\n會議=LiCalendar\n發票=PhReceipt',
                editTooltip: '編輯對應'
            },
            showCategoryIcons: {
                name: '按檔案類型設定圖示',
                desc: '根據檔案副檔名指派圖示。'
            },
            fileTypeIconMap: {
                name: '檔案類型圖示對應',
                desc: '具有指定副檔名的檔案將取得指定圖示。每行一個對應：副檔名=圖示',
                placeholder: '# 副檔名=圖示\ncpp=LiFileCode\npdf=RaBook',
                editTooltip: '編輯對應'
            },
            optimizeNoteHeight: {
                name: '可變筆記高度',
                desc: '為釘選筆記和無預覽文字的筆記使用精簡高度。'
            },
            compactItemHeight: {
                name: '精簡項目高度',
                desc: '設定桌面和行動裝置的精簡列表項目高度。',
                resetTooltip: '恢復預設值 (28px)'
            },
            compactItemHeightScaleText: {
                name: '隨精簡高度縮放文字',
                desc: '當減小精簡列表項目高度時同步縮放文字。'
            },
            showParentFolder: {
                name: '顯示父資料夾',
                desc: '為子資料夾或標籤中的筆記顯示父資料夾名稱。'
            },
            parentFolderClickRevealsFile: {
                name: '點按父資料夾開啟資料夾',
                desc: '點按父資料夾名稱時，在列表面板中開啟該資料夾。'
            },
            showParentFolderColor: {
                name: '顯示父資料夾顏色',
                desc: '在父資料夾標籤上使用資料夾顏色。'
            },
            showParentFolderIcon: {
                name: '顯示父資料夾圖示',
                desc: '在父資料夾標籤旁顯示資料夾圖示。'
            },
            showQuickActions: {
                name: '顯示快速操作（僅桌面版）',
                desc: '懸停在檔案上時顯示操作按鈕。按鈕控制項選擇顯示哪些操作。'
            },
            dualPane: {
                name: '雙窗格布局（不同步）',
                desc: '在桌面端並排顯示導覽窗格和列表窗格。'
            },
            dualPaneOrientation: {
                name: '雙欄布局方向（不同步）',
                desc: '雙欄啟用時選擇水平或垂直布局。',
                options: {
                    horizontal: '水平分割',
                    vertical: '垂直分割'
                }
            },
            appearanceBackground: {
                name: '背景色',
                desc: '為導覽窗格和列表窗格選擇背景色。',
                options: {
                    separate: '分開背景',
                    primary: '使用列表背景',
                    secondary: '使用導覽背景'
                }
            },
            appearanceScale: {
                name: '縮放級別（不同步）',
                desc: '控制 Notebook Navigator 的整體縮放級別。'
            },
            startView: {
                name: '預設啟動檢視',
                desc: '選擇開啟 Notebook Navigator 時顯示的窗格。導覽窗格顯示捷徑、最近筆記和資料夾結構。列表窗格顯示筆記列表。',
                options: {
                    navigation: '導覽窗格',
                    files: '列表窗格'
                }
            },
            toolbarButtons: {
                name: '工具列按鈕',
                desc: '選擇在工具列中顯示哪些按鈕。隱藏的按鈕仍可透過命令和選單存取。',
                navigationLabel: '導覽工具列',
                listLabel: '列表工具列'
            },
            autoRevealActiveNote: {
                name: '自動定位使用中的筆記',
                desc: '從快速切換器、連結或搜尋開啟筆記時自動顯示。'
            },
            autoRevealIgnoreRightSidebar: {
                name: '忽略右側邊欄事件',
                desc: '在右側邊欄中點按或變更筆記時不變更使用中的筆記。'
            },
            paneTransitionDuration: {
                name: '單窗格動畫',
                desc: '在單窗格模式下切換窗格時的過渡持續時間（毫秒）。',
                resetTooltip: '重設為預設值'
            },
            autoSelectFirstFileOnFocusChange: {
                name: '自動選擇第一個筆記（僅桌面端）',
                desc: '切換資料夾或標籤時自動開啟第一個筆記。'
            },
            skipAutoScroll: {
                name: '停用捷徑自動捲動',
                desc: '點按捷徑中的項目時不捲動導覽面板。'
            },
            autoExpandFoldersTags: {
                name: '選取時展開',
                desc: '選取時展開資料夾和標籤。在單窗格模式下，首次選取展開，再次選取顯示檔案。'
            },
            springLoadedFolders: {
                name: '拖曳時展開（僅桌面端）',
                desc: '拖曳操作中懸停時展開資料夾和標籤。'
            },
            springLoadedFoldersInitialDelay: {
                name: '首次展開延遲',
                desc: '拖曳時首次展開資料夾或標籤前的延遲（秒）。'
            },
            springLoadedFoldersSubsequentDelay: {
                name: '後續展開延遲',
                desc: '同一次拖曳中展開更多資料夾或標籤前的延遲（秒）。'
            },
            navigationBanner: {
                name: '導覽橫幅（保險庫設定檔）',
                desc: '在導覽窗格頂部顯示一張圖片。隨所選保險庫設定檔而變化。',
                current: '目前橫幅：{path}',
                chooseButton: '選擇圖片'
            },
            showShortcuts: {
                name: '顯示捷徑',
                desc: '在導覽窗格中顯示捷徑區段。'
            },
            shortcutBadgeDisplay: {
                name: '捷徑徽章',
                desc: '在捷徑旁邊顯示的內容。使用「開啟捷徑 1-9」命令可直接開啟捷徑。',
                options: {
                    index: '位置 (1-9)',
                    count: '項目計數',
                    none: '無'
                }
            },
            showRecentNotes: {
                name: '顯示最近筆記',
                desc: '在導覽窗格中顯示最近筆記區段。'
            },
            recentNotesCount: {
                name: '最近筆記數量',
                desc: '要顯示的最近筆記數量。'
            },
            pinRecentNotesWithShortcuts: {
                name: '將最近筆記與捷徑一起釘選',
                desc: '釘選捷徑時包含最近筆記。'
            },
            showTooltips: {
                name: '顯示工具提示',
                desc: '懸停時顯示筆記和資料夾的額外資訊工具提示。'
            },
            showTooltipPath: {
                name: '顯示路徑',
                desc: '在工具提示中的筆記名稱下方顯示資料夾路徑。'
            },
            resetPaneSeparator: {
                name: '重設面板分隔符位置',
                desc: '將導覽面板和列表面板之間的可拖曳分隔符重設為預設位置。',
                buttonText: '重設分隔符',
                notice: '分隔符位置已重設。重新啟動 Obsidian 或重新開啟 Notebook Navigator 以套用。'
            },
            multiSelectModifier: {
                name: '多選修飾鍵（僅桌面端）',
                desc: '選擇哪個修飾鍵切換多選模式。選擇 Option/Alt 時，Cmd/Ctrl 點按會在新分頁中開啟筆記。',
                options: {
                    cmdCtrl: 'Cmd/Ctrl 點按',
                    optionAlt: 'Option/Alt 點按'
                }
            },
            excludedNotes: {
                name: '隱藏筆記（保險庫設定檔）',
                desc: '逗號分隔的前置中繼資料屬性列表。包含任何這些屬性的筆記將被隱藏（例如：draft, private, archived）。',
                placeholder: 'draft, private'
            },
            excludedFileNamePatterns: {
                name: '隱藏檔案（保險庫設定檔）',
                desc: '逗號分隔的檔名模式列表，用於隱藏檔案。支援 * 萬用字元和 / 路徑（例如：temp-*、*.png、/assets/*）。',
                placeholder: 'temp-*, *.png, /assets/*'
            },
            vaultProfiles: {
                name: '保險庫設定檔',
                desc: '設定檔儲存檔案類型可見性、隱藏檔案、隱藏資料夾、隱藏標籤、隱藏筆記、捷徑和導覽橫幅。從導覽窗格標題切換設定檔。',
                defaultName: '預設',
                addButton: '新增設定檔',
                editProfilesButton: '編輯設定檔',
                addProfileOption: '新增設定檔...',
                applyButton: '套用',
                deleteButton: '刪除設定檔',
                addModalTitle: '新增設定檔',
                editProfilesModalTitle: '編輯設定檔',
                addModalPlaceholder: '設定檔名稱',
                deleteModalTitle: '刪除 {name}',
                deleteModalMessage: '刪除 {name}？儲存在此設定檔中的隱藏檔案、資料夾、標籤和筆記篩選器將被刪除。',
                moveUp: '上移',
                moveDown: '下移',
                errors: {
                    emptyName: '請輸入設定檔名稱',
                    duplicateName: '設定檔名稱已存在'
                }
            },
            vaultTitle: {
                name: '保險庫標題位置（僅桌面端）',
                desc: '選擇保險庫標題顯示的位置。',
                options: {
                    header: '顯示在標題列',
                    navigation: '顯示在導覽窗格'
                }
            },
            excludedFolders: {
                name: '隱藏資料夾（保險庫設定檔）',
                desc: '逗號分隔的要隱藏的資料夾列表。名稱模式：assets*（以 assets 開頭的資料夾），*_temp（以 _temp 結尾）。路徑模式：/archive（僅根目錄 archive），/res*（以 res 開頭的根資料夾），/*/temp（一級目錄下的 temp 資料夾），/projects/*（projects 內的所有資料夾）。',
                placeholder: 'templates, assets*, /archive, /res*'
            },
            fileVisibility: {
                name: '顯示檔案類型（保險庫設定檔）',
                desc: '篩選在導覽器中顯示的檔案類型。Obsidian 不支援的檔案類型可能會在外部應用程式中開啟。',
                options: {
                    documents: '文件 (.md, .canvas, .base)',
                    supported: '支援（在 Obsidian 中開啟）',
                    all: '全部（可能外部開啟）'
                }
            },
            homepage: {
                name: '首頁',
                desc: '選擇自動開啟的檔案，例如儀表板。',
                current: '目前：{path}',
                currentMobile: '行動裝置：{path}',
                chooseButton: '選擇檔案',

                separateMobile: {
                    name: '單獨的行動裝置首頁',
                    desc: '為行動裝置使用不同的首頁。'
                }
            },
            showFileDate: {
                name: '顯示日期',
                desc: '在筆記名稱下方顯示日期。'
            },
            alphabeticalDateMode: {
                name: '按名稱排序時',
                desc: '筆記按字母順序排序時顯示的日期。',
                options: {
                    created: '建立日期',
                    modified: '修改日期'
                }
            },
            showFileTags: {
                name: '顯示檔案標籤',
                desc: '在檔案項目中顯示可點按的標籤。'
            },
            showFileTagAncestors: {
                name: '顯示完整標籤路徑',
                desc: "顯示完整的標籤層級路徑。啟用：'ai/openai'，'工作/專案/2024'。停用：'openai'，'2024'。"
            },
            colorFileTags: {
                name: '為檔案標籤著色',
                desc: '將標籤顏色套用於檔案項目中的標籤徽章。'
            },
            prioritizeColoredFileTags: {
                name: '優先顯示彩色標籤',
                desc: '將彩色標籤排列在其他標籤之前。'
            },
            showFileTagsInCompactMode: {
                name: '在精簡模式中顯示檔案標籤',
                desc: '當日期、預覽和圖片被隱藏時顯示標籤。'
            },
            customPropertyType: {
                name: '類型',
                desc: '選擇要在檔案項目中顯示的自訂屬性。',
                options: {
                    frontmatter: '前置中繼資料屬性',
                    wordCount: '字數統計',
                    none: '無'
                }
            },
            customPropertyFields: {
                name: '要顯示的屬性',
                desc: '以逗號分隔的前置中繼資料屬性清單，用於顯示為標籤。清單值屬性每個值顯示一個標籤。[[wikilink]] 格式的值會顯示為可點擊連結。',
                placeholder: 'status, type, category'
            },
            customPropertyColorFields: {
                name: '顏色屬性',
                desc: '以逗號分隔的前置中繼資料屬性清單，用於標籤顏色。顏色屬性按位置與顯示屬性配對。清單值屬性按索引配對顏色。值可以是標籤名稱或 CSS 顏色。',
                placeholder: 'statusColor, typeColor, categoryColor'
            },
            showCustomPropertyInCompactMode: {
                name: '在精簡模式中顯示自訂屬性',
                desc: '當日期、預覽和圖片被隱藏時顯示自訂屬性。'
            },
            dateFormat: {
                name: '日期格式',
                desc: '用於顯示日期的格式（使用 date-fns 格式）。',
                placeholder: 'yyyy年M月d日',
                help: '常用格式：\nyyyy年M月d日 = 2022年5月25日\nyyyy-MM-dd = 2022-05-25\nMM/dd/yyyy = 05/25/2022\n\n標記：\nyyyy/yy = 年\nMMMM/MMM/MM/M = 月\ndd/d = 日\nEEEE/EEE = 星期',
                helpTooltip: '點按查看格式參考'
            },
            timeFormat: {
                name: '時間格式',
                desc: '用於顯示時間的格式（使用 date-fns 格式）。',
                placeholder: 'HH:mm',
                help: '常用格式：\nHH:mm = 14:30（24小時制）\nh:mm a = 2:30 PM（12小時制）\nHH:mm:ss = 14:30:45\nh:mm:ss a = 2:30:45 PM\n\n標記：\nHH/H = 24小時制\nhh/h = 12小時制\nmm = 分鐘\nss = 秒\na = 上午/下午',
                helpTooltip: '點按查看格式參考'
            },
            showFilePreview: {
                name: '顯示筆記預覽',
                desc: '在筆記名稱下方顯示預覽文字。'
            },
            skipHeadingsInPreview: {
                name: '預覽中跳過標題',
                desc: '產生預覽文字時跳過標題行。'
            },
            skipCodeBlocksInPreview: {
                name: '預覽中跳過程式碼區塊',
                desc: '產生預覽文字時跳過程式碼區塊。'
            },
            stripHtmlInPreview: {
                name: '移除預覽中的 HTML',
                desc: '從預覽文字中移除 HTML 標籤。可能會影響大型筆記的效能。'
            },
            previewProperties: {
                name: '預覽屬性',
                desc: '用於尋找預覽文字的前置屬性的逗號分隔列表。將使用第一個包含文字的屬性。',
                placeholder: '摘要, 描述, 概要',
                info: '如果在指定的屬性中找不到預覽文字，預覽將從筆記內容中產生。'
            },
            previewRows: {
                name: '預覽行數',
                desc: '預覽文字顯示的行數。',
                options: {
                    '1': '1 行',
                    '2': '2 行',
                    '3': '3 行',
                    '4': '4 行',
                    '5': '5 行'
                }
            },
            fileNameRows: {
                name: '標題行數',
                desc: '筆記標題顯示的行數。',
                options: {
                    '1': '1 行',
                    '2': '2 行'
                }
            },
            showFeatureImage: {
                name: '顯示特色圖片',
                desc: '顯示筆記中找到的第一張圖片的縮圖。'
            },
            forceSquareFeatureImage: {
                name: '強制正方形特色圖片',
                desc: '將特色圖片呈現為正方形縮圖。'
            },
            featureImageProperties: {
                name: '圖片屬性',
                desc: '用於縮圖的前置中繼資料屬性的逗號分隔列表。',
                placeholder: 'thumbnail, featureResized, feature'
            },

            downloadExternalFeatureImages: {
                name: '下載外部圖片',
                desc: '下載遠端圖片和 YouTube 縮圖作為特色圖片。'
            },
            showRootFolder: {
                name: '顯示根資料夾',
                desc: '在樹狀結構中顯示根資料夾名稱。'
            },
            showFolderIcons: {
                name: '顯示資料夾圖示',
                desc: '在導覽窗格的資料夾旁顯示圖示。'
            },
            inheritFolderColors: {
                name: '繼承資料夾顏色',
                desc: '子資料夾從父資料夾繼承顏色。'
            },
            showNoteCount: {
                name: '顯示筆記數',
                desc: '在每個資料夾和標籤旁顯示筆記數量。'
            },
            showSectionIcons: {
                name: '顯示捷徑和最近項目的圖示',
                desc: '顯示導覽區段（如捷徑和最近檔案）的圖示。'
            },
            interfaceIcons: {
                name: '介面圖示',
                desc: '編輯工具列、資料夾、標籤、釘選、搜尋和排序圖示。',
                buttonText: '編輯圖示'
            },
            showIconsColorOnly: {
                name: '僅對圖示套用顏色',
                desc: '啟用時，自訂顏色僅套用於圖示。停用時，顏色將同時套用於圖示和文字標籤。'
            },
            collapseBehavior: {
                name: '摺疊項目',
                desc: '選擇展開/摺疊全部按鈕影響的內容。',
                options: {
                    all: '所有資料夾和標籤',
                    foldersOnly: '僅資料夾',
                    tagsOnly: '僅標籤'
                }
            },
            smartCollapse: {
                name: '保持選取項展開',
                desc: '摺疊時，保持目前選取的資料夾或標籤及其父級展開。'
            },
            navIndent: {
                name: '樹狀縮排',
                desc: '調整巢狀資料夾和標籤的縮排寬度。'
            },
            navItemHeight: {
                name: '行高',
                desc: '調整導覽窗格中資料夾和標籤的高度。'
            },
            navItemHeightScaleText: {
                name: '隨行高調整文字大小',
                desc: '降低行高時減小導覽文字大小。'
            },
            navRootSpacing: {
                name: '根級項目間距',
                desc: '根級資料夾和標籤之間的間距。'
            },
            showTags: {
                name: '顯示標籤',
                desc: '在導覽器中顯示標籤區段。'
            },
            showTagIcons: {
                name: '顯示標籤圖示',
                desc: '在導覽窗格的標籤旁顯示圖示。'
            },
            inheritTagColors: {
                name: '繼承標籤顏色',
                desc: '子標籤從父標籤繼承顏色。'
            },
            tagSortOrder: {
                name: '標籤排序方式',
                desc: '選擇導覽窗格中的標籤排序順序。（不同步）',
                options: {
                    alphaAsc: 'A 到 Z',
                    alphaDesc: 'Z 到 A',
                    frequencyAsc: '頻率（從低到高）',
                    frequencyDesc: '頻率（從高到低）'
                }
            },
            showAllTagsFolder: {
                name: '顯示標籤資料夾',
                desc: '將「標籤」顯示為可摺疊資料夾。'
            },
            showUntagged: {
                name: '顯示無標籤筆記',
                desc: '為沒有任何標籤的筆記顯示「無標籤」項目。'
            },
            keepEmptyTagsProperty: {
                name: '刪除最後一個標籤後保留 tags 屬性',
                desc: '當所有標籤被刪除時保留 frontmatter 中的 tags 屬性。停用時，tags 屬性將從 frontmatter 中刪除。'
            },
            hiddenTags: {
                name: '隱藏標籤（保險庫設定檔）',
                desc: '逗號分隔的標籤模式列表。名稱模式：tag*（以...開頭）、*tag（以...結尾）。路徑模式：archive（標籤及其後代）、archive/*（僅後代）、projects/*/drafts（中間萬用字元）。',
                placeholder: 'archive*, *draft, projects/*/old'
            },
            enableFolderNotes: {
                name: '啟用資料夾筆記',
                desc: '啟用後，具有關聯筆記的資料夾將顯示為可點按的連結。'
            },
            folderNoteType: {
                name: '預設資料夾筆記類型',
                desc: '從右鍵選單建立的資料夾筆記類型。',
                options: {
                    ask: '建立時詢問',
                    markdown: 'Markdown',
                    canvas: 'Canvas',
                    base: 'Base'
                }
            },
            folderNoteName: {
                name: '資料夾筆記名稱',
                desc: '資料夾筆記的名稱。留空以使用與資料夾相同的名稱。',
                placeholder: 'index'
            },
            folderNoteProperties: {
                name: '資料夾筆記屬性',
                desc: '新增到新資料夾筆記的 YAML 前置內容。--- 標記會自動新增。',
                placeholder: 'theme: dark\nfoldernote: true'
            },
            hideFolderNoteInList: {
                name: '在列表中隱藏資料夾筆記',
                desc: '隱藏資料夾筆記，使其不出現在資料夾的筆記列表中。'
            },
            pinCreatedFolderNote: {
                name: '釘選建立的資料夾筆記',
                desc: '從右鍵選單建立資料夾筆記時自動釘選。'
            },
            confirmBeforeDelete: {
                name: '刪除前確認',
                desc: '刪除筆記或資料夾時顯示確認對話方塊'
            },
            metadataCleanup: {
                name: '清理中繼資料',
                desc: '移除在 Obsidian 外部刪除、移動或重新命名檔案、資料夾或標籤時留下的孤立中繼資料。這僅影響 Notebook Navigator 設定檔案。',
                buttonText: '清理中繼資料',
                error: '設定清理失敗',
                loading: '正在檢查中繼資料...',
                statusClean: '沒有需要清理的中繼資料',
                statusCounts: '孤立項目：{folders} 資料夾，{tags} 標籤，{files} 檔案，{pinned} 釘選，{separators} 分隔線'
            },
            rebuildCache: {
                name: '重建快取',
                desc: '如果出現標籤缺失、預覽不正確或圖片缺失，請使用此功能。這可能在同步衝突或意外關閉後發生。',
                buttonText: '重建快取',
                error: '重建快取失敗',
                indexingTitle: '正在索引保險庫...',
                progress: '正在更新 Notebook Navigator 快取.'
            },
            hotkeys: {
                intro: '透過編輯 <plugin folder>/notebook-navigator/data.json 來自訂 Notebook Navigator 快速鍵。用文字編輯器開啟檔案並找到 "keyboardShortcuts" 區段。每個條目都使用以下結構：',
                example: '"pane:move-up": [ { "key": "ArrowUp", "modifiers": [] }, { "key": "K", "modifiers": [] } ]',
                modifierList: [
                    '"Mod" = Cmd (macOS) / Ctrl (Win/Linux)',
                    '"Alt" = Alt/Option',
                    '"Shift" = Shift',
                    '"Ctrl" = Control（跨平台建議使用 "Mod"）'
                ],
                guidance:
                    '如上方範例所示，需要額外按鍵時可為同一命令新增多條對應。若需組合多個修飾鍵，請在同一條目中列出所有值，例如 "modifiers": ["Mod", "Shift" ]。不支援 "gg" 或 "dd" 這類按鍵序列。編輯完成後，請重新載入 Obsidian。'
            },
            externalIcons: {
                downloadButton: '下載',
                downloadingLabel: '正在下載...',
                removeButton: '移除',
                statusInstalled: '已下載（版本 {version}）',
                statusNotInstalled: '未下載',
                versionUnknown: '未知',
                downloadFailed: '下載 {name} 失敗。請檢查您的連線並重試。',
                removeFailed: '移除 {name} 失敗。',
                infoNote:
                    '下載的圖示包會在裝置之間同步安裝狀態。圖示包儲存在每個裝置的本機資料庫中；同步僅追蹤它們是否應該被下載或移除。圖示包從 Notebook Navigator 儲存庫下載 (https://github.com/johansan/notebook-navigator/tree/main/icon-assets)。'
            },
            useFrontmatterDates: {
                name: '使用前置中繼資料',
                desc: '使用前置設定筆記名稱、時間戳記、圖示和顏色'
            },
            frontmatterNameField: {
                name: '名稱欄位（多個）',
                desc: '逗號分隔的前置欄位列表。使用第一個非空值。回退到檔名。',
                placeholder: '標題, 名稱'
            },
            frontmatterIconField: {
                name: '圖示欄位',
                desc: '檔案圖示的前置欄位。留空使用儲存在設定中的圖示。',
                placeholder: 'icon'
            },
            frontmatterColorField: {
                name: '顏色欄位',
                desc: '檔案顏色的前置欄位。留空使用儲存在設定中的顏色。',
                placeholder: 'color'
            },
            frontmatterSaveMetadata: {
                name: '將圖示和顏色儲存到前置',
                desc: '使用上面設定的欄位自動將檔案圖示和顏色寫入前置。'
            },
            frontmatterMigration: {
                name: '從設定遷移圖示和顏色',
                desc: '儲存在設定中：{icons} 個圖示，{colors} 種顏色。',
                button: '遷移',
                buttonWorking: '正在遷移...',
                noticeNone: '設定中未儲存任何檔案圖示或顏色。',
                noticeDone: '已遷移 {migratedIcons}/{icons} 個圖示，{migratedColors}/{colors} 種顏色。',
                noticeFailures: '失敗的條目：{failures}。',
                noticeError: '遷移失敗。請檢查主控台以取得詳細資訊。'
            },
            frontmatterCreatedField: {
                name: '建立時間戳記欄位',
                desc: '建立時間戳記的前置欄位名稱。留空僅使用檔案系統日期。',
                placeholder: '建立時間'
            },
            frontmatterModifiedField: {
                name: '修改時間戳記欄位',
                desc: '修改時間戳記的前置欄位名稱。留空僅使用檔案系統日期。',
                placeholder: '修改時間'
            },
            frontmatterDateFormat: {
                name: '時間戳記格式',
                desc: '用於解析前置中時間戳記的格式。留空使用 ISO 8601 格式',
                helpTooltip: '查看 date-fns 格式文件',
                help: "常用格式:\nyyyy-MM-dd'T'HH:mm:ss → 2025-01-04T14:30:45\nyyyy-MM-dd'T'HH:mm:ssXXX → 2025-08-07T16:53:39+02:00\ndd/MM/yyyy HH:mm:ss → 04/01/2025 14:30:45\nMM/dd/yyyy h:mm:ss a → 01/04/2025 2:30:45 PM"
            },
            supportDevelopment: {
                name: '支持開發',
                desc: '如果您喜歡使用筆記本導覽器，請考慮支持其持續開發。',
                buttonText: '❤️ 贊助',
                coffeeButton: '☕️ 請我喝咖啡'
            },
            updateCheckOnStart: {
                name: '啟動時檢查新版本',
                desc: '啟動時檢查新的外掛版本，當有可用更新時顯示通知。每個版本僅通知一次，檢查最多每天一次。',
                status: '有新版本可用：{version}'
            },
            whatsNew: {
                name: 'Notebook Navigator {version} 的最新動態',
                desc: '查看最近的更新和改進',
                buttonText: '查看最近更新'
            },
            masteringVideo: {
                name: '精通 Notebook Navigator（影片）',
                desc: '本影片涵蓋了在 Notebook Navigator 中高效工作所需的一切內容，包括快速鍵、搜尋、標籤和進階自訂。'
            },
            cacheStatistics: {
                localCache: '本機快取',
                items: '項',
                withTags: '包含標籤',
                withPreviewText: '包含預覽文字',
                withFeatureImage: '包含特色圖片',
                withMetadata: '包含中繼資料'
            },
            metadataInfo: {
                successfullyParsed: '成功解析',
                itemsWithName: '個帶名稱的項目',
                withCreatedDate: '個帶建立日期',
                withModifiedDate: '個帶修改日期',
                withIcon: '個帶圖示',
                withColor: '個帶顏色',
                failedToParse: '解析失敗',
                createdDates: '個建立日期',
                modifiedDates: '個修改日期',
                checkTimestampFormat: '請檢查您的時間戳記格式。',
                exportFailed: '匯出錯誤'
            }
        }
    },
    whatsNew: {
        title: 'Notebook Navigator 的新功能',
        supportMessage: '如果您覺得 Notebook Navigator 有用，請考慮支持其開發。',
        supportButton: '請我喝咖啡',
        thanksButton: '謝謝！'
    }
};
